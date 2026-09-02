"""
Rewards & Referral system for HIP-4 outcome markets.

Tables (Supabase):
  - user_rewards     : per-user state (points, tier, volume, referral code, achievements)
  - point_transactions: append-only ledger of point earn/spend events
  - referrals        : referrer ↔ referee tracking

Volume is outcome-fill notional (px * sz on # / + coins) on this wallet.
It is not HL's fee-paying 14-day tier volume and not perp/HIP-3 fills.

Tier ladder discounts OUR builder fee only (tenths-of-bps), not HL protocol fees.
Point gates stay high enough that referrals alone cannot reach Gold.
Volume dollar rungs are scaled for unlevered outcomes (~5–6× below the old perp ladder).
"""

from __future__ import annotations

import asyncio
import logging
import random
import string
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────── #
# Tier definitions
# ──────────────────────────────────────────────────────────────────────────── #

# fee_discount_tenths is in tenths-of-a-basis-point (1 tenth = 0.1 bps = 0.001%).
# The discount is subtracted from BUILDER_FEE (30 tenths = 3 bps = 0.030%) at
# trade time: effective_fee = max(0, BUILDER_FEE - discount). So a discount of 30
# zeroes the builder surcharge entirely (user still pays Hyperliquid protocol
# fees on outcome close/settle — those are not ours and are not discounted here).
#
#   • Diamond gives back HALF the builder fee (we still keep 0.015%).
#   • Legend keeps a token 0.005% builder fee (25 of 30 tenths waived).
#
# IMPORTANT: this ladder is duplicated in award_points_atomic() in
# backend/supabase_schema.sql (and the user_rewards.tier CHECK constraint).
# Keep all three in sync when editing.
TIERS: List[Dict[str, Any]] = [
    {"name": "bronze",   "min_points": 0,       "fee_discount_tenths": 0},
    {"name": "silver",   "min_points": 3_000,   "fee_discount_tenths": 5},   # 0.005%
    {"name": "gold",     "min_points": 10_000,  "fee_discount_tenths": 10},  # 0.010%
    {"name": "diamond",  "min_points": 50_000,  "fee_discount_tenths": 15},  # 0.015%
    {"name": "legend", "min_points": 150_000, "fee_discount_tenths": 25},  # 0.025% off → 0.005% builder left
]

# ──────────────────────────────────────────────────────────────────────────── #
# Volume milestones (cumulative USD traded)
# ──────────────────────────────────────────────────────────────────────────── #

VOLUME_MILESTONES: List[Dict[str, Any]] = [
    {"threshold":         500, "label": "$500"},
    {"threshold":       2_000, "label": "$2K"},
    {"threshold":       5_000, "label": "$5K"},
    {"threshold":      10_000, "label": "$10K"},
    {"threshold":      25_000, "label": "$25K"},
    {"threshold":      50_000, "label": "$50K"},
    {"threshold":     100_000, "label": "$100K"},
    {"threshold":     250_000, "label": "$250K"},
    {"threshold":     500_000, "label": "$500K"},
    {"threshold":   1_000_000, "label": "$1M"},
    {"threshold":   2_500_000, "label": "$2.5M"},
    {"threshold":   5_000_000, "label": "$5M"},
]

# ──────────────────────────────────────────────────────────────────────────── #
# Achievement definitions
# ──────────────────────────────────────────────────────────────────────────── #

# OG badge cutoff — anyone who trades ≥ $1K before this date gets the badge
OG_CUTOFF = datetime(2026, 9, 30, 23, 59, 59, tzinfo=timezone.utc)
OG_VOLUME_THRESHOLD = 1_000  # USD

# Anti-Sybil: a referral only "qualifies" (pays the referrer) once the referee
# trades a meaningful amount, not on a throwaway $1 first trade. Without this a
# spammer could fund N fresh wallets with a few dollars, do one tiny trade each,
# and farm 200 pts/referral for ~gas cost. $100 keeps onboarding easy while
# making mass-Sybil uneconomical.
REFERRAL_QUALIFY_VOLUME_USD = 100  # USD lifetime volume by the referee

# Referral points are the only tier-points source that does not require the
# account holder to trade, so it's the prime Sybil vector. Cap the 200-pt
# bonus at the first N referrals (aligned with referral_20). Referrals alone:
#   20×200 (bonus) + 3,700 (referral_1/5/10/20) + 200 (got_referred) ≈ 7,900
# — below Gold (10,000). A pure referral farmer tops out at Silver.
REFERRAL_BONUS_MAX_COUNT = 20

# Defense-in-depth on HL fill rows (API is trusted; reject malformed notionals).
OUTCOME_PX_MAX = 1.05
MAX_FILL_NOTIONAL_USD = 2_000_000.0
MAX_SYNC_NOTIONAL_USD = 10_000_000.0

ACHIEVEMENTS = {
    "og":            {"category": "trading", "points": 1_000,  "title": "OG",              "desc": "Early adopter — traded $1K+ before Sep 30 '26"},
    "first_trade":   {"category": "trading", "points": 100,    "title": "First Trade",     "desc": "Complete your first trade"},
    "referral_1":    {"category": "trading", "points": 200,    "title": "Connector",       "desc": "Refer 1 friend who trades $100"},
    "referral_5":    {"category": "trading", "points": 500,    "title": "Networker",       "desc": "Refer 5 friends who trade $100"},
    "referral_10":   {"category": "trading", "points": 1_000,  "title": "Ambassador",      "desc": "Refer 10 friends who trade $100"},
    "referral_20":   {"category": "trading", "points": 2_000,  "title": "Evangelist",      "desc": "Refer 20 friends who trade $100"},
    "vol_500":       {"category": "trading", "points": 200,    "title": "Getting Started", "desc": "Trade $500 in volume"},
    "vol_2k":        {"category": "trading", "points": 400,    "title": "Momentum",        "desc": "Trade $2K in volume"},
    "vol_5k":        {"category": "trading", "points": 800,    "title": "Warming Up",      "desc": "Trade $5K in volume"},
    "vol_10k":       {"category": "trading", "points": 1_200,  "title": "On a Roll",       "desc": "Trade $10K in volume"},
    "vol_25k":       {"category": "trading", "points": 1_800,  "title": "Active Trader",   "desc": "Trade $25K in volume"},
    "vol_50k":       {"category": "trading", "points": 2_500,  "title": "Serious Trader",  "desc": "Trade $50K in volume"},
    "vol_100k":      {"category": "trading", "points": 4_000,  "title": "High Roller",     "desc": "Trade $100K in volume"},
    "vol_250k":      {"category": "trading", "points": 10_000, "title": "Power Trader",    "desc": "Trade $250K in volume"},
    "vol_500k":      {"category": "trading", "points": 15_000, "title": "Elite Trader",    "desc": "Trade $500K in volume"},
    "vol_1m":        {"category": "trading", "points": 25_000, "title": "Whale",           "desc": "Trade $1M in volume"},
    "vol_2_5m":      {"category": "trading", "points": 50_000, "title": "Leviathan",       "desc": "Trade $2.5M in volume"},
    "vol_5m":        {"category": "trading", "points": 50_000, "title": "Titan",           "desc": "Trade $5M in volume"},
    "got_referred":  {"category": "trading", "points": 200,    "title": "Welcome Aboard",  "desc": "Join via a referral code"},
}

# ──────────────────────────────────────────────────────────────────────────── #
# Pydantic models
# ──────────────────────────────────────────────────────────────────────────── #

class RewardsProfile(BaseModel):
    wallet_address: str
    referral_code: str
    total_points: int = 0
    tier: str = "bronze"
    fee_discount_tenths: int = 0
    lifetime_volume_usd: float = 0
    lifetime_cash_volume_usd: float = 0
    referral_count: int = 0
    achievements: List[str] = []
    # Computed for the frontend
    next_tier: Optional[str] = None
    points_to_next_tier: int = 0
    next_volume_milestone: Optional[Dict[str, Any]] = None
    volume_progress_pct: float = 0.0  # 0–100
    next_cash_volume_milestone: Optional[Dict[str, Any]] = None
    cash_volume_progress_pct: float = 0.0  # 0–100
    tier_list: List[Dict[str, Any]] = []


class ApplyReferralRequest(BaseModel):
    wallet_address: str
    referral_code: str


class ReferralInfo(BaseModel):
    referee_wallet: str
    status: str
    created_at: str
    qualified_at: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────── #
# Helpers
# ──────────────────────────────────────────────────────────────────────────── #

def _generate_referral_code() -> str:
    """Generate a 6-char alphanumeric code like 'OC-A3F2X9'. Existing HT- codes still apply."""
    chars = string.ascii_uppercase + string.digits
    suffix = "".join(random.choices(chars, k=6))
    return f"OC-{suffix}"


def _compute_tier(total_points: int) -> Tuple[str, int]:
    """Return (tier_name, fee_discount_tenths) for the given point total."""
    result_tier = TIERS[0]
    for t in TIERS:
        if total_points >= t["min_points"]:
            result_tier = t
    return result_tier["name"], result_tier["fee_discount_tenths"]


def _next_tier_info(total_points: int) -> Tuple[Optional[str], int]:
    """Return (next_tier_name, points_needed) or (None, 0) if max tier."""
    for t in TIERS:
        if total_points < t["min_points"]:
            return t["name"], t["min_points"] - total_points
    return None, 0


# Map milestone thresholds → achievement keys (for looking up points)
_THRESHOLD_TO_ACH: Dict[int, str] = {
    500: "vol_500", 2_000: "vol_2k", 5_000: "vol_5k",
    10_000: "vol_10k", 25_000: "vol_25k", 50_000: "vol_50k",
    100_000: "vol_100k", 250_000: "vol_250k", 500_000: "vol_500k",
    1_000_000: "vol_1m", 2_500_000: "vol_2_5m", 5_000_000: "vol_5m",
}

def _next_volume_milestone(volume: float) -> Tuple[Optional[Dict[str, Any]], float]:
    """Return (next_milestone_dict with achievement points, progress_pct 0–100)."""
    prev_threshold = 0.0
    for m in VOLUME_MILESTONES:
        if volume < m["threshold"]:
            span = m["threshold"] - prev_threshold
            progress = ((volume - prev_threshold) / span) * 100 if span > 0 else 0
            # Include achievement points so frontend can display them
            ach_key = _THRESHOLD_TO_ACH.get(m["threshold"])
            pts = ACHIEVEMENTS[ach_key]["points"] if ach_key and ach_key in ACHIEVEMENTS else 0
            return {**m, "points": pts}, min(progress, 100.0)
        prev_threshold = m["threshold"]
    # All milestones completed
    return None, 100.0


def is_outcome_fill_coin(coin: Any) -> bool:
    """HIP-4 fill coins are ``#<encoding>`` or ``+<encoding>`` (digits only)."""
    raw = str(coin or "").strip()
    if len(raw) < 2 or raw[0] not in "#+":
        return False
    return raw[1:].isdigit()


def sum_outcome_fills(fills: Any) -> Tuple[float, int]:
    """(outcome_notional_usd, latest_fill_ms).

    Latest timestamp includes non-outcome fills so the sync cursor still
    advances past perp/spot rows and we do not re-fetch the same window.
    Outcome notional is ``px * sz`` for well-formed HIP-4 coins only.
    """
    verified = 0.0
    latest = 0
    if not isinstance(fills, list):
        return 0.0, 0
    for fill in fills:
        if not isinstance(fill, dict):
            continue
        try:
            fill_ts = int(fill.get("time", 0) or 0)
        except (TypeError, ValueError):
            continue
        if fill_ts > latest:
            latest = fill_ts
        if not is_outcome_fill_coin(fill.get("coin")):
            continue
        try:
            px = float(fill.get("px", 0))
            sz = abs(float(fill.get("sz", 0)))
        except (TypeError, ValueError):
            continue
        if px <= 0 or px > OUTCOME_PX_MAX or sz <= 0:
            continue
        notional = px * sz
        if notional > MAX_FILL_NOTIONAL_USD:
            continue
        verified += notional
    if verified > MAX_SYNC_NOTIONAL_USD:
        verified = MAX_SYNC_NOTIONAL_USD
    return verified, latest


# ──────────────────────────────────────────────────────────────────────────── #
# Core logic
# ──────────────────────────────────────────────────────────────────────────── #

async def ensure_rewards_profile(supabase, wallet_address: str) -> Dict[str, Any]:
    """Get or create the user_rewards row. Returns the row dict.

    Safe under concurrent replicas: if two replicas both try to create a
    profile for the same wallet, one wins on the wallet_address PK and the
    other falls through to the re-select branch instead of throwing.
    """
    wallet = wallet_address.lower()
    result = await asyncio.to_thread(lambda: (
        supabase.table("user_rewards")
        .select("*")
        .eq("wallet_address", wallet)
        .execute()
    ))
    if result.data and len(result.data) > 0:
        return result.data[0]

    # Create new profile with unique referral code
    for _ in range(10):
        code = _generate_referral_code()
        try:
            result = await asyncio.to_thread(lambda: (
                supabase.table("user_rewards")
                .insert({
                    "wallet_address": wallet,
                    "referral_code": code,
                    "total_points": 0,
                    "tier": "bronze",
                    "lifetime_volume_usd": 0,
                    "referral_count": 0,
                    "achievements": [],
                    "fee_discount_tenths": 0,
                    "last_volume_sync_at": 0,
                })
                .execute()
            ))
            logger.info("Created rewards profile for %s with code %s", wallet[:10], code)
            return result.data[0]
        except Exception as e:
            err = str(e).lower()
            if "unique" in err or "duplicate" in err:
                # Could be either (a) referral_code collision — retry with a
                # new code, or (b) wallet_address PK collision because a
                # concurrent replica already created this user's profile —
                # re-select and return the existing row.
                existing = await asyncio.to_thread(lambda: (
                    supabase.table("user_rewards")
                    .select("*")
                    .eq("wallet_address", wallet)
                    .execute()
                ))
                if existing.data and len(existing.data) > 0:
                    return existing.data[0]
                continue  # must have been a referral_code collision, retry
            raise
    raise RuntimeError("Failed to generate unique referral code after 10 attempts")


async def get_rewards_profile(supabase, wallet_address: str) -> RewardsProfile:
    """Return the full rewards profile with computed fields for the frontend."""
    row = await ensure_rewards_profile(supabase, wallet_address)
    total_pts = row.get("total_points", 0)
    volume = row.get("lifetime_volume_usd", 0) or 0
    achievements = row.get("achievements", []) or []

    tier_name, fee_discount = _compute_tier(total_pts)
    next_tier_name, pts_to_next = _next_tier_info(total_pts)
    next_vol, vol_pct = _next_volume_milestone(volume)

    return RewardsProfile(
        wallet_address=row["wallet_address"],
        referral_code=row.get("referral_code", ""),
        total_points=total_pts,
        tier=tier_name,
        fee_discount_tenths=fee_discount,
        lifetime_volume_usd=volume,
        lifetime_cash_volume_usd=0,
        referral_count=row.get("referral_count", 0),
        achievements=achievements,
        next_tier=next_tier_name,
        points_to_next_tier=pts_to_next,
        next_volume_milestone=next_vol,
        volume_progress_pct=round(vol_pct, 1),
        next_cash_volume_milestone=None,
        cash_volume_progress_pct=0.0,
        tier_list=TIERS,
    )


async def _award_points(
    supabase,
    wallet: str,
    points: int,
    reason: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> int:
    """Award points, update tier, return new total.

    Delegates the entire read-modify-write to the ``award_points_atomic``
    Postgres function so concurrent awards across multiple backend replicas
    serialize on the user_rewards row lock. Without this, two simultaneous
    calls for the same wallet would both read the old total and one write
    would silently overwrite the other — points would be lost and the tier
    could desync from total_points.
    """
    if points <= 0:
        return 0

    result = await asyncio.to_thread(lambda: (
        supabase.rpc("award_points_atomic", {
            "p_wallet": wallet,
            "p_points": points,
            "p_reason": reason,
            "p_metadata": metadata or {},
        }).execute()
    ))

    # supabase-py returns TABLE results as a list of row dicts.
    row = (result.data or [{}])[0] if isinstance(result.data, list) else (result.data or {})
    new_total = int(row.get("new_total", 0) or 0)
    new_tier = row.get("new_tier", "bronze")

    logger.info(
        "Awarded %d pts to %s (reason=%s, total=%d, tier=%s)",
        points, wallet[:10], reason, new_total, new_tier,
    )
    return new_total


async def _grant_achievement(
    supabase, wallet: str, achievement_id: str
) -> bool:
    """Grant an achievement if not already earned. Returns True if newly granted.

    The grant step uses the ``grant_achievement_atomic`` Postgres function,
    which does a single conditional UPDATE that appends the achievement only
    if it isn't already present. Exactly one of any number of concurrent
    calls for the same (wallet, achievement) pair will see FOUND=true, so
    the follow-up ``_award_points`` is guaranteed to fire at most once.
    """
    if achievement_id not in ACHIEVEMENTS:
        return False

    result = await asyncio.to_thread(lambda: (
        supabase.rpc("grant_achievement_atomic", {
            "p_wallet": wallet,
            "p_ach": achievement_id,
        }).execute()
    ))

    # Supabase returns scalar-returning RPCs as .data being the scalar itself,
    # and TABLE-returning RPCs as a list of row dicts. Handle both shapes.
    granted = False
    data = result.data
    if isinstance(data, bool):
        granted = data
    elif isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            granted = bool(first.get("granted", False))
        else:
            granted = bool(first)
    elif isinstance(data, dict):
        granted = bool(data.get("granted", False))

    if not granted:
        return False

    pts = ACHIEVEMENTS[achievement_id]["points"]
    await _award_points(supabase, wallet, pts, f"achievement:{achievement_id}")
    logger.info("Achievement '%s' granted to %s (+%d pts)", achievement_id, wallet[:10], pts)
    return True


# ──────────────────────────────────────────────────────────────────────────── #
# Public API — called from server.py / trade hooks
# ──────────────────────────────────────────────────────────────────────────── #

def _parse_rpc_row(data: Any) -> Dict[str, Any]:
    if isinstance(data, list):
        first = data[0] if data else {}
        return first if isinstance(first, dict) else {}
    if isinstance(data, dict):
        return data
    return {}


async def apply_verified_volume(
    supabase,
    wallet_address: str,
    outcome_volume_usd: float,
    expected_cursor: int,
    next_cursor: int,
    watermarks: Dict[str, Any],
) -> Dict[str, Any]:
    """Credit outcome volume + advance the fill cursor in one CAS update.

    ``expected_cursor`` must match ``user_rewards.last_volume_sync_at``.
    A concurrent replica that already advanced the cursor gets
    ``skipped=cas_conflict`` and must not treat the same fills as credited.
    """
    wallet = wallet_address.lower()
    amount = float(outcome_volume_usd or 0)
    if amount < 0:
        amount = 0.0
    if amount > MAX_SYNC_NOTIONAL_USD:
        logger.error("Refusing oversized volume credit for %s: %.2f", wallet[:10], amount)
        return {"volume_updated": 0, "new_achievements": [], "points_earned": 0, "skipped": "oversized"}

    await ensure_rewards_profile(supabase, wallet)

    rpc_result = await asyncio.to_thread(lambda: (
        supabase.rpc("credit_trade_volume_atomic", {
            "p_wallet": wallet,
            "p_amount": amount,
            "p_expected_cursor": int(expected_cursor),
            "p_next_cursor": int(next_cursor),
            "p_watermarks": watermarks,
        }).execute()
    ))
    row = _parse_rpc_row(rpc_result.data)
    if not row.get("credited"):
        return {"volume_updated": 0, "new_achievements": [], "points_earned": 0, "skipped": "cas_conflict"}

    old_volume = float(row.get("old_volume", 0) or 0)
    new_volume = float(row.get("new_volume", 0) or 0)
    return await _grant_volume_rewards(supabase, wallet, old_volume, new_volume)


async def _grant_volume_rewards(
    supabase,
    wallet: str,
    old_volume: float,
    new_volume: float,
) -> Dict[str, Any]:
    """Grant first-trade / OG / volume achievements. Each grant is atomic."""
    result = {"volume_updated": new_volume, "new_achievements": [], "points_earned": 0}

    if new_volume > 0:
        if await _grant_achievement(supabase, wallet, "first_trade"):
            result["new_achievements"].append("first_trade")
            result["points_earned"] += ACHIEVEMENTS["first_trade"]["points"]

    if datetime.now(timezone.utc) <= OG_CUTOFF and new_volume >= OG_VOLUME_THRESHOLD:
        if await _grant_achievement(supabase, wallet, "og"):
            result["new_achievements"].append("og")
            result["points_earned"] += ACHIEVEMENTS["og"]["points"]

    for threshold, ach_id in _THRESHOLD_TO_ACH.items():
        if old_volume < threshold <= new_volume:
            if await _grant_achievement(supabase, wallet, ach_id):
                result["new_achievements"].append(ach_id)
                result["points_earned"] += ACHIEVEMENTS[ach_id]["points"]

    try:
        await _qualify_referral_if_ready(supabase, wallet, new_volume)
    except Exception as e:
        logger.warning("Referral qualification check failed for %s: %s", wallet[:10], e)

    return result


async def _qualify_referral_if_ready(supabase, wallet: str, new_volume: float) -> None:
    """Flip pending → qualified once. Only the winning replica awards points."""
    if new_volume < REFERRAL_QUALIFY_VOLUME_USD:
        return

    rpc_result = await asyncio.to_thread(lambda: (
        supabase.rpc("qualify_referral_atomic", {
            "p_referee": wallet,
        }).execute()
    ))
    row = _parse_rpc_row(rpc_result.data)
    if not row.get("qualified"):
        return

    referrer = str(row.get("referrer_wallet") or "").lower()
    new_count = int(row.get("new_count") or 0)
    if not referrer:
        return

    if row.get("award_bonus"):
        await _award_points(supabase, referrer, 200, "referral_qualified", {
            "referee": wallet,
        })

    ref_ach_map = {1: "referral_1", 5: "referral_5", 10: "referral_10", 20: "referral_20"}
    if new_count in ref_ach_map:
        await _grant_achievement(supabase, referrer, ref_ach_map[new_count])

    logger.info(
        "Referral qualified: referee=%s referrer=%s (count=%d)",
        wallet[:10], referrer[:10], new_count,
    )


async def apply_referral_code(
    supabase,
    referee_wallet: str,
    referral_code: str,
) -> Dict[str, Any]:
    """Referee applies a referral code. Returns success status."""
    referee = referee_wallet.lower()
    code = referral_code.strip().upper()

    # Check if referee already has a referral
    existing = await asyncio.to_thread(lambda: (
        supabase.table("referrals")
        .select("id")
        .eq("referee_wallet", referee)
        .execute()
    ))
    if existing.data and len(existing.data) > 0:
        return {"success": False, "error": "You have already used a referral code"}

    # Find referrer by code
    referrer_result = await asyncio.to_thread(lambda: (
        supabase.table("user_rewards")
        .select("wallet_address")
        .eq("referral_code", code)
        .execute()
    ))
    if not referrer_result.data or len(referrer_result.data) == 0:
        return {"success": False, "error": "Invalid referral code"}

    referrer_wallet = referrer_result.data[0]["wallet_address"]
    if referrer_wallet == referee:
        return {"success": False, "error": "You cannot refer yourself"}

    # Ensure referee has a rewards profile
    await ensure_rewards_profile(supabase, referee)

    # Create referral record. Unique(referee_wallet) collapses a double-submit
    # across replicas into one row.
    try:
        await asyncio.to_thread(lambda: supabase.table("referrals").insert({
            "referrer_wallet": referrer_wallet,
            "referee_wallet": referee,
            "referral_code": code,
            "status": "pending",
        }).execute())
    except Exception as e:
        err = str(e).lower()
        if "unique" in err or "duplicate" in err:
            return {"success": False, "error": "You have already used a referral code"}
        raise

    await _grant_achievement(supabase, referee, "got_referred")

    # If they already have qualify-volume, don't wait for the next trade sync.
    try:
        vol_row = await asyncio.to_thread(lambda: (
            supabase.table("user_rewards")
            .select("lifetime_volume_usd")
            .eq("wallet_address", referee)
            .execute()
        ))
        existing_vol = float((vol_row.data[0].get("lifetime_volume_usd") if vol_row.data else 0) or 0)
        await _qualify_referral_if_ready(supabase, referee, existing_vol)
    except Exception as e:
        logger.warning("Post-apply referral qualify failed for %s: %s", referee[:10], e)

    logger.info("Referral applied: referee=%s code=%s referrer=%s", referee[:10], code, referrer_wallet[:10])
    return {"success": True, "referrer": referrer_wallet[:6] + "..." + referrer_wallet[-4:]}


async def get_referrals(supabase, wallet_address: str) -> List[Dict[str, Any]]:
    """Get list of users this wallet has referred."""
    wallet = wallet_address.lower()
    rows = await asyncio.to_thread(lambda: (
        supabase.table("referrals")
        .select("referee_wallet, status, created_at, qualified_at")
        .eq("referrer_wallet", wallet)
        .order("created_at", desc=True)
        .execute()
    ))
    result = []
    for r in (rows.data or []):
        referee = r.get("referee_wallet", "")
        result.append({
            "referee": referee[:6] + "..." + referee[-4:] if len(referee) > 10 else referee,
            "status": r.get("status", "pending"),
            "created_at": r.get("created_at", ""),
            "qualified_at": r.get("qualified_at"),
        })
    return result


async def get_point_history(
    supabase, wallet_address: str, limit: int = 50
) -> List[Dict[str, Any]]:
    """Get recent point transactions for a user."""
    wallet = wallet_address.lower()
    rows = await asyncio.to_thread(lambda: (
        supabase.table("point_transactions")
        .select("points, reason, metadata, created_at")
        .eq("wallet_address", wallet)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ))
    return rows.data or []


async def get_fee_discount_tenths(supabase, wallet_address: str) -> int:
    """Quick lookup of a user's fee discount. Used by builder-config endpoint."""
    wallet = wallet_address.lower()
    try:
        result = await asyncio.to_thread(lambda: (
            supabase.table("user_rewards")
            .select("fee_discount_tenths")
            .eq("wallet_address", wallet)
            .execute()
        ))
        if result.data and len(result.data) > 0:
            return result.data[0].get("fee_discount_tenths", 0) or 0
    except Exception:
        pass
    return 0


async def get_leaderboard(supabase, limit: int = 20) -> List[Dict[str, Any]]:
    """Top users by points."""
    rows = await asyncio.to_thread(lambda: (
        supabase.table("user_rewards")
        .select("wallet_address, total_points, tier, referral_count, lifetime_volume_usd")
        .order("total_points", desc=True)
        .limit(limit)
        .execute()
    ))
    result = []
    for i, r in enumerate(rows.data or []):
        w = r.get("wallet_address", "")
        result.append({
            "rank": i + 1,
            "wallet": w[:6] + "..." + w[-4:] if len(w) > 10 else w,
            "points": r.get("total_points", 0),
            "tier": r.get("tier", "bronze"),
            "referrals": r.get("referral_count", 0),
            "volume": r.get("lifetime_volume_usd", 0),
        })
    return result
