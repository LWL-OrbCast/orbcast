# HIP-4 outcome app — wallet, rewards, push, geo, sports overlay.
# Kept: health, geo, Privy, builder-config, Bridge2, rewards, push, demo, deposit scan.
# Removed: HIP-3 catalog / candles / news / Gemini / ticker-alert routes.

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import sys
import logging
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any, Tuple
import uuid
from datetime import datetime, timedelta, timezone
import httpx
import asyncio
import json
import io
import base64
import hashlib
import hmac
import re
import secrets
from web3 import Web3
from web3.exceptions import ContractLogicError, TransactionNotFound
import jwt
from jwt import PyJWKClient
from supabase import create_client, Client as SupabaseClient
from PIL import Image, ImageOps, UnidentifiedImageError
from exponent_server_sdk import (
    PushClient,
    PushMessage,
    PushServerError,
    DeviceNotRegisteredError,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from rewards import (
    get_rewards_profile,
    apply_referral_code,
    get_referrals,
    get_point_history,
    get_fee_discount_tenths,
    get_leaderboard,
    apply_verified_volume,
    ensure_rewards_profile,
    sum_outcome_fills,
    ACHIEVEMENTS,
    VOLUME_MILESTONES,
    TIERS,
    ApplyReferralRequest,
)
from sports_football import get_epl_board

import privy_import
import _ur_compat as ur_api
import _ur_compat as ur_db

# Configure logging — use stdout so Railway classifies levels correctly
# (Python defaults to stderr, which Railway treats as "error" for every line)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# Supabase configuration for push notifications
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
supabase: Optional[SupabaseClient] = None

if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    logger.info("Supabase client initialized for push notifications")
else:
    logger.warning("Supabase not configured (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY missing). Push notifications disabled.")

# Expo Push Client for sending notifications
push_client = PushClient()

# Price alert background worker state
_alert_worker_task: Optional[asyncio.Task] = None
ALERT_CHECK_INTERVAL_SECONDS = 30  # Check prices every 30 seconds
_LEADER_TTL_SECONDS = 45  # Leadership lease; must be > ALERT_CHECK_INTERVAL_SECONDS

# Hyperliquid API configuration
HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz/info"
HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws"

# Alpha Vantage API configuration (fundamentals + macro)
ALPHA_WARMUP_SECRET = os.getenv("ALPHA_WARMUP_SECRET")
INTERNAL_SYNC_SECRET = os.getenv("INTERNAL_SYNC_SECRET") or ALPHA_WARMUP_SECRET

def _token_matches(provided: str, expected: str) -> bool:
    """Constant-time compare; false when either side is empty or lengths differ."""
    if not provided or not expected:
        return False
    a = provided.encode("utf-8")
    b = expected.encode("utf-8")
    if len(a) != len(b):
        hmac.compare_digest(b, b)
        return False
    return hmac.compare_digest(a, b)


def _assert_internal_sync_authorized(request: Request) -> None:
    secret = (request.query_params.get("secret") or "").strip()
    auth = request.headers.get("authorization") or ""
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not INTERNAL_SYNC_SECRET:
        raise HTTPException(status_code=503, detail="Internal sync is not configured")
    if not (
        _token_matches(secret, INTERNAL_SYNC_SECRET)
        or _token_matches(token, INTERNAL_SYNC_SECRET)
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Finnhub global rate gate (sliding 60s window) ────────────────────────────
# Free-tier limit is 60 req/min. We cap at 50 to leave headroom in case the
# upstream window edges don't align with ours. Every Finnhub HTTP call in this
# process *must* await this gate first; if multiple background loops happen
# to overlap (e.g. daily fundamentals sync + 30-min stocks-news sync + ad-hoc
# market-news refresh) the gate serializes them so we never burst above the
# limit. Steady-state usage is far below the cap so the gate is a no-op.


# Google Gemini API configuration (with Google Search grounding)
# TODO(2026-10): gemini-2.5-flash is scheduled to retire ~2026-10-16 (Google GA
# retirement). Migrate Ask AI (`/gemini/analysis`) + news headline translation
# (same GEMINI_MODEL_ID) to gemini-3.6-flash or a cheaper 3.x Flash-Lite —
# confirm Search grounding + structured JSON + thinking_budget=0 still work,
# and re-check token vs grounding pricing (3.x is ~3–5× tokens vs 2.5).

# ExchangeRate-API (display-currency conversion)
FOREXRATE_KEY = os.getenv("FOREXRATE_KEY")
FOREXRATE_BASE_URL = "https://v6.exchangerate-api.com/v6"
FOREXRATE_SUPPORTED = {"AED", "ARS", "AUD", "BDT", "BRL", "CAD", "CHF", "CNH", "EGP", "EUR", "HKD", "IDR", "INR", "JPY", "KRW", "NGN", "PHP", "RUB", "SAR", "SGD", "TRY"}


def _normalize_forex_rates(rates: Dict[str, Any]) -> Dict[str, Any]:
    """Map legacy CNY cache rows to CNH (UR bank ledger uses CNH)."""
    out = dict(rates)
    if "CNH" not in out and "CNY" in out:
        out["CNH"] = out["CNY"]
    return out

# Builder configuration  (HL unit: tenths of a basis point)
# 1 tenth = 0.1 bps = 0.001 % = ×0.00001 decimal
# Defaults = pinned builder. Forks that want their own fees must
# set BUILDER_ADDRESS / BUILDER_FEE (or replace these defaults). See docs/FORKING.md.
BUILDER_ADDRESS = (
    os.getenv("BUILDER_ADDRESS", "0x29a1D36DaEE6B0E0Dd4873dd964677000B6e23EB").strip()
    or "0x29a1D36DaEE6B0E0Dd4873dd964677000B6e23EB"
)
BUILDER_FEE = int(os.getenv("BUILDER_FEE", "30") or "30")  # 30 tenths = 3 bps = 0.03 %

# Bridge2 (Arbitrum) configuration for gasless deposits (permit + relayer)
ARBITRUM_USDC_ADDRESS = os.getenv("ARBITRUM_USDC_ADDRESS", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831")
BRIDGE2_ADDRESS = os.getenv("HL_BRIDGE2_ADDRESS", "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7")
BRIDGE2_MIN_DEPOSIT_USDC = 5  # per HL docs
ARBITRUM_CHAIN_ID = 42161  # Required chain ID for all operations

# EIP-712 domain for gasless USDC external transfers (must match frontend
# `walletTransferIntent.ts`).
WALLET_TRANSFER_INTENT_DOMAIN_NAME = "OrbCast Wallet Transfer"
WALLET_TRANSFER_INTENT_DOMAIN_VERSION = "1"
WALLET_TRANSFER_INTENT_VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000000"

# ---------------------------------------------------------------------------
# Arbitrum RPC configuration — primary + optional fallbacks.
# Set ARBITRUM_RPC_URL to your dedicated provider; optionally provide a
# comma-separated ARBITRUM_RPC_URL_FALLBACKS. Public arb1 is appended as a
# last-ditch safety net so a provider outage doesn't freeze deposits.
# ---------------------------------------------------------------------------
ARBITRUM_RPC_URL = os.getenv("ARBITRUM_RPC_URL") or os.getenv("EXPO_PUBLIC_ARBITRUM_RPC_URL")


def _load_arbitrum_rpc_urls() -> List[str]:
    urls: List[str] = []
    if ARBITRUM_RPC_URL:
        urls.append(ARBITRUM_RPC_URL)
    raw_fallbacks = os.getenv("ARBITRUM_RPC_URL_FALLBACKS") or ""
    for u in raw_fallbacks.split(","):
        u = u.strip()
        if u and u not in urls:
            urls.append(u)
    public_fallback = "https://arb1.arbitrum.io/rpc"
    if public_fallback not in urls:
        urls.append(public_fallback)
    return urls


_ARBITRUM_RPC_URLS: List[str] = _load_arbitrum_rpc_urls()


def _redact_rpc(url: str) -> str:
    """Strip query-string (API keys) from RPC URL for safe logging."""
    try:
        return url.split("?", 1)[0]
    except Exception:
        return "<rpc>"


def _make_web3() -> "Web3":
    """Construct a Web3 client, falling back across configured RPC URLs.

    Validates chain ID on construction so a misconfigured RPC can never
    quietly point the relayer at the wrong network.
    """
    if not _ARBITRUM_RPC_URLS:
        raise RuntimeError("ARBITRUM_RPC_URL not configured")
    last_exc: Optional[Exception] = None
    for url in _ARBITRUM_RPC_URLS:
        try:
            w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 15}))
            cid = w3.eth.chain_id
            if cid != ARBITRUM_CHAIN_ID:
                raise RuntimeError(
                    f"Invalid chain ID from RPC {_redact_rpc(url)}: got {cid}, expected {ARBITRUM_CHAIN_ID}"
                )
            return w3
        except Exception as exc:
            last_exc = exc
            logger.warning("Arbitrum RPC %s unavailable: %s", _redact_rpc(url), exc)
            continue
    # Do not interpolate last_exc — HTTP clients used to see provider URLs
    # (and API keys in the query string) via the 501/500 handlers below.
    if last_exc is not None:
        logger.error("No Arbitrum RPC reachable: %s", last_exc)
    raise RuntimeError("No Arbitrum RPC reachable")


# ---------------------------------------------------------------------------
# Relayer pool — one or more private keys. Users are deterministically mapped
# to a single relayer via SHA-256(user_address) so every replica agrees on
# the assignment without any shared state.
# ---------------------------------------------------------------------------

def _load_relayer_keys() -> List[str]:
    raw = (
        os.getenv("BRIDGE2_RELAYER_PRIVATE_KEYS")
        or os.getenv("BRIDGE2_RELAYER_PRIVATE_KEY")
        or os.getenv("RELAYER_PRIVATE_KEY")
        or ""
    )
    keys: List[str] = []
    seen: set = set()
    for k in raw.split(","):
        k = k.strip()
        if not k:
            continue
        norm = k.lower()
        if norm in seen:
            continue
        seen.add(norm)
        keys.append(k)
    return keys


_RELAYER_PRIVATE_KEYS: List[str] = _load_relayer_keys()

# Precompute addresses once at startup. Fail fast on invalid keys — better a
# hard crash at boot than silently serving a broken relayer to real users.
_RELAYER_ADDRESSES: List[str] = []
_RELAYER_KEY_BY_ADDRESS: Dict[str, str] = {}
if _RELAYER_PRIVATE_KEYS:
    from eth_account import Account as _RelayerAccount
    for _k in _RELAYER_PRIVATE_KEYS:
        try:
            _addr = Web3.to_checksum_address(_RelayerAccount.from_key(_k).address)
        except Exception as _e:
            raise RuntimeError(f"Invalid relayer private key in config: {_e}")
        if _addr in _RELAYER_KEY_BY_ADDRESS:
            logger.warning("Duplicate relayer address %s in pool — ignoring duplicate key", _addr)
            continue
        _RELAYER_ADDRESSES.append(_addr)
        _RELAYER_KEY_BY_ADDRESS[_addr] = _k
    logger.info("Relayer pool initialised with %d address(es): %s",
                len(_RELAYER_ADDRESSES), ", ".join(_RELAYER_ADDRESSES))
else:
    logger.warning("No relayer private keys configured — gasless endpoints will be disabled")

# Back-compat alias: legacy references still work in any code path not yet
# migrated. Always points at the first key in the pool.
BRIDGE2_RELAYER_PRIVATE_KEY: Optional[str] = _RELAYER_PRIVATE_KEYS[0] if _RELAYER_PRIVATE_KEYS else None


def select_relayer_for_user(user_address: str) -> Tuple[str, str]:
    """Deterministically assign a relayer (address, private_key) to a user.

    Uses SHA-256 of the lowercased checksum address so all replicas agree
    regardless of Python's per-process hash randomisation.
    """
    if not _RELAYER_ADDRESSES:
        raise RuntimeError("No relayer private keys configured")
    if not Web3.is_address(user_address):
        raise ValueError("Invalid user address")
    import hashlib as _hashlib
    addr = Web3.to_checksum_address(user_address)
    digest = _hashlib.sha256(addr.lower().encode("utf-8")).digest()
    idx = int.from_bytes(digest[:8], "big") % len(_RELAYER_ADDRESSES)
    relayer_addr = _RELAYER_ADDRESSES[idx]
    return relayer_addr, _RELAYER_KEY_BY_ADDRESS[relayer_addr]


import time

# Unique identifier for this server replica (used for distributed locks)
_REPLICA_ID = uuid.uuid4().hex

# Rate limiting for wallet transfers (anti-griefing)
TRANSFER_RATE_LIMIT_MAX = 10  # Max transfers per window
TRANSFER_RATE_LIMIT_WINDOW_SECONDS = 86400  # 24 hours
# Deposit *attempts* (including bad/expired permits) — stops RPC / lock grief.
# Successful $5+ deposits a few times a day still fit.
DEPOSIT_ATTEMPT_LIMIT = 20
DEPOSIT_ATTEMPT_WINDOW_SECONDS = 600  # 10 minutes
_deposit_attempt_times: Dict[str, List[float]] = {}
_deposit_attempt_lock = asyncio.Lock()
TRANSFER_MIN_AMOUNT_USDC = 5  # Minimum transfer amount (matches deposit minimum)

# ---------------------------------------------------------------------------
# Per-relayer distributed lock via Supabase. Each relayer address gets its
# own lock row keyed by `relayer:<address_lowercase>` so two replicas can
# send txs for DIFFERENT relayers in parallel, while txs for the SAME
# relayer still serialise (required for sequential Arbitrum nonces).
# The lock auto-expires after 60s so a crashed replica cannot stall things.
# ---------------------------------------------------------------------------

def _relayer_lock_key(relayer_address: str) -> str:
    return f"relayer:{relayer_address.lower()}"


def _acquire_relayer_lock_for(relayer_address: str, timeout_seconds: float = 20.0) -> bool:
    if not supabase:
        return True  # dev mode without DB — allow through
    key = _relayer_lock_key(relayer_address)
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            res = supabase.rpc("acquire_relayer_lock_v2", {
                "p_lock_id": key,
                "p_holder_id": _REPLICA_ID,
                "p_ttl_seconds": 60,
            }).execute()
            if res.data is True:
                return True
        except Exception as exc:
            logger.warning("relayer lock(%s) acquire attempt error: %s", key, exc)
        time.sleep(0.4)
    logger.error("Failed to acquire relayer lock %s within %ss", key, timeout_seconds)
    return False


def _release_relayer_lock_for(relayer_address: str) -> None:
    if not supabase:
        return
    key = _relayer_lock_key(relayer_address)
    try:
        supabase.rpc("release_relayer_lock_v2", {
            "p_lock_id": key,
            "p_holder_id": _REPLICA_ID,
        }).execute()
    except Exception as exc:
        logger.warning("relayer lock(%s) release error (will auto-expire): %s", key, exc)


class _NonceTooLowError(Exception):
    """Raised when relayer nonce is behind the chain's pending nonce."""
    pass


# ---------------------------------------------------------------------------
# Demo trading mode (Hyperliquid testnet) — one-shot $100 USDC grant per user.
#
# Flow: user taps "Claim demo USDC" in the app → backend builds an HL testnet
# `usdSend` action signed with the master account's API wallet (agent) → the
# user's same EOA address now has $100 on testnet. They flip the
# tradingEnv toggle and trade against testnet liquidity, no real funds at risk.
#
# The master account itself is a wallet you control off-chain (you faucet it
# manually). The backend never sees the master's L1 private key — only the
# agent key, which can `usdSend` and place orders but cannot withdraw to L1
# via Bridge2 (HL agents are scope-limited by design). Worst case if the
# agent key leaks: someone drains testnet USDC. No real funds.
#
# Replica safety:
#   • Per-user one-shot enforced atomically by `demo_funding` UNIQUE PK.
#   • Concurrent claims serialised on the master agent via the same Supabase
#     `relayer_lock` table (lock id `demo_master:hl_testnet`) so two replicas
#     never sign two `usdSend` actions in the same ms (would collide on the
#     monotonic-nonce check inside HL).
#   • Stuck `pending` rows older than 2min are swept by the
#     `_demo_claim_cleanup_loop` background task, which runs only on the
#     replica that holds the `demo_claim_cleanup` leadership lease.
# ---------------------------------------------------------------------------

# Mainnet HL signing-domain chainId is the same value (`0x66eee` = 421614, the
# Arbitrum Sepolia chainId) on testnet exchange actions per HL docs and
# verified against @nktkas/hyperliquid esm/api/exchange/_methods/usdSend.js.
HL_TESTNET_API_URL = os.getenv("HL_TESTNET_API_URL", "https://api.hyperliquid-testnet.xyz")
HL_TESTNET_SIGNATURE_CHAIN_ID = os.getenv("HL_TESTNET_SIGNATURE_CHAIN_ID", "0x66eee")
HL_TESTNET_MASTER_ADDRESS: Optional[str] = os.getenv("HL_TESTNET_MASTER_ADDRESS") or None
# Master account L1 private key. Required for demo mode because HL Core USDC
# transfers (`usdSend`) are USER-SIGNED actions — agents/API wallets are
# explicitly NOT permitted to sign them per HL design (verified empirically:
# agent-signed usdSend returns "Insufficient balance for withdrawal" because
# HL routes the debit to the agent, not the master). The agent key is now
# unused for /demo/* but kept supported in case we need it for L1-action
# flows later (orders/cancels signed on behalf of the master).
HL_TESTNET_MASTER_PK: Optional[str] = os.getenv("HL_TESTNET_MASTER_PK") or None
HL_TESTNET_MASTER_AGENT_PK: Optional[str] = os.getenv("HL_TESTNET_MASTER_AGENT_PK") or None

try:
    # The advertised grant the user sees in the UI. NET amount that lands in
    # their HL testnet account after HL's transfer fee.
    DEMO_GRANT_AMOUNT_USDC = float(os.getenv("DEMO_GRANT_AMOUNT_USDC", "100"))
except Exception:
    DEMO_GRANT_AMOUNT_USDC = 100.0

try:
    # HL charges a flat $1 fee on Core USDC transfers. We gross up the on-the-
    # wire amount so the recipient nets the advertised grant. Make this
    # configurable so we can adapt without a redeploy if HL changes the fee.
    DEMO_TRANSFER_FEE_USDC = float(os.getenv("DEMO_TRANSFER_FEE_USDC", "1"))
except Exception:
    DEMO_TRANSFER_FEE_USDC = 1.0

# Lock id used in the relayer_lock table for the demo master account. Single
# string because we run with exactly one master account in v1; multi-master
# fan-out (à la `select_relayer_for_user`) is a Phase 1.5 expansion.
DEMO_MASTER_LOCK_ID = "demo_master:hl_testnet"

# Cached addresses derived from the keys at boot. Failing fast here is
# better than failing inside a request hours after deploy.
_DEMO_MASTER_DERIVED_ADDRESS: Optional[str] = None
_DEMO_MASTER_AGENT_ADDRESS: Optional[str] = None

if HL_TESTNET_MASTER_PK:
    try:
        from eth_account import Account as _DemoAcct
        _DEMO_MASTER_DERIVED_ADDRESS = _DemoAcct.from_key(HL_TESTNET_MASTER_PK).address
    except Exception as _e:
        raise RuntimeError(f"Invalid HL_TESTNET_MASTER_PK: {_e}")
    # If both env vars are set, sanity-check they refer to the same account.
    # Catches a copy-paste mistake (e.g. wrong PK pasted under the right
    # address label) before we burn nonces signing for the wrong account.
    if HL_TESTNET_MASTER_ADDRESS and HL_TESTNET_MASTER_ADDRESS.lower() != _DEMO_MASTER_DERIVED_ADDRESS.lower():
        raise RuntimeError(
            "HL_TESTNET_MASTER_PK derives address %s but HL_TESTNET_MASTER_ADDRESS=%s — "
            "config mismatch, refusing to start." % (
                _DEMO_MASTER_DERIVED_ADDRESS, HL_TESTNET_MASTER_ADDRESS
            )
        )
    if not HL_TESTNET_MASTER_ADDRESS:
        HL_TESTNET_MASTER_ADDRESS = _DEMO_MASTER_DERIVED_ADDRESS

if HL_TESTNET_MASTER_AGENT_PK:
    try:
        from eth_account import Account as _DemoAcct
        _DEMO_MASTER_AGENT_ADDRESS = _DemoAcct.from_key(HL_TESTNET_MASTER_AGENT_PK).address
    except Exception as _e:
        raise RuntimeError(f"Invalid HL_TESTNET_MASTER_AGENT_PK: {_e}")

if HL_TESTNET_MASTER_PK:
    logger.info(
        "Demo mode: HL testnet master=%s, agent=%s, grant=$%.2f, fee=$%.2f, wire=$%.2f",
        HL_TESTNET_MASTER_ADDRESS,
        _DEMO_MASTER_AGENT_ADDRESS or "(unused)",
        DEMO_GRANT_AMOUNT_USDC,
        DEMO_TRANSFER_FEE_USDC,
        DEMO_GRANT_AMOUNT_USDC + DEMO_TRANSFER_FEE_USDC,
    )
else:
    logger.warning(
        "Demo mode disabled: HL_TESTNET_MASTER_PK not configured. "
        "/demo/* endpoints will return 503."
    )


def demo_mode_enabled() -> bool:
    """Cheap config check — gate /demo/* endpoints behind it so a half-configured
    deploy doesn't try to send testnet USDC with a missing key."""
    return bool(HL_TESTNET_MASTER_PK and HL_TESTNET_MASTER_ADDRESS and supabase)


def _acquire_demo_master_lock(timeout_seconds: float = 20.0) -> bool:
    """Acquire the singleton master-agent lock. Reuses the same Supabase
    primitive (acquire_relayer_lock_v2) as the Bridge2/permit relayer pool —
    only the lock id namespace differs (`demo_master:*` vs `relayer:*`), so
    two replicas signing concurrently still serialise on the master agent
    nonce."""
    if not supabase:
        return True
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            res = supabase.rpc("acquire_relayer_lock_v2", {
                "p_lock_id": DEMO_MASTER_LOCK_ID,
                "p_holder_id": _REPLICA_ID,
                "p_ttl_seconds": 60,
            }).execute()
            if res.data is True:
                return True
        except Exception as exc:
            logger.warning("demo master lock acquire attempt error: %s", exc)
        time.sleep(0.4)
    logger.error("Failed to acquire demo master lock within %ss", timeout_seconds)
    return False


def _release_demo_master_lock() -> None:
    if not supabase:
        return
    try:
        supabase.rpc("release_relayer_lock_v2", {
            "p_lock_id": DEMO_MASTER_LOCK_ID,
            "p_holder_id": _REPLICA_ID,
        }).execute()
    except Exception as exc:
        logger.warning("demo master lock release error (will auto-expire): %s", exc)


def _hl_testnet_usd_send(destination: str, amount_usdc: float) -> str:
    """Build, sign, and submit an HL testnet `usdSend` exchange action from
    the master account to `destination`.

    IMPORTANT: HL Core USDC transfers (`usdSend`) are USER-SIGNED actions.
    Per the HL design (verified empirically and against the docs), API wallets
    / agents CANNOT sign these — only L1 actions like orders/cancels. So this
    function signs with HL_TESTNET_MASTER_PK directly. The agent PK is now
    irrelevant to demo claims.

    The `amount_usdc` arg is the GROSS amount that will be debited from the
    master (recipient gets gross − HL fee). The caller is responsible for
    grossing up so the recipient nets the advertised grant.

    Returns an audit identifier (timestamp-based string) — HL's exchange
    response for `usdSend` doesn't include a tx hash since the transfer is
    a pure off-chain L2 action.

    Mirrors the EIP-712 shape produced by @nktkas/hyperliquid:
      - domain: HyperliquidSignTransaction v1, chainId=int(signatureChainId),
        verifyingContract=0x0
      - primaryType: HyperliquidTransaction:UsdSend
      - fields: hyperliquidChain, destination, amount, time
    See @nktkas/hyperliquid esm/signing/mod.js → signUserSignedAction()
    and esm/api/exchange/_methods/usdSend.js for the canonical reference.
    """
    if not HL_TESTNET_MASTER_PK:
        raise RuntimeError("HL_TESTNET_MASTER_PK not configured")
    if not Web3.is_address(destination):
        raise ValueError(f"Invalid destination address: {destination}")

    from eth_account import Account

    # HL's API schema lowercases all addresses before hashing the action
    # (see @nktkas/hyperliquid esm/api/_schemas.js → Address → toLowerCase
    # transform). We must do the same here or the signature won't match
    # what HL re-derives server-side.
    dest_lower = destination.lower()
    if not dest_lower.startswith("0x"):
        dest_lower = "0x" + dest_lower
    # HL expects amount as a string with `1` = $1, max 6 decimal places
    # (USDC precision). Trim trailing zeros so signed payload matches what
    # the SDK would have produced byte-for-byte.
    amount_str = f"{amount_usdc:.6f}".rstrip("0").rstrip(".")
    if not amount_str or amount_str == "0":
        raise ValueError(f"Invalid amount: {amount_usdc}")

    # Single ms-precision timestamp used as both the EIP-712 `time` field
    # AND the request `nonce`. They MUST be equal — HL re-derives the action
    # hash from the action body, so a mismatch fails signature verification.
    nonce_ms = int(time.time() * 1000)

    # Schema lowercases hex strings (see @nktkas/hyperliquid esm/api/_schemas.js
    # → Hex). We mirror that to keep the signed bytes byte-identical to what
    # the JS SDK would produce for the same logical input.
    sig_chain_id_lower = HL_TESTNET_SIGNATURE_CHAIN_ID.lower()
    chain_id_int = int(sig_chain_id_lower, 16)

    typed_data = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "HyperliquidTransaction:UsdSend": [
                {"name": "hyperliquidChain", "type": "string"},
                {"name": "destination", "type": "string"},
                {"name": "amount", "type": "string"},
                {"name": "time", "type": "uint64"},
            ],
        },
        "primaryType": "HyperliquidTransaction:UsdSend",
        "domain": {
            "name": "HyperliquidSignTransaction",
            "version": "1",
            "chainId": chain_id_int,
            "verifyingContract": "0x0000000000000000000000000000000000000000",
        },
        "message": {
            "hyperliquidChain": "Testnet",
            "destination": dest_lower,
            "amount": amount_str,
            "time": nonce_ms,
        },
    }

    # Account.sign_typed_data is the one-shot form of
    # encode_typed_data + sign_message. Same output, fewer imports.
    # CRITICAL: signed by the MASTER PK, not the agent — HL agents cannot
    # sign user-signed actions (usdSend / withdraw3 / usdClassTransfer).
    signed = Account.sign_typed_data(HL_TESTNET_MASTER_PK, full_message=typed_data)

    # HL trims leading zeros from r/s per @nktkas/hyperliquid trimSignature(),
    # but only for multi-sig payloads. For single-wallet user-signed actions
    # the SDK passes the raw hex through, so we do the same — full 32-byte
    # padded hex is what HL's verifier expects on the single-sig path.
    sig = {
        "r": "0x" + signed.r.to_bytes(32, "big").hex(),
        "s": "0x" + signed.s.to_bytes(32, "big").hex(),
        "v": int(signed.v),
    }

    action = {
        "type": "usdSend",
        "signatureChainId": sig_chain_id_lower,
        "hyperliquidChain": "Testnet",
        "destination": dest_lower,
        "amount": amount_str,
        "time": nonce_ms,
    }

    body = {"action": action, "signature": sig, "nonce": nonce_ms}

    # We hit /exchange directly via httpx rather than wiring up a full HL
    # SDK in Python — the Python `hyperliquid-python-sdk` works fine but
    # adds another async dependency for a single endpoint.
    import httpx
    url = f"{HL_TESTNET_API_URL.rstrip('/')}/exchange"
    with httpx.Client(timeout=20.0) as client:
        resp = client.post(url, json=body, headers={"Content-Type": "application/json"})
    try:
        data = resp.json()
    except Exception:
        raise RuntimeError(f"HL testnet returned non-JSON: HTTP {resp.status_code} {resp.text[:200]}")

    if resp.status_code >= 400:
        raise RuntimeError(f"HL testnet HTTP {resp.status_code}: {data}")

    # HL response shape on success: {"status":"ok","response":{"type":"default"}}
    # On failure: {"status":"err","response":"<reason>"} — same envelope as
    # the SDK's executeUserSignedAction expects.
    status = data.get("status")
    if status != "ok":
        raise RuntimeError(f"HL testnet usdSend failed: {data}")

    logger.info(
        "[demo] usdSend ok: master=%s → dest=%s amount=$%s nonce=%s",
        HL_TESTNET_MASTER_ADDRESS,
        Web3.to_checksum_address(dest_lower),
        amount_str,
        nonce_ms,
    )
    # We return the nonce as the audit id since HL doesn't return a tx hash
    # for off-chain L2 actions. Stored in `tx_hash` column for compatibility.
    return f"hl-testnet-usdsend:{nonce_ms}"


# --------------------------------------------------------------------------- #
# Privy JWT Authentication
# --------------------------------------------------------------------------- #
# NOTE: PRIVY_APP_SECRET (read in privy_import.py at import time) is also
# required in production — the rewards endpoints use it to verify wallet
# ownership and return 503 without it. A variable change on Railway only
# takes effect after a deploy that touches backend/ (watch path skips
# web-only commits).
PRIVY_APP_ID = os.getenv("PRIVY_APP_ID", "").strip()
PRIVY_JWKS_URL = (
    f"https://auth.privy.io/api/v1/apps/{PRIVY_APP_ID}/jwks.json" if PRIVY_APP_ID else ""
)

# Cache for JWKS client (thread-safe, caches keys automatically)
_privy_jwks_client: Optional[PyJWKClient] = None


def _get_privy_jwks_client() -> PyJWKClient:
    """Get or create the Privy JWKS client with caching."""
    global _privy_jwks_client
    if _privy_jwks_client is None:
        _privy_jwks_client = PyJWKClient(PRIVY_JWKS_URL, cache_keys=True, lifespan=3600)
    return _privy_jwks_client


# Security scheme for Swagger UI
_bearer_scheme = HTTPBearer(auto_error=False)


class PrivyAuthUser(BaseModel):
    """Authenticated user info from Privy JWT."""
    user_id: str  # Privy DID (e.g., "did:privy:abc123")
    session_id: str
    app_id: str


_onboarding_ensured_ids: set[str] = set()


async def verify_privy_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> PrivyAuthUser:
    """
    FastAPI dependency to verify Privy access tokens.
    
    Extracts the Bearer token from the Authorization header, verifies it
    against Privy's JWKS endpoint, and returns the authenticated user info.
    """
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not PRIVY_APP_ID:
        raise HTTPException(
            status_code=503,
            detail="PRIVY_APP_ID is not configured on the server",
        )
    
    token = credentials.credentials
    
    try:
        # Get the signing key from JWKS
        jwks_client = _get_privy_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        
        # Verify and decode the token
        # Phone clocks are often a few seconds ahead of the PC running uvicorn.
        # Without leeway, a fresh Privy JWT looks "not yet valid (iat)" and
        # every authed call 401s until the skew passes.
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            issuer="privy.io",
            audience=PRIVY_APP_ID,
            leeway=120,
            options={
                "verify_exp": True,
                "verify_iat": True,
                "require": ["sub", "iss", "aud", "exp", "iat", "sid"],
            },
        )
        
        user = PrivyAuthUser(
            user_id=payload["sub"],
            session_id=payload["sid"],
            app_id=payload["aud"],
        )
        # Any authenticated API call creates the identity row. Login-only
        # client effects were not reaching this process reliably.
        if user.user_id and user.user_id not in _onboarding_ensured_ids:
            _onboarding_ensured_ids.add(user.user_id)
            asyncio.create_task(_ensure_user_onboarding(user.user_id))
        return user
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=401,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid Privy token: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
        logger.exception("Unexpected error verifying Privy token")
        raise HTTPException(
            status_code=401,
            detail="Authentication failed",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def _assert_caller_owns_wallet(auth_user: PrivyAuthUser, wallet: str) -> None:
    """Fail closed: the wallet must be a Privy-linked ETH address for this user."""
    try:
        owns = await asyncio.to_thread(
            privy_import.user_owns_eth_address, auth_user.user_id, wallet
        )
    except privy_import.PrivyImportError as exc:
        logger.warning("Privy wallet ownership lookup failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Unable to verify wallet ownership",
        ) from exc
    if not owns:
        raise HTTPException(
            status_code=403,
            detail="Wallet does not belong to this user",
        )


def _is_nonce_too_low(err: Exception) -> bool:
    msg = ""
    if isinstance(err, ValueError) and err.args:
        arg0 = err.args[0]
        if isinstance(arg0, dict):
            msg = str(arg0.get("message", ""))
        else:
            msg = str(arg0)
    else:
        msg = str(err)
    return "nonce too low" in msg.lower()

# Create the main app without a prefix
app = FastAPI(title="OrbCast API", version="1.0.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# HTTP client for Hyperliquid
http_client: Optional[httpx.AsyncClient] = None

# Models

class BuilderConfig(BaseModel):
    address: str = BUILDER_ADDRESS
    fee: int = BUILDER_FEE


class Bridge2PermitDepositRequest(BaseModel):
    user: str
    usd: str  # base units (e.g. 1 USDC = 1_000_000)
    deadline: int  # unix seconds
    signature: str  # 65-byte hex signature (0x...)

    @field_validator("user")
    @classmethod
    def _validate_user(cls, v: str) -> str:
        if not Web3.is_address(v):
            raise ValueError("Invalid user address")
        return Web3.to_checksum_address(v)

    @field_validator("signature")
    @classmethod
    def _validate_sig(cls, v: str) -> str:
        if not isinstance(v, str) or not v.startswith("0x"):
            raise ValueError("Invalid signature")
        return v


class WalletTransferRequest(BaseModel):
    user: str  # wallet address
    destination: str  # external address to send to
    usd: str  # base units (e.g. 1 USDC = 1_000_000)
    deadline: int  # unix seconds
    signature: str  # 65-byte hex signature (0x...) - USDC permit signature
    intent_signature: str  # EIP-712 TransferIntent — binds destination + amount
    signed_nonce: Optional[int] = None  # nonce used when signing (for validation)

    @field_validator("user")
    @classmethod
    def _validate_user(cls, v: str) -> str:
        if not Web3.is_address(v):
            raise ValueError("Invalid user address")
        return Web3.to_checksum_address(v)

    @field_validator("signature", "intent_signature")
    @classmethod
    def _validate_sig(cls, v: str) -> str:
        if not isinstance(v, str) or not v.startswith("0x"):
            raise ValueError("Invalid signature")
        return v

    @field_validator("destination")
    @classmethod
    def _validate_destination(cls, v: str) -> str:
        if not Web3.is_address(v):
            raise ValueError("Invalid destination address")
        return Web3.to_checksum_address(v)


# ============================================================================
# Demo Trading Mode Models
# ============================================================================

class DemoClaimFundsRequest(BaseModel):
    """POST /demo/claim-funds — user claims their one-shot $100 testnet USDC.

    Identity is the Privy user id (extracted server-side from the auth token,
    not trusted from the body). The wallet_address is where the testnet USDC
    is sent — must match a Privy embedded wallet for the same user. The
    device_id (optional, supplied by getNotificationDeviceId() on the client)
    is used as a sybil-defense secondary unique key — same physical device
    cannot claim across multiple Privy identities.
    """
    wallet_address: str
    device_id: Optional[str] = None


class DemoStatusResponse(BaseModel):
    """GET /demo/status — current demo claim state for the authed user."""
    claimed: bool
    status: Optional[str] = None  # 'pending' | 'sent' | 'failed' | None
    claimed_at: Optional[str] = None
    sent_at: Optional[str] = None
    tx_hash: Optional[str] = None
    amount_usdc: Optional[float] = None
    grant_amount_usdc: float  # what a fresh claim would receive (for UI hinting)


# ============================================================================
# Push Notifications & Price Alerts Models
# ============================================================================

class RegisterPushTokenRequest(BaseModel):
    push_token: str  # Expo push token (e.g., "ExponentPushToken[xxx]")
    device_id: Optional[str] = None  # Optional device identifier
    platform: Optional[str] = None  # "ios", "android", or "web"
    wallet_address: Optional[str] = None  # Privy embedded wallet (for deposit notifications)


def _split_signature(sig_hex: str):
    """Split signature into r, s, v components.
    
    Returns:
        For Bridge2 (uint256 r, uint256 s): returns (r_int, s_int, v_int)
        For USDC permit (bytes32 r, bytes32 s): use _split_signature_bytes32() instead
    """
    raw = bytes.fromhex(sig_hex[2:])
    if len(raw) != 65:
        raise ValueError("Signature must be 65 bytes")
    r = int.from_bytes(raw[0:32], "big")
    s = int.from_bytes(raw[32:64], "big")
    v = raw[64]
    if v < 27:
        v += 27
    return r, s, v


def _split_signature_bytes32(sig_hex: str):
    """Split signature into bytes32 r, bytes32 s, and uint8 v for USDC permit.
    
    Returns:
        (r_bytes32, s_bytes32, v_int) where r and s are 32-byte bytes objects
    """
    raw = bytes.fromhex(sig_hex[2:])
    if len(raw) != 65:
        raise ValueError("Signature must be 65 bytes")
    r_bytes = raw[0:32]
    s_bytes = raw[32:64]
    v = raw[64]
    if v < 27:
        v += 27
    return r_bytes, s_bytes, v


def _verify_permit_signature_offchain(
    owner: str,
    spender: str,
    value: int,
    nonce: int,
    deadline: int,
    signature: str,
    chain_id: int = ARBITRUM_CHAIN_ID,
) -> str:
    """
    Verify EIP-712 permit signature OFF-CHAIN before submitting to blockchain.
    
    This saves gas by rejecting invalid signatures before broadcast.
    Returns the recovered address if valid, raises ValueError if invalid.
    
    Note: Arbitrum USDC uses domain name "USD Coin" and version "2".
    """
    from eth_account import Account
    from eth_account.messages import encode_structured_data
    
    owner_checksummed = Web3.to_checksum_address(owner)
    spender_checksummed = Web3.to_checksum_address(spender)
    contract_checksummed = Web3.to_checksum_address(ARBITRUM_USDC_ADDRESS)
    
    # Full EIP-712 typed data structure (must match frontend exactly)
    typed_data = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "Permit": [
                {"name": "owner", "type": "address"},
                {"name": "spender", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "nonce", "type": "uint256"},
                {"name": "deadline", "type": "uint256"},
            ],
        },
        "primaryType": "Permit",
        "domain": {
            "name": "USD Coin",
            "version": "2",
            "chainId": chain_id,
            "verifyingContract": contract_checksummed,
        },
        "message": {
            "owner": owner_checksummed,
            "spender": spender_checksummed,
            "value": value,
            "nonce": nonce,
            "deadline": deadline,
        },
    }
    
    try:
        # Encode the structured data
        signable = encode_structured_data(primitive=typed_data)
        
        # Parse signature
        sig_hex = signature[2:] if signature.startswith("0x") else signature
        sig_bytes = bytes.fromhex(sig_hex)
        if len(sig_bytes) != 65:
            raise ValueError(f"Signature must be 65 bytes, got {len(sig_bytes)}")
        
        # Recover the address that signed this message
        recovered = Account.recover_message(signable, signature=sig_bytes)
        recovered_checksummed = Web3.to_checksum_address(recovered)
        
        logger.info(f"Permit sig recovery: recovered={recovered_checksummed}, expected={owner_checksummed}")
        
        if recovered_checksummed.lower() != owner_checksummed.lower():
            raise ValueError(
                f"Signature mismatch: signed by {recovered_checksummed}, expected {owner_checksummed}"
            )
        
        logger.info(f"Permit signature verified off-chain: owner={owner_checksummed}")
        return recovered_checksummed
        
    except ValueError:
        raise
    except Exception as e:
        logger.error(f"Permit signature verification failed: {e}", exc_info=True)
        raise ValueError(f"Permit signature verification failed: {str(e)}")


def _verify_transfer_intent_offchain(
    *,
    owner: str,
    destination: str,
    amount: int,
    deadline: int,
    relayer: str,
    signature: str,
    chain_id: int = ARBITRUM_CHAIN_ID,
) -> str:
    """Verify EIP-712 TransferIntent signed via eth_signTypedData_v4.

    Binds destination (and amount/deadline/relayer) so the relayer cannot
    be tricked into transferFrom() to an address the user did not sign for.
    Schema must match ``frontend/src/lib/walletTransferIntent.ts``.
    """
    from eth_account import Account

    owner_cs = Web3.to_checksum_address(owner)
    dest_cs = Web3.to_checksum_address(destination)
    relayer_cs = Web3.to_checksum_address(relayer)
    verifying = Web3.to_checksum_address(WALLET_TRANSFER_INTENT_VERIFYING_CONTRACT)

    sig_hex = signature[2:] if signature.startswith("0x") else signature
    sig_bytes = bytes.fromhex(sig_hex)
    if len(sig_bytes) != 65:
        raise ValueError(f"Intent signature must be 65 bytes, got {len(sig_bytes)}")

    message_data = {
        "owner": owner_cs,
        "destination": dest_cs,
        "amount": int(amount),
        "deadline": int(deadline),
        "relayer": relayer_cs,
    }
    domain_data = {
        "name": WALLET_TRANSFER_INTENT_DOMAIN_NAME,
        "version": WALLET_TRANSFER_INTENT_DOMAIN_VERSION,
        "chainId": int(chain_id),
        "verifyingContract": verifying,
    }
    message_types = {
        "TransferIntent": [
            {"name": "owner", "type": "address"},
            {"name": "destination", "type": "address"},
            {"name": "amount", "type": "uint256"},
            {"name": "deadline", "type": "uint256"},
            {"name": "relayer", "type": "address"},
        ],
    }

    try:
        try:
            from eth_account.messages import encode_typed_data

            signable = encode_typed_data(
                domain_data=domain_data,
                message_types=message_types,
                message_data=message_data,
            )
        except ImportError:
            from eth_account.messages import encode_structured_data

            typed_data = {
                "types": {
                    "EIP712Domain": [
                        {"name": "name", "type": "string"},
                        {"name": "version", "type": "string"},
                        {"name": "chainId", "type": "uint256"},
                        {"name": "verifyingContract", "type": "address"},
                    ],
                    **message_types,
                },
                "primaryType": "TransferIntent",
                "domain": domain_data,
                "message": message_data,
            }
            signable = encode_structured_data(primitive=typed_data)

        recovered = Account.recover_message(signable, signature=sig_bytes)
        recovered_cs = Web3.to_checksum_address(recovered)
        if recovered_cs.lower() != owner_cs.lower():
            raise ValueError(
                f"Transfer intent signed by {recovered_cs}, expected {owner_cs}"
            )
        logger.info("Transfer intent verified off-chain: owner=%s dest=%s", owner_cs, dest_cs)
        return recovered_cs
    except ValueError:
        raise
    except Exception as e:
        logger.error("Transfer intent verification failed: %s", e, exc_info=True)
        raise ValueError(f"Transfer intent verification failed: {str(e)}") from e


async def _check_deposit_attempt_rate(user_address: str) -> None:
    """Cap deposit attempts per wallet (process-local). Raises HTTP 429."""
    now = time.monotonic()
    key = user_address.lower()
    async with _deposit_attempt_lock:
        times = [t for t in _deposit_attempt_times.get(key, []) if now - t < DEPOSIT_ATTEMPT_WINDOW_SECONDS]
        if len(times) >= DEPOSIT_ATTEMPT_LIMIT:
            raise HTTPException(
                status_code=429,
                detail="Too many deposit attempts. Try again in a few minutes.",
            )
        times.append(now)
        _deposit_attempt_times[key] = times


def _check_replay_protection(signature: str) -> None:
    """Check if signature has been used before (replay protection).

    Uses a Supabase table with a UNIQUE constraint so the check-and-mark
    is atomic — safe across multiple replicas.
    Raises ValueError if signature was already used.
    """
    import hashlib
    sig_hash = hashlib.sha256(signature.encode()).hexdigest()

    if not supabase:
        return  # dev mode without DB — skip

    try:
        res = supabase.rpc("check_and_mark_signature", {
            "p_sig_hash": sig_hash,
        }).execute()
        is_new = res.data
        if not is_new:
            raise ValueError("Signature already used (replay protection)")
    except ValueError:
        raise
    except Exception as exc:
        logger.error("Replay protection DB error (blocking): %s", exc)
        raise ValueError("Service temporarily unavailable — please retry in a moment")


def _bridge2_batched_deposit_with_permit_sync(req: Bridge2PermitDepositRequest) -> str:
    if not _RELAYER_PRIVATE_KEYS:
        raise RuntimeError("BRIDGE2_RELAYER_PRIVATE_KEY not configured")

    # Replay protection
    _check_replay_protection(req.signature)

    usd_int = int(req.usd)
    if usd_int <= 0:
        raise ValueError("usd must be > 0")
    # 5 USDC minimum in base units (6 decimals)
    if usd_int < BRIDGE2_MIN_DEPOSIT_USDC * 1_000_000:
        raise ValueError(f"Minimum deposit is {BRIDGE2_MIN_DEPOSIT_USDC} USDC")
    if usd_int > (2**64 - 1):
        raise ValueError("usd too large")

    # _make_web3() validates chain ID internally across configured RPC URLs.
    w3 = _make_web3()

    # Deterministic relayer assignment. The frontend MUST have signed the
    # permit with this exact relayer as `spender`; otherwise the on-chain
    # permit() call reverts (funds stay safe, only gas is at risk — and
    # estimate_gas below will catch the mismatch before we broadcast).
    relayer, relayer_pk = select_relayer_for_user(req.user)
    relayer_acct = w3.eth.account.from_key(relayer_pk)

    bridge2_abi = [
        {
            "inputs": [
                {
                    "components": [
                        {"internalType": "address", "name": "user", "type": "address"},
                        {"internalType": "uint64", "name": "usd", "type": "uint64"},
                        {"internalType": "uint64", "name": "deadline", "type": "uint64"},
                        {
                            "components": [
                                {"internalType": "uint256", "name": "r", "type": "uint256"},
                                {"internalType": "uint256", "name": "s", "type": "uint256"},
                                {"internalType": "uint8", "name": "v", "type": "uint8"},
                            ],
                            "internalType": "struct Signature",
                            "name": "signature",
                            "type": "tuple",
                        },
                    ],
                    "internalType": "struct DepositWithPermit[]",
                    "name": "deposits",
                    "type": "tuple[]",
                }
            ],
            "name": "batchedDepositWithPermit",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function",
        }
    ]

    # Verify nonce before submitting (nonce is checked on-chain, but we verify off-chain to save gas)
    usdc_abi_for_nonce = [
        {
            "constant": True,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "nonces",
            "outputs": [{"name": "", "type": "uint256"}],
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [
                {"name": "_owner", "type": "address"},
                {"name": "_spender", "type": "address"},
            ],
            "name": "allowance",
            "outputs": [{"name": "", "type": "uint256"}],
            "type": "function",
        },
    ]
    usdc_contract_for_nonce = w3.eth.contract(
        address=Web3.to_checksum_address(ARBITRUM_USDC_ADDRESS), abi=usdc_abi_for_nonce
    )
    # Note: We can't verify the exact nonce used in the permit without decoding the signature,
    # but the on-chain permit() will revert if nonce is wrong. This check is mainly for logging.
    # The frontend should fetch and use the correct nonce, which it does.
    user_nonce = usdc_contract_for_nonce.functions.nonces(Web3.to_checksum_address(req.user)).call()
    logger.info(f"Bridge2 deposit: user {req.user} nonce: {user_nonce}")
    
    # Optional: Check current allowance (sanity check - permit will set this, but useful for debugging)
    current_allowance = usdc_contract_for_nonce.functions.allowance(
        Web3.to_checksum_address(req.user), Web3.to_checksum_address(BRIDGE2_ADDRESS)
    ).call()
    if current_allowance >= usd_int:
        logger.info(f"Bridge2 deposit: user {req.user} already has sufficient allowance: {current_allowance} >= {usd_int}")
    # Note: We still proceed with permit() call - if deadline expired or nonce wrong, it will revert on-chain

    contract = w3.eth.contract(address=Web3.to_checksum_address(BRIDGE2_ADDRESS), abi=bridge2_abi)
    r, s, v = _split_signature(req.signature)

    # Arbitrum is EIP-1559. Using `gasPrice` can occasionally be *lower* than the
    # current base fee, causing: "max fee per gas less than block base fee".
    tx_fee_params: Dict[str, int] = {}
    try:
        pending = w3.eth.get_block("pending")
        base_fee = pending.get("baseFeePerGas")
        if base_fee is not None:
            # Small priority fee + buffered max fee to survive tiny base-fee bumps.
            priority_fee = int(w3.to_wei("0.01", "gwei"))
            max_fee = int(int(base_fee) * 3 + priority_fee)
            # Safety: ensure maxFeePerGas is never below baseFee + priorityFee
            max_fee = max(max_fee, int(base_fee) + priority_fee)
            tx_fee_params = {
                "maxFeePerGas": max_fee,
                "maxPriorityFeePerGas": priority_fee,
            }
    except Exception:
        tx_fee_params = {}

    # Fallback for providers that don't return baseFeePerGas
    if not tx_fee_params:
        gas_price = int(w3.eth.gas_price)
        tx_fee_params = {"gasPrice": int(gas_price * 1.2)}

    if not _acquire_relayer_lock_for(relayer):
        raise RuntimeError("Server busy — please try again in a moment.")
    try:
        deposit_nonce = w3.eth.get_transaction_count(relayer, "pending")
        tx = contract.functions.batchedDepositWithPermit(
            [(req.user, usd_int, int(req.deadline), (r, s, v))]
        ).build_transaction(
            {
                "from": relayer,
                "nonce": deposit_nonce,
                "chainId": w3.eth.chain_id,
                **tx_fee_params,
            }
        )

        # Estimate gas; a failure here almost always means the permit would
        # revert on-chain (wrong spender, bad sig, expired deadline, etc.).
        # Reject fast rather than burn relayer gas on a guaranteed revert.
        try:
            estimated = w3.eth.estimate_gas(tx)
            tx["gas"] = int(estimated * 1.3)
        except Exception as est_err:
            raise ValueError(
                "Deposit would revert on-chain (invalid permit signature, wrong relayer, "
                "expired deadline, or nonce mismatch). Please refresh and try again."
            ) from est_err

        signed = relayer_acct.sign_transaction(tx)
        raw_tx = getattr(signed, "raw_transaction", None) or getattr(signed, "rawTransaction", None)
        if raw_tx is None:
            raise RuntimeError("Signed transaction missing raw transaction bytes")

        tx_hash = w3.eth.send_raw_transaction(raw_tx)
    finally:
        _release_relayer_lock_for(relayer)

    tx_hash_hex = tx_hash.hex()
    if not tx_hash_hex.startswith("0x"):
        tx_hash_hex = f"0x{tx_hash_hex}"
    return tx_hash_hex


def _check_transfer_rate_limit(user_address: str) -> None:
    """Check if user has exceeded transfer rate limit (anti-griefing).
    
    Uses Supabase for persistence (survives server restarts).
    Raises ValueError if rate limit exceeded.
    """
    if not supabase:
        # If Supabase not configured, allow transfers (dev mode)
        logger.warning("Supabase not configured - rate limiting disabled")
        return
    
    user_key = user_address.lower()
    current_time = datetime.utcnow()
    cutoff_time = current_time - timedelta(seconds=TRANSFER_RATE_LIMIT_WINDOW_SECONDS)
    
    try:
        # Query recent transfers from Supabase
        result = supabase.table('transfer_rate_limits').select('transferred_at').eq(
            'user_address', user_key
        ).gte('transferred_at', cutoff_time.isoformat()).execute()
        
        recent_transfers = result.data if result.data else []
        recent_count = len(recent_transfers)
        
        if recent_count >= TRANSFER_RATE_LIMIT_MAX:
            # Find oldest transfer to calculate wait time
            oldest = min(datetime.fromisoformat(t['transferred_at'].replace('Z', '+00:00')) for t in recent_transfers)
            reset_time = oldest + timedelta(seconds=TRANSFER_RATE_LIMIT_WINDOW_SECONDS)
            hours_remaining = int((reset_time - datetime.now(oldest.tzinfo)).total_seconds() / 3600) + 1
            raise ValueError(
                f"Transfer limit reached ({TRANSFER_RATE_LIMIT_MAX} per 24h). "
                f"Try again in ~{hours_remaining} hours."
            )
    except ValueError:
        # Re-raise rate limit errors
        raise
    except Exception as e:
        logger.error(f"Rate limit check failed: {e}", exc_info=True)
        raise ValueError(
            "Service temporarily unavailable — please retry in a moment"
        ) from e


def _record_transfer(user_address: str, tx_hash: str, amount_usdc: float, destination: str) -> None:
    """Record a successful transfer for rate limiting (persisted in Supabase)."""
    if not supabase:
        return
    
    user_key = user_address.lower()
    try:
        supabase.table('transfer_rate_limits').insert({
            'user_address': user_key,
            'tx_hash': tx_hash,
            'amount_usdc': amount_usdc,
            'destination': destination.lower(),
            'transferred_at': datetime.utcnow().isoformat(),
        }).execute()
    except Exception as e:
        logger.error(f"Failed to record transfer: {e}", exc_info=True)
        # Non-fatal - transfer already succeeded


def _wallet_transfer_with_permit_sync(req: WalletTransferRequest) -> str:
    """Gasless USDC transfer from wallet to external address using permit + relayer."""
    if not _RELAYER_PRIVATE_KEYS:
        raise RuntimeError("BRIDGE2_RELAYER_PRIVATE_KEY not configured")

    # Rate limiting (anti-griefing) - check BEFORE doing any work
    _check_transfer_rate_limit(req.user)

    # Replay protection (permit + intent are independent replay surfaces)
    _check_replay_protection(req.signature)
    _check_replay_protection(req.intent_signature)

    usd_int = int(req.usd)
    if usd_int <= 0:
        raise ValueError("usd must be > 0")
    
    # Minimum transfer amount (anti-griefing)
    min_amount_base = TRANSFER_MIN_AMOUNT_USDC * 1_000_000  # 5 USDC in base units
    if usd_int < min_amount_base:
        raise ValueError(f"Minimum transfer is {TRANSFER_MIN_AMOUNT_USDC} USDC")
    
    if usd_int > (2**64 - 1):
        raise ValueError("usd too large")

    # _make_web3() validates chain ID internally across configured RPC URLs.
    w3 = _make_web3()

    # Deterministic relayer assignment. The permit was signed with
    # `spender = <this relayer>`; a mismatch is caught by estimate_gas
    # (or by the on-chain permit() revert) before any user funds move.
    relayer, relayer_pk = select_relayer_for_user(req.user)
    relayer_acct = w3.eth.account.from_key(relayer_pk)

    # Bind destination to a user-signed intent before spending relayer gas.
    current_time = int(time.time())
    if int(req.deadline) < current_time:
        raise ValueError(f"Transfer deadline expired: {req.deadline} < {current_time}")
    _verify_transfer_intent_offchain(
        owner=req.user,
        destination=req.destination,
        amount=usd_int,
        deadline=int(req.deadline),
        relayer=relayer,
        signature=req.intent_signature,
    )

    # Check user has enough balance
    usdc_abi = [
        {
            "constant": True,
            "inputs": [{"name": "_owner", "type": "address"}],
            "name": "balanceOf",
            "outputs": [{"name": "balance", "type": "uint256"}],
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [
                {"name": "_owner", "type": "address"},
                {"name": "_spender", "type": "address"},
            ],
            "name": "allowance",
            "outputs": [{"name": "", "type": "uint256"}],
            "type": "function",
        },
        {
            "constant": True,
            "inputs": [{"name": "owner", "type": "address"}],
            "name": "nonces",
            "outputs": [{"name": "", "type": "uint256"}],
            "type": "function",
        },
        {
            "constant": False,
            "inputs": [
                {"name": "_spender", "type": "address"},
                {"name": "_value", "type": "uint256"},
            ],
            "name": "approve",
            "outputs": [{"name": "", "type": "bool"}],
            "type": "function",
        },
        {
            "constant": False,
            "inputs": [
                {"name": "_from", "type": "address"},
                {"name": "_to", "type": "address"},
                {"name": "_value", "type": "uint256"},
            ],
            "name": "transferFrom",
            "outputs": [{"name": "", "type": "bool"}],
            "type": "function",
        },
        {
            "constant": False,
            "inputs": [
                {"name": "owner", "type": "address"},
                {"name": "spender", "type": "address"},
                {"name": "value", "type": "uint256"},
                {"name": "deadline", "type": "uint256"},
                {"name": "v", "type": "uint8"},
                {"name": "r", "type": "bytes32"},
                {"name": "s", "type": "bytes32"},
            ],
            "name": "permit",
            "outputs": [],
            "type": "function",
        },
    ]

    usdc_contract = w3.eth.contract(address=Web3.to_checksum_address(ARBITRUM_USDC_ADDRESS), abi=usdc_abi)
    user_balance = usdc_contract.functions.balanceOf(Web3.to_checksum_address(req.user)).call()
    if user_balance < usd_int:
        raise ValueError(f"Insufficient balance: have {user_balance}, need {usd_int}")

    # Get user's current nonce for permit verification
    user_nonce = usdc_contract.functions.nonces(Web3.to_checksum_address(req.user)).call()
    
    # Log detailed info for debugging permit issues
    logger.info(f"Wallet transfer: user={req.user}, on-chain nonce={user_nonce}, signed_nonce={req.signed_nonce}, amount={usd_int}, deadline={req.deadline}")
    logger.info(f"Wallet transfer: relayer={relayer}, USDC={ARBITRUM_USDC_ADDRESS}")
    
    # Validate nonce if provided (prevents wasted gas on guaranteed-to-fail permits)
    if req.signed_nonce is not None and req.signed_nonce != user_nonce:
        raise ValueError(
            f"Nonce mismatch: you signed with nonce {req.signed_nonce} but chain expects {user_nonce}. "
            f"Please try again."
        )
    
    # Verify the user address matches what was provided (case-insensitive but log for debugging)
    user_checksummed = Web3.to_checksum_address(req.user)
    logger.info(f"Wallet transfer: user_checksummed={user_checksummed}")
    
    # Check deadline hasn't expired
    if int(req.deadline) < current_time:
        raise ValueError(f"Permit deadline expired: {req.deadline} < {current_time}")

    # Verify permit signature and extract r, s, v
    # Use bytes32 directly for USDC permit (more reliable than hex string conversion)
    r_bytes, s_bytes, v = _split_signature_bytes32(req.signature)
    
    # Log signature components for debugging
    logger.info(f"Wallet transfer sig: v={v}, r={r_bytes.hex()[:16]}..., s={s_bytes.hex()[:16]}...")
    
    # Verify v value is correct (should be 27 or 28 for Ethereum)
    if v not in (27, 28):
        raise ValueError(f"Invalid signature v value: {v} (expected 27 or 28)")

    # Get gas price
    tx_fee_params: Dict[str, int] = {}
    try:
        pending = w3.eth.get_block("pending")
        base_fee = pending.get("baseFeePerGas")
        if base_fee is not None:
            priority_fee = int(w3.to_wei("0.01", "gwei"))
            max_fee = int(int(base_fee) * 3 + priority_fee)
            max_fee = max(max_fee, int(base_fee) + priority_fee)
            tx_fee_params = {
                "maxFeePerGas": max_fee,
                "maxPriorityFeePerGas": priority_fee,
            }
    except Exception:
        tx_fee_params = {}

    if not tx_fee_params:
        gas_price = int(w3.eth.gas_price)
        tx_fee_params = {"gasPrice": int(gas_price * 1.2)}

    for attempt in range(2):
        try:
            permit_hash = None

            # PHASE 1: Always broadcast permit() — never skip based on existing
            # allowance alone. The old skip path let anyone with a valid Privy
            # token drain leftover allowance using a junk signature because
            # transferFrom ran without an on-chain permit check. estimate_gas
            # on permit() is the authoritative pre-flight (off-chain EIP-712
            # recovery is disabled due to eth_signTypedData_v4 encoding drift).
            if not _acquire_relayer_lock_for(relayer):
                raise RuntimeError("Server busy — please try again in a moment.")
            try:
                permit_nonce = w3.eth.get_transaction_count(relayer, "pending")
                permit_tx = usdc_contract.functions.permit(
                    Web3.to_checksum_address(req.user),
                    relayer,
                    usd_int,
                    int(req.deadline),
                    v,
                    r_bytes,
                    s_bytes,
                ).build_transaction(
                    {
                        "from": relayer,
                        "nonce": permit_nonce,
                        "chainId": w3.eth.chain_id,
                        **tx_fee_params,
                    }
                )

                # Estimate gas also acts as a free pre-flight check —
                # if the permit would revert (wrong spender, bad sig,
                # expired deadline, stale nonce) the node returns an
                # error here and we refuse to broadcast.
                try:
                    estimated_permit = w3.eth.estimate_gas(permit_tx)
                    permit_tx["gas"] = int(estimated_permit * 1.3)
                except Exception as est_err:
                    raise ValueError(
                        "Permit would revert on-chain (invalid signature, wrong relayer, "
                        "expired deadline, or nonce mismatch). Please refresh and try again."
                    ) from est_err

                signed_permit = relayer_acct.sign_transaction(permit_tx)
                raw_permit = getattr(signed_permit, "raw_transaction", None) or getattr(signed_permit, "rawTransaction", None)
                if raw_permit is None:
                    raise RuntimeError("Signed permit transaction missing raw transaction bytes")
                try:
                    permit_hash = w3.eth.send_raw_transaction(raw_permit)
                    logger.info(f"Wallet transfer: permit tx sent, hash={permit_hash.hex()}")
                except ValueError as e:
                    if _is_nonce_too_low(e):
                        raise _NonceTooLowError() from e
                    raise
            finally:
                _release_relayer_lock_for(relayer)

            # PHASE 2: Wait for permit receipt (NO LOCK — allows concurrency)
            if permit_hash is not None:
                permit_receipt = w3.eth.wait_for_transaction_receipt(permit_hash)

                new_allowance = 0
                max_allowance_checks = 5
                allowance_retry_delay = 2

                for allowance_check in range(max_allowance_checks):
                    new_allowance = usdc_contract.functions.allowance(
                        Web3.to_checksum_address(req.user), relayer
                    ).call()

                    if new_allowance >= usd_int:
                        break

                    if allowance_check < max_allowance_checks - 1:
                        logger.info(f"Allowance check {allowance_check + 1}/{max_allowance_checks}: got {new_allowance}, expected >= {usd_int}, retrying in {allowance_retry_delay}s...")
                        time.sleep(allowance_retry_delay)

                if permit_receipt.status != 1:
                    if new_allowance >= usd_int:
                        logger.info(
                            f"Wallet transfer: our permit tx failed but allowance is sufficient "
                            f"(likely front-run). allowance={new_allowance}, proceeding to transfer."
                        )
                    else:
                        raise ValueError(
                            "Permit transaction failed on-chain (invalid signature, wrong nonce, or expired deadline)"
                        )
                elif new_allowance < usd_int:
                    logger.error(f"Permit allowance check failed after retries! allowance={new_allowance}, expected>={usd_int}")
                    logger.error(f"  user={Web3.to_checksum_address(req.user)}, relayer={relayer}")
                    logger.error(f"  deadline={req.deadline}, permit_tx={permit_hash.hex()}")
                    raise ValueError(
                        f"Permit verification failed. Please try again in a moment. "
                        f"(allowance: {new_allowance}, needed: {usd_int})"
                    )
                else:
                    logger.info(f"Wallet transfer: permit succeeded, allowance set to {new_allowance}")

            # PHASE 3: Acquire lock again, send transferFrom
            transfer_attempts = 0
            max_transfer_attempts = 2
            while transfer_attempts < max_transfer_attempts:
                transfer_attempts += 1
                try:
                    if not _acquire_relayer_lock_for(relayer):
                        raise RuntimeError("Server busy — please try again in a moment.")
                    try:
                        transfer_nonce = w3.eth.get_transaction_count(relayer, "pending")
                        transfer_tx = usdc_contract.functions.transferFrom(
                            Web3.to_checksum_address(req.user),
                            Web3.to_checksum_address(req.destination),
                            usd_int,
                        ).build_transaction(
                            {
                                "from": relayer,
                                "nonce": transfer_nonce,
                                "chainId": w3.eth.chain_id,
                                **tx_fee_params,
                            }
                        )

                        # Pre-flight: a revert here usually means the
                        # permit never landed or allowance was clobbered.
                        try:
                            estimated_transfer = w3.eth.estimate_gas(transfer_tx)
                            transfer_tx["gas"] = int(estimated_transfer * 1.3)
                        except Exception as est_err:
                            raise ValueError(
                                "Transfer would revert on-chain (allowance missing or insufficient "
                                "balance). Please try again in a moment."
                            ) from est_err

                        signed_transfer = relayer_acct.sign_transaction(transfer_tx)
                        raw_transfer = getattr(signed_transfer, "raw_transaction", None) or getattr(signed_transfer, "rawTransaction", None)
                        if raw_transfer is None:
                            raise RuntimeError("Signed transfer transaction missing raw transaction bytes")
                        try:
                            tx_hash = w3.eth.send_raw_transaction(raw_transfer)
                        except ValueError as e:
                            if _is_nonce_too_low(e):
                                raise _NonceTooLowError() from e
                            raise
                    finally:
                        _release_relayer_lock_for(relayer)
                    break
                except (ConnectionError, TimeoutError, OSError) as net_err:
                    if transfer_attempts < max_transfer_attempts:
                        logger.warning(f"Network error during transfer (attempt {transfer_attempts}), retrying: {net_err}")
                        time.sleep(1)
                        continue
                    else:
                        logger.error(f"Transfer failed after {max_transfer_attempts} attempts due to network error: {net_err}")
                        raise ValueError(
                            "Network busy. Your funds are safe - please try again in a minute."
                        ) from net_err
                except Exception as e:
                    err_str = str(e).lower()
                    if any(x in err_str for x in ["timeout", "connection", "network", "refused", "reset"]):
                        if transfer_attempts < max_transfer_attempts:
                            logger.warning(f"Network-like error during transfer (attempt {transfer_attempts}), retrying: {e}")
                            time.sleep(1)
                            continue
                        else:
                            logger.error(f"Transfer failed after {max_transfer_attempts} attempts: {e}")
                            raise ValueError(
                                "Network busy. Your funds are safe - please try again in a minute."
                            ) from e
                    raise

            tx_hash_hex = tx_hash.hex()
            if not tx_hash_hex.startswith("0x"):
                tx_hash_hex = f"0x{tx_hash_hex}"

            _record_transfer(req.user, tx_hash_hex, usd_int / 1_000_000, req.destination)
            logger.info(f"Wallet transfer successful: {req.user} -> {req.destination}, amount={usd_int}, tx={tx_hash_hex}")

            return tx_hash_hex
        except _NonceTooLowError:
            if attempt == 0:
                logger.warning("Relayer nonce too low, retrying...")
                time.sleep(0.5)
                continue
            raise


@app.on_event("startup")
async def startup():
    global http_client
    # Higher pool limits so many users can fan out to external APIs
    # (Hyperliquid, Finnhub, CoinGecko, Gemini, ipapi.co) without connection
    # starvation. Defaults are only (100, 20) which becomes a silent
    # bottleneck under burst traffic.
    http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=10.0),
        limits=httpx.Limits(
            max_connections=200,
            max_keepalive_connections=50,
            keepalive_expiry=30.0,
        ),
        # HTTP/2 multiplexes many requests per TCP connection — big win
        # when we spam the same host (e.g. api.hyperliquid.xyz).
        http2=False,  # keep off unless `h2` is installed; flip when the dep is added
    )

    # asyncio.to_thread uses the loop's default ThreadPoolExecutor, which
    # caps at min(32, cpu+4) — only 5 workers on a 1-CPU Railway replica.
    # Every supabase.*.execute() call we just wrapped goes through this
    # pool, so we need a lot more headroom before threads become the
    # bottleneck.
    try:
        import concurrent.futures
        loop = asyncio.get_running_loop()
        loop.set_default_executor(
            concurrent.futures.ThreadPoolExecutor(
                max_workers=64,
                thread_name_prefix="sb-io",
            )
        )
        logger.info("Default executor set to ThreadPoolExecutor(max_workers=64)")
    except Exception as e:
        logger.warning("Failed to resize default executor: %s", e)

    logger.info("OrbCast API started")


@app.on_event("shutdown")
async def shutdown():
    global http_client
    if http_client:
        await http_client.aclose()
    try:
        await ur_api.aclose_async_client()
    except Exception:
        pass
    logger.info("OrbCast API shutdown")


async def fetch_hyperliquid(request_type: str, params: dict = None) -> Any:
    """Make a request to Hyperliquid API"""
    payload = {"type": request_type}
    if params:
        payload.update(params)
    
    try:
        response = await http_client.post(HYPERLIQUID_API_URL, json=payload)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as e:
        logger.error(f"Hyperliquid API error: {e}")
        raise HTTPException(status_code=502, detail=f"Hyperliquid API error: {str(e)}")


# ---------------------------------------------------------------------------
# Cached metaAndAssetCtxs – weight-20 call, reused across many endpoints.
# TTL 10 s keeps data fresh enough while dramatically cutting HL API weight.
# keyed by dex name (None = main exchange).
# ---------------------------------------------------------------------------
import asyncio as _asyncio

_meta_cache: Dict[Optional[str], Any] = {}           # dex -> parsed JSON
_meta_cache_ts: Dict[Optional[str], float] = {}      # dex -> epoch
_meta_cache_lock = _asyncio.Lock()
_META_CACHE_TTL = 10  # seconds


_spot_meta_cache: Any = None
_spot_meta_cache_ts: float = 0
_spot_meta_cache_lock = _asyncio.Lock()


@api_router.get("/")
async def root():
    return {"message": "OrbCast API", "version": "1.0.0"}


@api_router.get("/health")
async def health():
    return {"status": "healthy", "service": "orbcast-api"}


@api_router.get("/version")
async def version():
    """Deploy provenance: which git commit this backend was built from.

    Railway injects RAILWAY_GIT_* on GitHub-triggered deploys, so anyone can
    cross-check the running API against the public repo. Empty in local dev.
    """
    commit = os.getenv("RAILWAY_GIT_COMMIT_SHA", "").strip()
    return {
        "service": "orbcast-api",
        "commit": commit or None,
        "branch": os.getenv("RAILWAY_GIT_BRANCH", "").strip() or None,
        "repo": "https://github.com/LWL-OrbCast/orbcast",
        "commit_url": (
            f"https://github.com/LWL-OrbCast/orbcast/commit/{commit}" if commit else None
        ),
    }


@api_router.get("/sports/football/epl")
async def sports_football_epl():
    """Premier League match chrome (API-Sports). Not trading odds."""
    return await get_epl_board()


def _parse_semver(v: Optional[str]) -> tuple:
    """Parse a dotted version string into a comparable tuple of ints.

    Tolerant: strips a leading 'v', ignores build/pre-release suffixes, and pads
    missing segments with 0 ('1.9' -> (1, 9, 0)). Unparseable input -> (0, 0, 0).
    """
    if not v or not isinstance(v, str):
        return (0, 0, 0)
    core = v.strip().lstrip("vV").split("+")[0].split("-")[0]
    parts = []
    for seg in core.split("."):
        digits = "".join(ch for ch in seg if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


def _semver_lt(a: Optional[str], b: Optional[str]) -> bool:
    """True iff version a < version b."""
    return _parse_semver(a) < _parse_semver(b)


@api_router.get("/app-version")
async def get_app_version_policy(
    platform: str = Query("android"),
    version: Optional[str] = Query(None),
):
    """Mobile update-policy check driving the in-app update banner.

    Source of truth is the ``app_version_policy`` table (one row per platform),
    editable live without a deploy. Returns a resolved decision so the client
    stays dumb:

      • ``updateAvailable`` — installed ``version`` < ``latest_version`` (soft)
      • ``forceUpdate``     — installed ``version`` < ``min_version`` (reserved)

    Fails open: any error / missing config returns a no-update response so a DB
    hiccup can never lock users out of the app.

    TODO(app-release): ``app.json`` version can be bumped early for the *next*
    EAS build. ``app_version_policy.latest_version`` must match what is *live on
    the store* — update only after Play/App Store publish, e.g.::

        UPDATE app_version_policy
        SET latest_version = '1.9.2', updated_at = now()
        WHERE platform IN ('android', 'ios');

    Setting ``latest_version`` to an unreleased app.json value makes the Update
    button open the store with nothing to install.
    """
    plat = (platform or "android").lower()
    if plat not in ("android", "ios"):
        plat = "android"

    no_update = {
        "enabled": False,
        "updateAvailable": False,
        "forceUpdate": False,
        "latestVersion": None,
        "minVersion": None,
        "storeUrl": None,
        "message": None,
    }

    if not supabase:
        return no_update

    try:
        res = (
            supabase.table("app_version_policy")
            .select("latest_version,min_version,store_url,enabled,message")
            .eq("platform", plat)
            .limit(1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            return no_update
        row = rows[0]

        if not row.get("enabled", False):
            return {**no_update, "enabled": False}

        latest = row.get("latest_version")
        minimum = row.get("min_version")
        store_url = row.get("store_url")

        update_available = bool(version) and _semver_lt(version, latest)
        force_update = bool(version) and _semver_lt(version, minimum)

        return {
            "enabled": True,
            "updateAvailable": update_available,
            "forceUpdate": force_update,
            "latestVersion": latest,
            "minVersion": minimum,
            "storeUrl": store_url,
            "message": row.get("message"),
        }
    except Exception as e:  # fail open — never block the app on a config read
        logger.warning("app-version policy lookup failed (%s): %s", plat, e)
        return no_update


# HIP-4 slice: cash-KYC / UR reward helpers lived in the deleted UR block.
async def _reconcile_cash_kyc_if_live(*args, **kwargs):
    return None


async def _award_cash_kyc(*args, **kwargs):
    return None


async def _award_cash_reward(*args, **kwargs):
    return None


async def _ur_reward_wallet_for_urid(*args, **kwargs):
    return None

@api_router.get("/builder-config")
async def get_builder_config(wallet_address: Optional[str] = None):
    """Get builder configuration for trades.

    If *wallet_address* is provided and the user has a rewards tier discount,
    the returned ``fee`` is reduced accordingly (but never below 0).
    """
    base_fee = BUILDER_FEE
    discount = 0
    if wallet_address and supabase:
        try:
            discount = await get_fee_discount_tenths(supabase, wallet_address)
        except Exception:
            pass  # non-critical
    effective_fee = max(0, base_fee - discount)
    return {
        "address": BUILDER_ADDRESS,
        "fee": effective_fee,
        "base_fee": base_fee,
        "discount": discount,
    }


# --------------------------------------------------------------------------- #
# Rewards & Referral endpoints
# --------------------------------------------------------------------------- #

@api_router.get("/rewards/profile")
async def rewards_profile_endpoint(
    wallet_address: str,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Get the full rewards profile for a user (points, tier, milestones, etc.)."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    wallet = wallet_address.lower()
    await _assert_caller_owns_wallet(auth_user, wallet)
    try:
        profile = await get_rewards_profile(supabase, wallet)
        return profile.dict()
    except Exception as e:
        logger.error("Failed to get rewards profile for %s: %s", wallet[:10], e)
        raise HTTPException(status_code=500, detail="Failed to load rewards profile")


@api_router.post("/rewards/apply-referral")
async def apply_referral_endpoint(
    req: ApplyReferralRequest,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Referee applies a referral code."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    await _assert_caller_owns_wallet(auth_user, req.wallet_address)
    try:
        result = await apply_referral_code(supabase, req.wallet_address, req.referral_code)
        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Apply referral failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to apply referral code")


@api_router.get("/rewards/referrals")
async def rewards_referrals_endpoint(
    wallet_address: str,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Get list of referred users."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    wallet = wallet_address.lower()
    await _assert_caller_owns_wallet(auth_user, wallet)
    try:
        refs = await get_referrals(supabase, wallet)
        return {"referrals": refs}
    except Exception as e:
        logger.error("Failed to get referrals for %s: %s", wallet[:10], e)
        raise HTTPException(status_code=500, detail="Failed to load referrals")


@api_router.get("/rewards/history")
async def rewards_history_endpoint(
    wallet_address: str,
    limit: int = 50,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Get point transaction history."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    wallet = wallet_address.lower()
    await _assert_caller_owns_wallet(auth_user, wallet)
    try:
        history = await get_point_history(supabase, wallet, limit)
        return {"history": history}
    except Exception as e:
        logger.error("Failed to get point history for %s: %s", wallet[:10], e)
        raise HTTPException(status_code=500, detail="Failed to load point history")


@api_router.get("/rewards/leaderboard")
async def rewards_leaderboard_endpoint(
    limit: int = 20,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Get top users by points."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        board = await get_leaderboard(supabase, limit)
        return {"leaderboard": board}
    except Exception as e:
        logger.error("Failed to get leaderboard: %s", e)
        raise HTTPException(status_code=500, detail="Failed to load leaderboard")


@api_router.get("/rewards/achievements")
async def rewards_achievements_list():
    """Get all available achievements + volume milestones + tier info."""
    return {
        "achievements": {
            k: {"id": k, **v} for k, v in ACHIEVEMENTS.items()
        },
        "volume_milestones": VOLUME_MILESTONES,
        "cash_volume_milestones": [],
        "tiers": TIERS,
    }


class ReportTradeRequest(BaseModel):
    wallet_address: str


# HL `userFillsByTime` costs weight 20+ per call.  Backend shares a single
# IP with a 1200 weight/min budget, so we cap syncs to once per 60s per
# wallet to leave headroom for trading / market-data calls.
_REWARDS_SYNC_MIN_INTERVAL_S = 60  # At most once per 60 seconds per user
_VOLUME_WM_MASTER = "master"
_VOLUME_WM_WALL = "_wall_ms"
_HL_FILLS_PAGE_HINT = 500  # HL time-range info responses cap at 500 rows
_HL_FILLS_MAX_PAGES = 5


def _volume_sync_state(profile: Dict[str, Any]) -> Tuple[int, int, Dict[str, Any]]:
    """Return (fill_cursor_ms, last_wall_ms, watermarks_dict)."""
    raw = profile.get("volume_sync_watermarks") or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, ValueError):
            raw = {}
    watermarks: Dict[str, Any] = dict(raw) if isinstance(raw, dict) else {}

    try:
        cursor = int(profile.get("last_volume_sync_at") or 0)
    except (TypeError, ValueError):
        cursor = 0
    if cursor <= 0:
        try:
            cursor = int(watermarks.get(_VOLUME_WM_MASTER) or 0)
        except (TypeError, ValueError):
            cursor = 0

    try:
        wall = int(watermarks.get(_VOLUME_WM_WALL) or 0)
    except (TypeError, ValueError):
        wall = 0
    return cursor, wall, watermarks


async def _fetch_user_fills_since(user: str, start_ms: int) -> List[Any]:
    """Paginate ``userFillsByTime`` (max 500 rows per page)."""
    all_fills: List[Any] = []
    cursor = max(0, int(start_ms or 0))
    for _ in range(_HL_FILLS_MAX_PAGES):
        page = await fetch_hyperliquid("userFillsByTime", {
            "user": user,
            "startTime": cursor,
        }) or []
        if not isinstance(page, list) or not page:
            break
        all_fills.extend(page)
        page_latest = 0
        for fill in page:
            if not isinstance(fill, dict):
                continue
            try:
                ts = int(fill.get("time", 0) or 0)
            except (TypeError, ValueError):
                continue
            if ts > page_latest:
                page_latest = ts
        if len(page) < _HL_FILLS_PAGE_HINT or page_latest <= 0:
            break
        nxt = page_latest + 1
        if nxt <= cursor:
            break
        cursor = nxt
    return all_fills


async def _run_trade_volume_sync(wallet: str) -> Dict[str, Any]:
    """Sync outcome-fill notional for ``wallet`` from Hyperliquid.

    Credits only HIP-4 coins (``#`` / ``+``). Cursor + volume increment
    commit together via ``credit_trade_volume_atomic`` so two replicas
    cannot double-count the same fills. Never trusts client-reported volume.
    """
    profile = await ensure_rewards_profile(supabase, wallet)
    fill_cursor, wall_ms, watermarks = _volume_sync_state(profile)

    now_ms = int(time.time() * 1000)
    if wall_ms > 0 and (now_ms - wall_ms) < _REWARDS_SYNC_MIN_INTERVAL_S * 1000:
        return {"volume_updated": 0, "new_achievements": [], "points_earned": 0, "skipped": "rate_limited"}

    try:
        hl_fills = await _fetch_user_fills_since(wallet, fill_cursor)
    except Exception as e:
        logger.warning("Failed to fetch HL fills for rewards sync %s: %s", wallet[:10], e)
        return {"volume_updated": 0, "new_achievements": [], "points_earned": 0, "skipped": "hl_fetch_error"}

    outcome_vol, latest_fill = sum_outcome_fills(hl_fills)
    next_cursor = fill_cursor
    if latest_fill >= fill_cursor:
        next_cursor = latest_fill + 1 if latest_fill > 0 else fill_cursor

    next_watermarks = dict(watermarks)
    next_watermarks[_VOLUME_WM_MASTER] = next_cursor
    next_watermarks[_VOLUME_WM_WALL] = now_ms

    return await apply_verified_volume(
        supabase,
        wallet,
        outcome_vol,
        fill_cursor,
        next_cursor,
        next_watermarks,
    )


@api_router.post("/rewards/report-trade")
async def rewards_report_trade_endpoint(
    req: ReportTradeRequest,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Enqueue an HL trade-volume sync for rewards tracking.

    Called by the frontend after a successful Hyperliquid order.
    The heavy work (Hyperliquid ``userFillsByTime`` + award logic) is
    deferred to the backend alert-worker loop so this endpoint is a
    single Supabase upsert — keeping the shared Hyperliquid IP rate-
    limit budget safe even when many users trade at once.

    All existing frontend call sites already treat the response as
    fire-and-forget (``.catch(() => {})``) and only read the returned
    shape to surface counters that are re-fetched from ``/rewards/profile``,
    so returning ``{queued: true, ...zeros}`` is backward compatible.
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not available")

    wallet = req.wallet_address.lower()
    await _assert_caller_owns_wallet(auth_user, wallet)

    try:
        await asyncio.to_thread(lambda: supabase.table("pending_trade_syncs").upsert(
            {
                "wallet_address": wallet,
                "enqueued_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="wallet_address",
        ).execute())
    except Exception as e:
        logger.warning("Failed to enqueue trade sync for %s: %s", wallet[:10], e)

    return {
        "volume_updated": 0,
        "new_achievements": [],
        "points_earned": 0,
        "queued": True,
    }


# ── Worker: drain the trade-sync queue ───────────────────────────────── #
# Hyperliquid enforces a global ~1200 weight/min rate limit per IP, and
# userFillsByTime has weight 20. We cap this drain at a conservative
# share of that budget so other REST fetches (metadata, clearinghouse
# fallbacks, etc.) retain headroom.
_TRADE_SYNC_BATCH_SIZE = 15          # up to 15 wallets processed per cycle
_TRADE_SYNC_MAX_ATTEMPTS = 5         # drop a row after repeated HL errors


async def _reenqueue_trade_sync(
    wallet: str,
    attempts: int,
    last_error: Optional[str],
    delay_s: int = 0,
) -> None:
    """Put a claimed wallet back on the queue (upsert by PK)."""
    when = datetime.now(timezone.utc)
    if delay_s > 0:
        when = when + timedelta(seconds=delay_s)
    await asyncio.to_thread(lambda: supabase.table("pending_trade_syncs").upsert(
        {
            "wallet_address": wallet,
            "enqueued_at": when.isoformat(),
            "attempts": attempts,
            "last_error": (last_error or "")[:500] or None,
        },
        on_conflict="wallet_address",
    ).execute())


async def _drain_trade_sync_queue() -> None:
    """Claim up to ``_TRADE_SYNC_BATCH_SIZE`` wallets (SKIP LOCKED) and sync.

    Claim is a DELETE in ``claim_pending_trade_syncs``, so two replicas
    cannot process the same row. Failed / conflicted syncs are re-enqueued.
    """
    if not supabase:
        return

    try:
        res = await asyncio.to_thread(lambda: (
            supabase.rpc("claim_pending_trade_syncs", {
                "p_limit": _TRADE_SYNC_BATCH_SIZE,
            }).execute()
        ))
    except Exception as e:
        logger.warning("Trade-sync drain: failed to claim queue: %s", e)
        return

    rows = res.data if isinstance(res.data, list) else []
    if not rows:
        return

    logger.info("Trade-sync drain: processing %d wallet(s)", len(rows))

    for row in rows:
        if not isinstance(row, dict):
            continue
        wallet = (row.get("wallet_address") or "").lower()
        attempts = int(row.get("attempts") or 0)
        if not wallet:
            continue

        try:
            result = await _run_trade_volume_sync(wallet)
            skip = result.get("skipped") if isinstance(result, dict) else None
            if skip == "rate_limited":
                await _reenqueue_trade_sync(
                    wallet, attempts, None, delay_s=_REWARDS_SYNC_MIN_INTERVAL_S,
                )
            elif skip == "hl_fetch_error":
                new_attempts = attempts + 1
                if new_attempts >= _TRADE_SYNC_MAX_ATTEMPTS:
                    logger.error(
                        "Trade-sync drain: dropping %s after %d HL errors",
                        wallet[:10], new_attempts,
                    )
                else:
                    await _reenqueue_trade_sync(wallet, new_attempts, "hl_fetch_error")
            elif skip == "cas_conflict":
                # Another replica committed this cursor. Retry shortly for leftover fills.
                await _reenqueue_trade_sync(wallet, attempts, "cas_conflict", delay_s=5)
            elif skip == "oversized":
                logger.error("Trade-sync drain: dropping oversized credit for %s", wallet[:10])
            # success / watermark-only credit: already claimed off the queue
        except Exception as e:
            new_attempts = attempts + 1
            if new_attempts >= _TRADE_SYNC_MAX_ATTEMPTS:
                logger.error(
                    "Trade-sync drain: dropping %s after %d attempts: %s",
                    wallet[:10], new_attempts, e,
                )
            else:
                logger.warning(
                    "Trade-sync drain: %s attempt %d failed: %s",
                    wallet[:10], new_attempts, e,
                )
                try:
                    await _reenqueue_trade_sync(wallet, new_attempts, str(e))
                except Exception:
                    pass


@api_router.post("/bridge2/deposit-with-permit")
async def bridge2_deposit_with_permit(
    req: Bridge2PermitDepositRequest,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """
    Gasless Bridge2 deposit using a USDC permit signature.

    The user signs an EIP-2612 Permit off-chain; the backend relayer submits
    `batchedDepositWithPermit` and pays Arbitrum gas.
    See: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/bridge2
    
    Requires authentication via Privy access token.
    """
    logger.info(f"Bridge2 deposit request from Privy user: {auth_user.user_id}, wallet: {req.user}")
    await _assert_caller_owns_wallet(auth_user, req.user)
    await _check_deposit_attempt_rate(req.user)
    # Ensure user has a rewards profile (creates one on first deposit)
    if supabase:
        asyncio.ensure_future(
            ensure_rewards_profile(supabase, req.user)
        )
    try:
        tx_hash = await asyncio.to_thread(_bridge2_batched_deposit_with_permit_sync, req)
        return {"ok": True, "txHash": tx_hash}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError:
        logger.exception("Bridge2 permit deposit unavailable")
        raise HTTPException(status_code=501, detail="Relayer or RPC is unavailable")
    except ContractLogicError as e:
        # On-chain revert (e.g. invalid permit signature/nonce/deadline).
        logger.exception("Bridge2 permit deposit reverted")
        raise HTTPException(status_code=400, detail=f"Bridge2 revert: {str(e)}")
    except Exception:
        # Common cases: insufficient relayer ETH, RPC issues, bad tx params.
        logger.exception("Bridge2 permit deposit failed")
        raise HTTPException(status_code=500, detail="Bridge2 permit deposit failed")


@api_router.get("/wallet/relayer-address")
async def get_relayer_address(user: Optional[str] = None):
    """Return the relayer address (spender) the client should sign its permit for.

    With multiple relayers configured, the caller MUST pass ?user=<wallet_address>
    so the server can return the deterministically-assigned relayer for that
    user. The mapping is stable (SHA-256 of the lowercased checksum address),
    so every request for the same user always returns the same relayer as
    long as the relayer pool is unchanged.

    For backwards compatibility, if only one relayer is configured, the `user`
    parameter is optional.
    """
    if not _RELAYER_ADDRESSES:
        raise HTTPException(status_code=501, detail="Relayer not configured")

    if user:
        try:
            relayer_addr, _ = select_relayer_for_user(user)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        return {
            "relayer": relayer_addr,
            "userAddress": Web3.to_checksum_address(user),
            "poolSize": len(_RELAYER_ADDRESSES),
        }

    if len(_RELAYER_ADDRESSES) == 1:
        return {"relayer": _RELAYER_ADDRESSES[0], "poolSize": 1}

    raise HTTPException(
        status_code=400,
        detail=(
            "Multiple relayers configured. Pass ?user=<wallet_address> to receive "
            "your assigned relayer."
        ),
    )


@api_router.post("/wallet/transfer-with-permit")
async def wallet_transfer_with_permit(
    req: WalletTransferRequest,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """
    Gasless USDC transfer from wallet to external address using permit signature.

    The user signs an EIP-2612 Permit off-chain approving the relayer;
    the backend relayer executes permit + transferFrom and pays Arbitrum gas.
    
    Requires authentication via Privy access token.
    """
    logger.info(f"Wallet transfer request from Privy user: {auth_user.user_id}, wallet: {req.user}, to: {req.destination}")
    await _assert_caller_owns_wallet(auth_user, req.user)
    try:
        tx_hash = await asyncio.to_thread(_wallet_transfer_with_permit_sync, req)
        return {"ok": True, "txHash": tx_hash}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError:
        logger.exception("Wallet transfer unavailable")
        raise HTTPException(status_code=501, detail="Relayer or RPC is unavailable")
    except ContractLogicError as e:
        logger.exception("Wallet transfer reverted")
        raise HTTPException(status_code=400, detail=f"Transfer revert: {str(e)}")
    except Exception:
        logger.exception("Wallet transfer failed")
        raise HTTPException(status_code=500, detail="Wallet transfer failed")


@api_router.get("/wallet/transfer-limit")
async def get_transfer_limit_status(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
    wallet_address: str = None,
):
    """
    Get the user's current transfer rate limit status.
    Returns remaining transfers and reset time.
    """
    if not wallet_address:
        raise HTTPException(status_code=400, detail="wallet_address query param required")
    await _assert_caller_owns_wallet(auth_user, wallet_address)

    if not supabase:
        # If Supabase not configured, return unlimited
        return {
            "max": TRANSFER_RATE_LIMIT_MAX,
            "used": 0,
            "remaining": TRANSFER_RATE_LIMIT_MAX,
            "resetInSeconds": None,
            "windowHours": TRANSFER_RATE_LIMIT_WINDOW_SECONDS // 3600,
        }
    
    user_key = wallet_address.lower()
    current_time = datetime.utcnow()
    cutoff_time = current_time - timedelta(seconds=TRANSFER_RATE_LIMIT_WINDOW_SECONDS)
    
    try:
        result = await asyncio.to_thread(lambda: supabase.table('transfer_rate_limits').select('transferred_at').eq(
            'user_address', user_key
        ).gte('transferred_at', cutoff_time.isoformat()).order('transferred_at', desc=False).execute())
        
        recent_transfers = result.data if result.data else []
        used_count = len(recent_transfers)
        remaining = max(0, TRANSFER_RATE_LIMIT_MAX - used_count)
        
        # Calculate reset time (when oldest transfer expires from window)
        reset_in_seconds = None
        if recent_transfers:
            oldest = datetime.fromisoformat(recent_transfers[0]['transferred_at'].replace('Z', '+00:00'))
            reset_time = oldest + timedelta(seconds=TRANSFER_RATE_LIMIT_WINDOW_SECONDS)
            reset_in_seconds = max(0, int((reset_time - datetime.now(oldest.tzinfo)).total_seconds()))
        
        return {
            "max": TRANSFER_RATE_LIMIT_MAX,
            "used": used_count,
            "remaining": remaining,
            "resetInSeconds": reset_in_seconds,
            "windowHours": TRANSFER_RATE_LIMIT_WINDOW_SECONDS // 3600,
        }
    except Exception as e:
        logger.error(f"Failed to get transfer limit status: {e}", exc_info=True)
        # On error, return default (allow transfers)
        return {
            "max": TRANSFER_RATE_LIMIT_MAX,
            "used": 0,
            "remaining": TRANSFER_RATE_LIMIT_MAX,
            "resetInSeconds": None,
            "windowHours": TRANSFER_RATE_LIMIT_WINDOW_SECONDS // 3600,
        }


# ============================================================================
# Push Notifications & Price Alerts Endpoints
# Token register + deposit pushes are live.
# ============================================================================

@api_router.post("/push/register-token")
async def register_push_token(
    req: RegisterPushTokenRequest,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """
    Register or update an Expo push token for the authenticated user.
    Called when user logs in or grants notification permissions.
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Push notifications not configured")

    await _ensure_user_onboarding(auth_user.user_id)
    
    try:
        # Clean up ALL old tokens for this user on the same platform.
        # Android/FCM rotates push tokens frequently; keeping stale tokens
        # causes failed deliveries every notification cycle.
        if req.platform:
            try:
                await asyncio.to_thread(lambda: supabase.table("push_tokens").delete().eq(
                    "user_id", auth_user.user_id
                ).eq(
                    "platform", req.platform
                ).neq(
                    "push_token", req.push_token
                ).execute())
            except Exception as cleanup_err:
                logger.warning(f"Failed to cleanup old {req.platform} tokens: {cleanup_err}")
        elif req.device_id:
            # Fallback: clean by device_id if platform not provided
            try:
                await asyncio.to_thread(lambda: supabase.table("push_tokens").delete().eq(
                    "user_id", auth_user.user_id
                ).eq(
                    "device_id", req.device_id
                ).neq(
                    "push_token", req.push_token
                ).execute())
            except Exception as cleanup_err:
                logger.warning(f"Failed to cleanup old tokens for device {req.device_id}: {cleanup_err}")
        
        # Normalize wallet address if provided
        wallet_addr = None
        if req.wallet_address:
            try:
                wallet_addr = Web3.to_checksum_address(req.wallet_address).lower()
            except Exception:
                wallet_addr = req.wallet_address.strip().lower() if req.wallet_address else None
            if wallet_addr:
                try:
                    await _assert_caller_owns_wallet(auth_user, wallet_addr)
                except HTTPException as own_err:
                    # Token still registers; deposit-alert wallet bind is optional.
                    logger.warning(
                        "Push token saved without wallet bind (%s)", own_err.detail
                    )
                    wallet_addr = None
        
        # Upsert the token (update if exists, insert if new)
        upsert_data: Dict[str, Any] = {
            "user_id": auth_user.user_id,
            "push_token": req.push_token,
            "device_id": req.device_id,
            "platform": req.platform,
        }
        if wallet_addr:
            upsert_data["wallet_address"] = wallet_addr
        await asyncio.to_thread(lambda: supabase.table("push_tokens").upsert(
            upsert_data, on_conflict="user_id,push_token"
        ).execute())
        
        # Create preferences row only when missing — never overwrite opt-out on re-register.
        try:
            existing_prefs = await asyncio.to_thread(
                lambda: supabase.table("user_notification_preferences")
                .select("user_id")
                .eq("user_id", auth_user.user_id)
                .limit(1)
                .execute()
            )
            if not existing_prefs.data:
                await asyncio.to_thread(
                    lambda: supabase.table("user_notification_preferences")
                    .insert({
                        "user_id": auth_user.user_id,
                        "system_alerts_enabled": True,
                    })
                    .execute()
                )
        except Exception as pref_err:
            logger.warning(f"Failed to create default preferences (non-critical): {pref_err}")
        
        logger.info(f"Push token registered for user {auth_user.user_id[:20]}...")
        return {"success": True, "message": "Push token registered"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to register push token: %s", e)
        raise HTTPException(status_code=500, detail="Failed to register push token")


@api_router.delete("/push/unregister-token")
async def unregister_push_token(
    push_token: str,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """
    Unregister a push token (e.g., on logout or when disabling notifications).
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    
    try:
        await asyncio.to_thread(lambda: supabase.table("push_tokens").delete().eq(
            "user_id", auth_user.user_id
        ).eq(
            "push_token", push_token
        ).execute())
        
        logger.info(f"Push token unregistered for user {auth_user.user_id[:20]}...")
        return {"success": True, "message": "Push token unregistered"}
    
    except Exception as e:
        logger.error(f"Failed to unregister push token: {e}")
        raise HTTPException(status_code=500, detail="Failed to unregister push token")


@api_router.get("/notifications/preferences")
async def get_notification_preferences(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """
    Get notification preferences for the authenticated user.
    Returns defaults if no preferences have been set.
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    
    try:
        result = await asyncio.to_thread(lambda: supabase.table("user_notification_preferences").select("*").eq(
            "user_id", auth_user.user_id
        ).execute())
        
        if result.data and len(result.data) > 0:
            return {"preferences": result.data[0]}
        
        # Return defaults if no preferences set
        return {
            "preferences": {
                "user_id": auth_user.user_id,
                "system_alerts_enabled": True,  # Default enabled
                "ur_transaction_alerts_enabled": True,
                "ur_card_alerts_enabled": True,
                "ur_kyc_alerts_enabled": True,
            }
        }
    
    except Exception as e:
        logger.error(f"Failed to fetch notification preferences: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch preferences")


class UpdateNotificationPreferencesRequest(BaseModel):
    system_alerts_enabled: Optional[bool] = None
    ur_transaction_alerts_enabled: Optional[bool] = None
    ur_card_alerts_enabled: Optional[bool] = None
    ur_kyc_alerts_enabled: Optional[bool] = None


@api_router.patch("/notifications/preferences")
async def update_notification_preferences(
    req: UpdateNotificationPreferencesRequest,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """
    Update notification preferences for the authenticated user.
    """
    if not supabase:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    
    try:
        # Build update dict
        update_data = {"user_id": auth_user.user_id}
        if req.system_alerts_enabled is not None:
            update_data["system_alerts_enabled"] = req.system_alerts_enabled
        if req.ur_transaction_alerts_enabled is not None:
            update_data["ur_transaction_alerts_enabled"] = req.ur_transaction_alerts_enabled
        if req.ur_card_alerts_enabled is not None:
            update_data["ur_card_alerts_enabled"] = req.ur_card_alerts_enabled
        if req.ur_kyc_alerts_enabled is not None:
            update_data["ur_kyc_alerts_enabled"] = req.ur_kyc_alerts_enabled
        
        # Upsert (create if doesn't exist, update if exists)
        result = await asyncio.to_thread(lambda: supabase.table("user_notification_preferences").upsert(
            update_data,
            on_conflict="user_id"
        ).execute())
        
        if result.data:
            return {"success": True, "preferences": result.data[0]}
        
        return {"success": True, "preferences": update_data}
    
    except Exception as e:
        logger.error(f"Failed to update notification preferences: {e}")
        raise HTTPException(status_code=500, detail="Failed to update preferences")


# ---------------------------------------------------------------------------
# Banking notification inbox (the bell feed on the Bank dashboard).
#
# Rows are produced server-side from UR webhooks (KYC outcome → system;
# pay-in / card spend / outgoing → transaction) into `ur_notifications`,
# scoped by Privy user_id. These endpoints are the read/mark-read surface for
# the in-app bell + notifications page.
# ---------------------------------------------------------------------------


def _serialize_notification(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "category": row.get("category"),
        "type": row.get("type"),
        "title": row.get("title"),
        "body": row.get("body"),
        "data": row.get("data") or {},
        "read": row.get("read_at") is not None,
        "createdAt": row.get("created_at"),
    }


@api_router.get("/notifications/feed")
async def get_notifications_feed(
    category: Optional[str] = None,
    limit: int = 50,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """List the authenticated user's banking notifications (most recent first)."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Notifications not configured")
    cat = category if category in ur_db.NOTIF_CATEGORIES else None
    limit = max(1, min(int(limit or 50), 100))
    try:
        rows = await asyncio.to_thread(
            ur_db.list_notifications,
            supabase, user_id=auth_user.user_id, limit=limit, category=cat,
        )
        unread = await asyncio.to_thread(
            ur_db.count_unread_notifications, supabase, user_id=auth_user.user_id,
        )
    except Exception as e:
        logger.error(f"Failed to fetch notifications feed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch notifications")
    return {
        "notifications": [_serialize_notification(r) for r in rows],
        "unreadCount": int(unread),
    }


@api_router.get("/notifications/unread-count")
async def get_notifications_unread_count(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Unread count for the bell badge."""
    if not supabase:
        return {"unreadCount": 0}
    try:
        unread = await asyncio.to_thread(
            ur_db.count_unread_notifications, supabase, user_id=auth_user.user_id,
        )
    except Exception as e:
        logger.error(f"Failed to count unread notifications: {e}")
        return {"unreadCount": 0}
    return {"unreadCount": int(unread)}


@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read_endpoint(
    notification_id: str,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Mark a single notification read (ownership-scoped)."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Notifications not configured")
    try:
        await asyncio.to_thread(
            ur_db.mark_notification_read,
            supabase, user_id=auth_user.user_id, notification_id=notification_id,
        )
        unread = await asyncio.to_thread(
            ur_db.count_unread_notifications, supabase, user_id=auth_user.user_id,
        )
    except Exception as e:
        logger.error(f"Failed to mark notification read: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark read")
    return {"success": True, "unreadCount": int(unread)}


@api_router.post("/notifications/read-all")
async def mark_all_notifications_read_endpoint(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Mark all of the user's notifications read (the 'duster' action)."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Notifications not configured")
    try:
        touched = await asyncio.to_thread(
            ur_db.mark_all_notifications_read, supabase, user_id=auth_user.user_id,
        )
    except Exception as e:
        logger.error(f"Failed to mark all notifications read: {e}")
        raise HTTPException(status_code=500, detail="Failed to mark all read")
    return {"success": True, "marked": int(touched), "unreadCount": 0}


# ============================================================================
# Onboarding Guide
# ============================================================================

async def _upsert_user_onboarding(privy_user_id: str, fields: Dict[str, Any]) -> None:
    """Upsert ``user_onboarding``, enriching with Privy email when available."""
    payload: Dict[str, Any] = {"user_id": privy_user_id, **fields}
    email = await asyncio.to_thread(privy_import.fetch_privy_user_email, privy_user_id)
    if email:
        payload["email"] = email
    await asyncio.to_thread(
        lambda: supabase.table("user_onboarding")
        .upsert(payload, on_conflict="user_id")
        .execute()
    )


async def _ensure_user_onboarding(privy_user_id: str) -> None:
    """Create the identity row on first auth. Does not mark any tour complete.

    Insert ``user_id`` first so a Privy email lookup cannot block the row.
    """
    if not supabase or not privy_user_id:
        return
    try:
        await asyncio.to_thread(
            lambda: supabase.table("user_onboarding")
            .upsert({"user_id": privy_user_id}, on_conflict="user_id")
            .execute()
        )
        logger.info("user_onboarding ensured for %s", privy_user_id[:24])
    except Exception as e:
        logger.warning("Failed to ensure user_onboarding for %s: %s", privy_user_id[:24], e)
        return
    try:
        email = await asyncio.to_thread(privy_import.fetch_privy_user_email, privy_user_id)
        if email:
            await asyncio.to_thread(
                lambda: supabase.table("user_onboarding")
                .update({"email": email})
                .eq("user_id", privy_user_id)
                .execute()
            )
    except Exception as e:
        logger.warning("user_onboarding email enrich failed for %s: %s", privy_user_id[:24], e)


# ---------------------------------------------------------------------------
# Profile avatar — private Storage bucket, path only on user_onboarding
# ---------------------------------------------------------------------------

AVATAR_BUCKET = "avatars"
AVATAR_MAX_BYTES = 2 * 1024 * 1024
AVATAR_MAX_EDGE = 512
AVATAR_MAX_PIXELS = 4096 * 4096
AVATAR_SIGNED_TTL_SEC = 60 * 60 * 24
_AVATAR_PATH_RE = re.compile(r"^[a-f0-9]{32}/avatar\.webp$")

# Decompression-bomb cap before Pillow decodes.
Image.MAX_IMAGE_PIXELS = AVATAR_MAX_PIXELS


def _avatar_object_path(privy_user_id: str) -> str:
    digest = hashlib.sha256(privy_user_id.encode("utf-8")).hexdigest()[:32]
    return f"{digest}/avatar.webp"


def _sniff_avatar_kind(data: bytes) -> Optional[str]:
    """Magic bytes only — never trust Content-Type or filename."""
    if len(data) < 12:
        return None
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def _sanitize_avatar_bytes(raw: bytes) -> bytes:
    """Reject polyglots / odd formats; re-encode to a small WebP."""
    if len(raw) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 2 MB or smaller")
    kind = _sniff_avatar_kind(raw)
    if kind is None:
        raise HTTPException(status_code=400, detail="Use a PNG, JPG, or WebP image")
    try:
        probe = io.BytesIO(raw)
        with Image.open(probe) as checked:
            checked.verify()
        probe.seek(0)
        img = Image.open(probe)
        img.load()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=400, detail="That file is not a valid image")
    fmt = (img.format or "").upper()
    expected = {"jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}[kind]
    if fmt != expected:
        img.close()
        raise HTTPException(status_code=400, detail="Use a PNG, JPG, or WebP image")
    if img.width * img.height > AVATAR_MAX_PIXELS:
        img.close()
        raise HTTPException(status_code=400, detail="Image is too large")
    try:
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P"):
            rgba = img.convert("RGBA")
            bg = Image.new("RGB", rgba.size, (255, 255, 255))
            bg.paste(rgba, mask=rgba.split()[-1])
            img = bg
        else:
            img = img.convert("RGB")
        img.thumbnail((AVATAR_MAX_EDGE, AVATAR_MAX_EDGE), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="WEBP", quality=82, method=6)
    finally:
        try:
            img.close()
        except Exception:
            pass
    cleaned = out.getvalue()
    if len(cleaned) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 2 MB or smaller")
    if _sniff_avatar_kind(cleaned) != "webp":
        raise HTTPException(status_code=400, detail="Could not process that image")
    return cleaned


def _ensure_avatars_bucket() -> None:
    if not supabase:
        return
    try:
        supabase.storage.get_bucket(AVATAR_BUCKET)
        return
    except Exception:
        pass
    try:
        supabase.storage.create_bucket(
            AVATAR_BUCKET,
            options={
                "public": False,
                "file_size_limit": AVATAR_MAX_BYTES,
                "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"],
            },
        )
    except Exception as e:
        logger.warning("avatars bucket create skipped: %s", e)


def _avatar_signed_url(path: str) -> Optional[str]:
    if not supabase or not path or not _AVATAR_PATH_RE.match(path):
        return None
    try:
        res = supabase.storage.from_(AVATAR_BUCKET).create_signed_url(path, AVATAR_SIGNED_TTL_SEC)
        url = None
        if isinstance(res, dict):
            url = res.get("signedURL") or res.get("signedUrl") or res.get("signed_url")
            data = res.get("data")
            if not url and isinstance(data, dict):
                url = data.get("signedUrl") or data.get("signedURL")
        if isinstance(url, str) and url:
            if url.startswith("http"):
                return url
            base = (SUPABASE_URL or "").rstrip("/")
            if url.startswith("/"):
                return f"{base}{url}" if "/storage/v1" in url else f"{base}/storage/v1{url}"
            return f"{base}/storage/v1/{url.lstrip('/')}"
    except Exception as e:
        logger.warning("avatar signed URL failed: %s", e)
    return None


def _upload_avatar_object(path: str, data: bytes) -> None:
    _ensure_avatars_bucket()
    supabase.storage.from_(AVATAR_BUCKET).upload(
        path,
        data,
        file_options={"content-type": "image/webp", "upsert": "true"},
    )


def _delete_avatar_object(path: str) -> None:
    if not path or not _AVATAR_PATH_RE.match(path):
        return
    try:
        supabase.storage.from_(AVATAR_BUCKET).remove([path])
    except Exception as e:
        logger.warning("avatar storage delete failed: %s", e)


@api_router.get("/onboarding/status")
async def get_onboarding_status(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        await _ensure_user_onboarding(auth_user.user_id)
        result = await asyncio.to_thread(lambda: supabase.table("user_onboarding").select("guide_completed").eq(
            "user_id", auth_user.user_id
        ).execute())

        if result.data and len(result.data) > 0:
            return {"guide_completed": result.data[0]["guide_completed"]}

        return {"guide_completed": False}

    except Exception as e:
        logger.error(f"Failed to fetch onboarding status: {e}")
        return {"guide_completed": False}


@api_router.get("/onboarding/account-info")
async def get_onboarding_account_info(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Return account metadata stored in user_onboarding (e.g. first-seen created_at)."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        await _ensure_user_onboarding(auth_user.user_id)
        result = await asyncio.to_thread(lambda: supabase.table("user_onboarding").select("created_at, avatar_path").eq(
            "user_id", auth_user.user_id
        ).execute())

        if result.data and len(result.data) > 0:
            row = result.data[0]
            path = row.get("avatar_path")
            avatar_url = await asyncio.to_thread(_avatar_signed_url, path) if path else None
            return {
                "created_at": row.get("created_at"),
                "avatar_url": avatar_url,
                "has_avatar": bool(path and avatar_url),
            }

        return {"created_at": None, "avatar_url": None, "has_avatar": False}

    except Exception as e:
        logger.error(f"Failed to fetch onboarding account info: {e}")
        return {"created_at": None, "avatar_url": None, "has_avatar": False}


class AvatarUploadRequest(BaseModel):
    """Raw image as base64. JSON avoids React Native multipart / file-URI 404s."""
    image_base64: str = Field(..., min_length=32, max_length=4_000_000)


def _decode_avatar_base64(payload: str) -> bytes:
    text = (payload or "").strip()
    if text.startswith("data:"):
        comma = text.find(",")
        if comma < 0:
            raise HTTPException(status_code=400, detail="Use a PNG, JPG, or WebP image")
        text = text[comma + 1 :]
    text = "".join(text.split())
    try:
        raw = base64.b64decode(text, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Use a PNG, JPG, or WebP image")
    if not raw:
        raise HTTPException(status_code=400, detail="Use a PNG, JPG, or WebP image")
    if len(raw) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 2 MB or smaller")
    return raw


@api_router.post("/onboarding/avatar")
async def upload_onboarding_avatar(
    body: AvatarUploadRequest,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Accept PNG / JPEG / WebP only. Re-encode server-side; store path on user_onboarding."""
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    logger.info("avatar upload start user=%s", auth_user.user_id[:24])
    raw = _decode_avatar_base64(body.image_base64)
    cleaned = await asyncio.to_thread(_sanitize_avatar_bytes, raw)
    path = _avatar_object_path(auth_user.user_id)

    try:
        await _ensure_user_onboarding(auth_user.user_id)
        await asyncio.to_thread(_upload_avatar_object, path, cleaned)
        await asyncio.to_thread(
            lambda: supabase.table("user_onboarding")
            .update({"avatar_path": path})
            .eq("user_id", auth_user.user_id)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("avatar upload failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not save avatar")

    avatar_url = await asyncio.to_thread(_avatar_signed_url, path)
    return {"success": True, "avatar_url": avatar_url, "has_avatar": bool(avatar_url)}


@api_router.delete("/onboarding/avatar")
async def delete_onboarding_avatar(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    path = _avatar_object_path(auth_user.user_id)
    try:
        await asyncio.to_thread(_delete_avatar_object, path)
        await asyncio.to_thread(
            lambda: supabase.table("user_onboarding")
            .update({"avatar_path": None})
            .eq("user_id", auth_user.user_id)
            .execute()
        )
    except Exception as e:
        logger.error("avatar delete failed: %s", e)
        raise HTTPException(status_code=500, detail="Could not remove avatar")

    return {"success": True, "avatar_url": None, "has_avatar": False}


@api_router.post("/onboarding/complete")
async def complete_onboarding(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        await _upsert_user_onboarding(
            auth_user.user_id,
            {
                "guide_completed": True,
                "completed_at": datetime.utcnow().isoformat(),
            },
        )

        return {"success": True}

    except Exception as e:
        logger.error(f"Failed to complete onboarding: {e}")
        raise HTTPException(status_code=500, detail="Failed to update onboarding status")


@api_router.get("/onboarding/asset-status")
async def get_asset_onboarding_status(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        await _ensure_user_onboarding(auth_user.user_id)
        result = await asyncio.to_thread(lambda: supabase.table("user_onboarding").select("asset_guide_completed").eq(
            "user_id", auth_user.user_id
        ).execute())

        if result.data and len(result.data) > 0:
            return {"asset_guide_completed": result.data[0].get("asset_guide_completed", False)}

        return {"asset_guide_completed": False}

    except Exception as e:
        logger.error(f"Failed to fetch asset onboarding status: {e}")
        return {"asset_guide_completed": False}


@api_router.post("/onboarding/complete-asset")
async def complete_asset_onboarding(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        await _upsert_user_onboarding(
            auth_user.user_id,
            {"asset_guide_completed": True},
        )

        return {"success": True}

    except Exception as e:
        logger.error(f"Failed to complete asset onboarding: {e}")
        raise HTTPException(status_code=500, detail="Failed to update asset onboarding status")


@api_router.get("/onboarding/interests")
async def get_onboarding_interests(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    """Return all bank/card waitlist flags for the signed-in user."""
    empty = {
        "bank_interest": False,
        "bank_region_interest": False,
        "bank_region_interest_country": None,
        "card_interest": False,
    }
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        result = await asyncio.to_thread(lambda: supabase.table("user_onboarding").select(
            "bank_interest, bank_region_interest, bank_region_interest_country, card_interest"
        ).eq("user_id", auth_user.user_id).execute())

        if result.data and len(result.data) > 0:
            row = result.data[0]
            return {
                "bank_interest": bool(row.get("bank_interest")),
                "bank_region_interest": bool(row.get("bank_region_interest")),
                "bank_region_interest_country": row.get("bank_region_interest_country"),
                "card_interest": bool(row.get("card_interest")),
            }

        return empty

    except Exception as e:
        logger.error(f"Failed to fetch onboarding interests: {e}")
        return empty


# ============================================================================
# Demo Trading Mode (HL testnet)
# ============================================================================

def _demo_status_payload_from_row(row: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Shape a demo_funding row (or None) into the public /demo/status payload.

    Uses local module helper rather than constructing DemoStatusResponse here
    so callers from the cleanup loop (where we don't have HTTP context) can
    log the same shape.
    """
    if not row:
        return {
            "claimed": False,
            "status": None,
            "claimed_at": None,
            "sent_at": None,
            "tx_hash": None,
            "amount_usdc": None,
            "grant_amount_usdc": DEMO_GRANT_AMOUNT_USDC,
        }
    # Treat 'failed' as not-yet-claimed from the user's perspective so the UI
    # surfaces a retry CTA. The DB row stays for auditability but doesn't
    # block re-attempts (cleanup task plus the claim flow handle re-creation).
    status = row.get("status")
    claimed = status == "sent"
    return {
        "claimed": claimed,
        "status": status,
        "claimed_at": row.get("claimed_at"),
        "sent_at": row.get("sent_at"),
        "tx_hash": row.get("tx_hash"),
        "amount_usdc": float(row.get("amount_usdc") or 0) if claimed else None,
        "grant_amount_usdc": DEMO_GRANT_AMOUNT_USDC,
    }


def _demo_funding_unavailable(exc: Exception) -> bool:
    text = str(exc)
    return "demo_funding" in text and (
        "PGRST205" in text
        or "schema cache" in text
        or "Could not find the table" in text
    )


def _fetch_demo_funding_row(privy_user_id: str) -> Optional[Dict[str, Any]]:
    """Single-row lookup. Returns None if no row exists. Lives outside async
    context (called via asyncio.to_thread) so the same helper works from both
    the request handler and the cleanup loop."""
    if not supabase:
        return None
    try:
        res = supabase.table("demo_funding").select("*").eq(
            "privy_user_id", privy_user_id
        ).limit(1).execute()
    except Exception as exc:
        if _demo_funding_unavailable(exc):
            return None
        raise
    rows = res.data or []
    return rows[0] if rows else None


def _fetch_demo_funding_by_device(device_id: str) -> Optional[Dict[str, Any]]:
    if not supabase or not device_id:
        return None
    res = supabase.table("demo_funding").select("*").eq(
        "device_id", device_id
    ).limit(1).execute()
    rows = res.data or []
    return rows[0] if rows else None


def _claim_demo_funds_sync(
    privy_user_id: str,
    wallet_address: str,
    device_id: Optional[str],
) -> Dict[str, Any]:
    """The full critical section for granting demo USDC, designed to be safe
    across the 4-replica deployment.

    Concurrency model:
      • ONE master agent on testnet → all signing serialised on the
        `demo_master:hl_testnet` lock id (Supabase relayer_lock table).
      • Per-user one-shot enforced via SELECT-then-INSERT under the same
        lock — no two replicas can race past the existence check because
        only one holds the lock at a time.
      • Per-device one-shot enforced via the same SELECT-under-lock plus a
        partial UNIQUE index as a defence-in-depth backstop (device_id is a
        soft sybil signal, not a primary key, so we surface a friendly error
        instead of letting the DB error bubble up).
      • If usdSend fails after we've inserted the 'pending' row, we mark the
        row 'failed' so the user can re-attempt. If the replica crashes in
        between, _demo_claim_cleanup_loop sweeps the stale 'pending' row
        after 2min so the user isn't permanently locked out.

    Returns a dict matching the DemoStatusResponse-ish shape, plus an
    `outcome` field: 'granted' | 'already_claimed' | 'device_taken'
    | 'pending_in_flight'.
    """
    if not demo_mode_enabled():
        raise RuntimeError("Demo mode not configured on this deployment")

    wallet_checksummed = Web3.to_checksum_address(wallet_address)
    master_addr = HL_TESTNET_MASTER_ADDRESS or ""

    if not _acquire_demo_master_lock(timeout_seconds=20.0):
        raise RuntimeError("Server busy — please try again in a moment.")

    try:
        # 1. Has this user ever claimed?
        existing = _fetch_demo_funding_row(privy_user_id)
        if existing:
            status = existing.get("status")
            if status == "sent":
                # Idempotent: same answer to a repeat tap. UI can show
                # "you already have $X" without an error toast.
                payload = _demo_status_payload_from_row(existing)
                payload["outcome"] = "already_claimed"
                return payload
            if status == "pending":
                # Another in-flight claim. Should be rare given we hold the
                # master lock, but possible if the previous replica crashed
                # mid-flow and the cleanup hasn't swept yet (< 2min window).
                payload = _demo_status_payload_from_row(existing)
                payload["outcome"] = "pending_in_flight"
                return payload
            # status == 'failed' → fall through to retry: delete the old row
            # so we can re-INSERT cleanly with a fresh claimed_at.
            supabase.table("demo_funding").delete().eq(
                "privy_user_id", privy_user_id
            ).execute()

        # 2. Device-level dedup. Skipped if the client didn't send a
        # device_id (older app builds) — we still let them claim, the
        # privy_user_id PK is the primary defense.
        if device_id:
            device_row = _fetch_demo_funding_by_device(device_id)
            if device_row:
                # A different Privy identity already claimed on this device.
                # Don't reveal which — just refuse.
                payload = _demo_status_payload_from_row(None)
                payload["outcome"] = "device_taken"
                return payload

        # 3. Insert pending row. Doing this BEFORE the network call means a
        # crash between insert and usdSend leaves an auditable trail, and
        # the cleanup task picks it up after 2min. The usdSend itself is
        # idempotent on the master nonce (HL rejects same-nonce replays)
        # so there's no risk of double-spending if we somehow retry.
        insert_row = {
            "privy_user_id": privy_user_id,
            "wallet_address": wallet_checksummed,
            "device_id": device_id,
            "amount_usdc": DEMO_GRANT_AMOUNT_USDC,
            "master_account": master_addr,
            "status": "pending",
        }
        try:
            supabase.table("demo_funding").insert(insert_row).execute()
        except Exception as ins_exc:
            # Race: another replica wrote between our SELECT and INSERT.
            # Re-fetch — if user row exists treat as already_claimed/in_flight,
            # if device_id constraint violated treat as device_taken.
            msg = str(ins_exc).lower()
            if "device_id" in msg or "demo_funding_device_idx" in msg:
                payload = _demo_status_payload_from_row(None)
                payload["outcome"] = "device_taken"
                return payload
            re_existing = _fetch_demo_funding_row(privy_user_id)
            if re_existing:
                payload = _demo_status_payload_from_row(re_existing)
                payload["outcome"] = (
                    "already_claimed" if re_existing.get("status") == "sent"
                    else "pending_in_flight"
                )
                return payload
            raise

        # 4. Sign and submit usdSend. If this throws, mark the row failed
        # so the user can retry on next tap.
        # Gross up by HL's flat transfer fee so the recipient nets exactly
        # the advertised grant. The DB row + UI continue to display the NET
        # grant — the fee gross-up is an implementation detail.
        wire_amount = DEMO_GRANT_AMOUNT_USDC + DEMO_TRANSFER_FEE_USDC
        try:
            audit_id = _hl_testnet_usd_send(wallet_checksummed, wire_amount)
        except Exception as send_exc:
            err_msg = (str(send_exc) or "unknown")[:500]
            logger.error("[demo] usdSend failed for user=%s wallet=%s: %s",
                         privy_user_id[:16], wallet_checksummed, err_msg)
            try:
                supabase.table("demo_funding").update({
                    "status": "failed",
                    "error_message": err_msg,
                }).eq("privy_user_id", privy_user_id).execute()
            except Exception as upd_exc:
                logger.warning("[demo] failed to mark row failed: %s", upd_exc)
            raise

        # 5. Success — flip to sent and return the post-update row.
        sent_at_iso = datetime.utcnow().isoformat()
        try:
            supabase.table("demo_funding").update({
                "status": "sent",
                "tx_hash": audit_id,
                "sent_at": sent_at_iso,
            }).eq("privy_user_id", privy_user_id).execute()
        except Exception as upd_exc:
            # The transfer landed but the DB write failed — log loudly so
            # support can reconcile manually. The user will see an error but
            # actually got their funds; on next /demo/status the row is
            # still 'pending' and the cleanup task will eventually mark it
            # failed. Edge case, won't repeat in normal ops.
            logger.error("[demo] DB update after successful usdSend failed: %s", upd_exc)
            raise

        final_row = _fetch_demo_funding_row(privy_user_id)
        payload = _demo_status_payload_from_row(final_row)
        payload["outcome"] = "granted"
        return payload

    finally:
        _release_demo_master_lock()


@api_router.post("/demo/claim-funds")
async def demo_claim_funds_endpoint(
    req: DemoClaimFundsRequest,
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
):
    if not demo_mode_enabled():
        raise HTTPException(status_code=503, detail="Demo mode not configured")
    if not Web3.is_address(req.wallet_address):
        raise HTTPException(status_code=400, detail="Invalid wallet_address")

    await _assert_caller_owns_wallet(auth_user, req.wallet_address)

    try:
        result = await asyncio.to_thread(
            _claim_demo_funds_sync,
            auth_user.user_id,
            req.wallet_address,
            (req.device_id or None),
        )
    except RuntimeError as exc:
        # "Server busy" lock contention or known-shape runtime failures.
        msg = str(exc)
        if "Server busy" in msg:
            raise HTTPException(status_code=503, detail=msg)
        raise HTTPException(status_code=502, detail=f"Demo grant failed: {msg}")
    except Exception as exc:
        logger.exception("[demo] unexpected error in claim-funds")
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}")

    outcome = result.pop("outcome", None)

    if outcome == "device_taken":
        # 409 Conflict — distinct from auth failures. Frontend can show
        # a "this device has already claimed" message.
        raise HTTPException(
            status_code=409,
            detail="This device has already claimed demo funds.",
        )

    if outcome == "pending_in_flight":
        # 409 with a distinct payload so frontend can show "still processing"
        # and retry after a short delay.
        return JSONResponse(
            status_code=202,
            content={"ok": False, "reason": "pending_in_flight", **result},
        )

    # 'granted' OR 'already_claimed' — both are idempotent successes.
    return {"ok": True, "outcome": outcome or "granted", **result}


@api_router.get("/demo/status")
async def demo_status_endpoint(
    auth_user: PrivyAuthUser = Depends(verify_privy_token),
) -> DemoStatusResponse:
    if not supabase:
        # Without Supabase we can't tell if the user claimed — fail closed
        # so the UI shows "claim available" rather than silently letting
        # them double-claim once Supabase comes back.
        raise HTTPException(status_code=503, detail="Database not configured")

    try:
        row = await asyncio.to_thread(_fetch_demo_funding_row, auth_user.user_id)
    except Exception as e:
        logger.error("[demo] /demo/status fetch failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to fetch demo status")

    payload = _demo_status_payload_from_row(row)
    return DemoStatusResponse(**payload)


def _sweep_stuck_demo_claims_sync() -> int:
    """Mark `pending` rows older than 2 minutes as `failed`.

    Master lock TTL is 60s, so anything still pending after 2min implies the
    replica that started the claim crashed (or got OOM-killed mid-request)
    before completing usdSend. Stuck rows would otherwise permanently block
    the user from retrying.

    Returns the number of rows swept (for logging)."""
    if not supabase:
        return 0
    cutoff = (datetime.utcnow() - timedelta(minutes=2)).isoformat()
    try:
        res = supabase.table("demo_funding").update({
            "status": "failed",
            "error_message": "timeout — replica crashed mid-claim before usdSend confirmation",
        }).eq("status", "pending").lt("claimed_at", cutoff).execute()
        swept = len(res.data or [])
        if swept:
            logger.info("[demo] cleanup swept %d stuck pending claim(s)", swept)
        return swept
    except Exception as exc:
        logger.warning("[demo] cleanup sweep error: %s", exc)
        return 0


async def _demo_claim_cleanup_loop():
    """Leader-gated cleanup loop. Runs only on the replica that holds the
    `demo_claim_cleanup` task leadership lease, so 4 replicas don't all sweep
    in parallel. 60s sleep between cycles, 120s leadership TTL — exactly
    matches the existing alert-worker pattern."""
    logger.info("Demo claim cleanup loop started (replica %s)", _REPLICA_ID[:8])
    while True:
        try:
            is_leader = await asyncio.to_thread(
                _try_claim_leadership, "demo_claim_cleanup", 120
            )
            if is_leader:
                await asyncio.to_thread(_sweep_stuck_demo_claims_sync)
            else:
                logger.debug("Demo cleanup: another replica holds the lease this cycle")
        except Exception as exc:
            logger.exception("Demo cleanup loop error: %s", exc)
        await asyncio.sleep(60)


_demo_cleanup_task: Optional[asyncio.Task] = None


def start_demo_cleanup_worker():
    """Start the demo claim cleanup background task. Idempotent — second
    call is a no-op."""
    global _demo_cleanup_task
    if not supabase:
        logger.info("Demo cleanup worker not started: Supabase not configured")
        return
    if not demo_mode_enabled():
        logger.info("Demo cleanup worker not started: demo mode disabled")
        return
    if _demo_cleanup_task is not None:
        return
    _demo_cleanup_task = asyncio.create_task(_demo_claim_cleanup_loop())
    logger.info("Demo cleanup worker task created (replica %s)", _REPLICA_ID[:8])


def stop_demo_cleanup_worker():
    global _demo_cleanup_task
    if _demo_cleanup_task:
        _demo_cleanup_task.cancel()
        _demo_cleanup_task = None


# ============================================================================
# Push send + deposit scan (HIP-4).
# ============================================================================


def _send_push_notification(push_token: str, title: str, body: str, data: Optional[Dict] = None) -> bool:
    """
    Send a push notification via Expo's push service.
    Returns True if successful, False otherwise.
    """
    try:
        response = push_client.publish(
            PushMessage(
                to=push_token,
                title=title,
                body=body,
                data=data or {},
                sound="default",
                badge=1,
            )
        )
        
        # Check for errors
        if response.status == "ok":
            return True
        else:
            logger.warning(f"Push notification failed: {response.message}")
            return False
    
    except DeviceNotRegisteredError:
        # Token is invalid, should be removed
        logger.info(f"Device not registered, removing token: {push_token[:20]}...")
        if supabase:
            try:
                supabase.table("push_tokens").delete().eq("push_token", push_token).execute()
            except Exception:
                pass
        return False
    
    except PushServerError as e:
        logger.error(f"Push server error: {e}")
        return False
    
    except Exception as e:
        logger.error(f"Failed to send push notification: {e}")
        return False


# ============================================================================
# USDC Deposit Notification Poller
# ============================================================================

# Arbitrum USDC ERC-20 Transfer event topic: Transfer(address,address,uint256)
_USDC_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
# Poll every N alert cycles (e.g. every 2nd cycle = ~60s at 30s interval)
_DEPOSIT_POLL_CYCLE_INTERVAL = 2
_deposit_poll_counter = 0
# Minimum USDC amount to trigger a deposit notification (ignore dust/rebates)
_MIN_DEPOSIT_NOTIFY_USDC = 0.5  # $0.5


async def _check_deposit_notifications():
    """
    Poll Arbitrum for incoming USDC transfers to user embedded wallets.
    Sends a push notification when a deposit is detected.
    """
    global _deposit_poll_counter
    _deposit_poll_counter += 1
    if _deposit_poll_counter % _DEPOSIT_POLL_CYCLE_INTERVAL != 0:
        return  # Skip this cycle

    if not supabase or not ARBITRUM_RPC_URL:
        return

    try:
        # 1. Get all wallet addresses that have push tokens registered
        tokens_result = await asyncio.to_thread(lambda: supabase.table("push_tokens").select(
            "user_id, push_token, wallet_address"
        ).not_.is_("wallet_address", "null").execute())

        if not tokens_result.data:
            return  # No wallets to monitor

        # Build wallet → push_tokens mapping
        wallet_to_tokens: Dict[str, List[Dict[str, str]]] = {}
        for row in tokens_result.data:
            w = row["wallet_address"].lower()
            if w not in wallet_to_tokens:
                wallet_to_tokens[w] = []
            wallet_to_tokens[w].append({
                "user_id": row["user_id"],
                "push_token": row["push_token"],
            })

        if not wallet_to_tokens:
            return

        # 2. Get cursor (last scanned block)
        cursor_result = await asyncio.to_thread(lambda: supabase.table("deposit_scan_cursor").select("last_block").eq(
            "id", "singleton"
        ).execute())
        last_block = 0
        if cursor_result.data and len(cursor_result.data) > 0:
            last_block = int(cursor_result.data[0]["last_block"])

        # 3. Get latest block from Arbitrum RPC
        async with httpx.AsyncClient(timeout=10.0) as rpc_client:
            resp = await rpc_client.post(ARBITRUM_RPC_URL, json={
                "jsonrpc": "2.0", "id": 1, "method": "eth_blockNumber", "params": []
            })
            rpc_data = resp.json()
            latest_block = int(rpc_data["result"], 16)

        # First run: start from ~500 blocks ago (~2 min on Arbitrum) to avoid scanning all history
        if last_block == 0:
            last_block = max(0, latest_block - 500)

        # Don't scan if we're already up-to-date
        if latest_block <= last_block:
            return

        # Cap scan range to 2000 blocks per cycle to avoid huge RPC responses
        from_block = last_block + 1
        to_block = min(latest_block, from_block + 2000)

        from_hex = hex(from_block)
        to_hex = hex(to_block)

        # 4. Query eth_getLogs for ALL USDC Transfer events in the block range
        #    We don't filter by recipient — we'll match in memory against known wallets.
        async with httpx.AsyncClient(timeout=15.0) as rpc_client:
            resp = await rpc_client.post(ARBITRUM_RPC_URL, json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "eth_getLogs",
                "params": [{
                    "address": ARBITRUM_USDC_ADDRESS,
                    "topics": [_USDC_TRANSFER_TOPIC],
                    "fromBlock": from_hex,
                    "toBlock": to_hex,
                }]
            })
            logs_data = resp.json()

        logs = logs_data.get("result", [])
        if not isinstance(logs, list):
            logger.warning("Deposit poller: unexpected eth_getLogs response")
            # Still update cursor to avoid re-scanning
            await asyncio.to_thread(lambda: supabase.table("deposit_scan_cursor").update({
                "last_block": to_block,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", "singleton").execute())
            return

        # 5. Classify each Transfer event for our wallets. One chain event can
        #    produce up to TWO notifications when both ends are watched app
        #    wallets (P2P): sender gets out_*, recipient gets in_ext. Directions:
        #      • `in_ext`       — USDC arrived at a watched wallet (external
        #                         deposit, HL trade→wallet landing, bank cash-out,
        #                         or another Hypertrade user). "Deposit Received".
        #      • `out_bridge2`  — user moved USDC from wallet to HL Bridge2.
        #                         "Trade balance funded" push.
        #      • `out_ext`      — user sent USDC from wallet to any other
        #                         address. Generic "USDC Sent" push.
        #    Same-address self-transfers only notify as outgoing (no in_ext).
        bridge2_addr = BRIDGE2_ADDRESS.lower() if BRIDGE2_ADDRESS else None
        events_to_notify: List[Dict[str, Any]] = []
        for log in logs:
            try:
                topics = log.get("topics", [])
                if len(topics) < 3:
                    continue
                # topics[1] = from, topics[2] = to (both padded to 32 bytes)
                sender = ("0x" + topics[1][26:]).lower()
                recipient = ("0x" + topics[2][26:]).lower()

                data_str = log.get("data", "0x0")
                amount_raw = int(data_str, 16)
                amount_usdc = amount_raw / 1e6
                if amount_usdc < _MIN_DEPOSIT_NOTIFY_USDC:
                    continue  # Skip dust / zero amounts
                tx_hash = log.get("transactionHash", "")
                if not tx_hash:
                    continue

                wallet_is_recipient = recipient in wallet_to_tokens
                wallet_is_sender = sender in wallet_to_tokens
                is_self_transfer = sender == recipient

                if wallet_is_sender:
                    if bridge2_addr and recipient == bridge2_addr:
                        direction = "out_bridge2"
                    else:
                        direction = "out_ext"
                    events_to_notify.append({
                        "tx_hash": tx_hash,
                        "wallet_address": sender,
                        "amount_usdc": amount_usdc,
                        "direction": direction,
                        "counterparty": recipient,
                    })

                # Recipient deposit push — including P2P between two watched
                # wallets. Skip self-transfers so we don't double-notify.
                if wallet_is_recipient and not is_self_transfer:
                    events_to_notify.append({
                        "tx_hash": tx_hash,
                        "wallet_address": recipient,
                        "amount_usdc": amount_usdc,
                        "direction": "in_ext",
                        "counterparty": sender,
                    })
            except Exception:
                continue

        # 6. Dedup and send notifications. `deposit_notifications_log` has a
        # unique (tx_hash, wallet_address) constraint, so encode the direction
        # into the stored tx_hash key to allow multiple rows per real tx_hash
        # (e.g. a self-send could match twice). This avoids a schema change.
        for evt in events_to_notify:
            tx_hash = evt["tx_hash"]
            wallet = evt["wallet_address"]
            amount = evt["amount_usdc"]
            direction = evt["direction"]
            counterparty = evt["counterparty"]
            dedup_key = f"{tx_hash}:{direction}"

            try:
                existing = await asyncio.to_thread(lambda: supabase.table("deposit_notifications_log").select("id").eq(
                    "tx_hash", dedup_key
                ).eq(
                    "wallet_address", wallet
                ).execute())
                if existing.data and len(existing.data) > 0:
                    continue  # Already notified
            except Exception:
                pass

            tokens_for_wallet = wallet_to_tokens.get(wallet, [])
            if not tokens_for_wallet:
                continue
            sent_count = 0

            # Format amount nicely
            if amount >= 1:
                amount_str = f"${amount:,.2f}"
            else:
                amount_str = f"${amount:.6f}"

            if direction == "in_ext":
                title = "💰 Deposit Received"
                body = f"{amount_str} USDC deposited to your wallet"
                push_type = "deposit_received"
            elif direction == "out_bridge2":
                title = "📈 Trade balance funded"
                body = f"{amount_str} USDC sent to your trade balance"
                push_type = "trade_balance_funded"
            else:  # out_ext
                # Truncate destination for privacy + readability (standard
                # wallet-UX pattern: 0xABCD…1234).
                cp_short = f"{counterparty[:6]}…{counterparty[-4:]}" if counterparty else ""
                title = "↗️ USDC Sent"
                body = (
                    f"{amount_str} USDC sent to {cp_short}" if cp_short
                    else f"{amount_str} USDC sent"
                )
                push_type = "wallet_usdc_sent"

            for token_info in tokens_for_wallet:
                success = await asyncio.to_thread(
                    _send_push_notification,
                    token_info["push_token"],
                    title,
                    body,
                    {
                        "type": push_type,
                        "amount_usdc": str(amount),
                        "tx_hash": tx_hash,
                        "direction": direction,
                        "counterparty": counterparty,
                    },
                )
                if success:
                    sent_count += 1

            try:
                await asyncio.to_thread(lambda: supabase.table("deposit_notifications_log").insert({
                    "tx_hash": dedup_key,
                    "wallet_address": wallet,
                    "amount_usdc": amount,
                }).execute())
            except Exception as e:
                if "unique" not in str(e).lower() and "duplicate" not in str(e).lower():
                    logger.warning(f"Failed to log transfer notification: {e}")

            if sent_count > 0:
                logger.info(
                    f"Transfer notification ({direction}) sent: {amount_str} USDC for {wallet[:10]}… "
                    f"(tx={tx_hash[:16]}…, {sent_count} device(s))"
                )

        # 7. Update cursor
        await asyncio.to_thread(lambda: supabase.table("deposit_scan_cursor").update({
            "last_block": to_block,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", "singleton").execute())

        if events_to_notify:
            logger.info(
                f"Transfer poller: scanned blocks {from_block}–{to_block}, found {len(events_to_notify)} event(s) "
                f"across known wallets"
            )

    except Exception as e:
        logger.error(f"Error in transfer notification check: {e}")


def _try_claim_leadership(
    task_name: str = "alert_worker",
    ttl_seconds: int = _LEADER_TTL_SECONDS,
) -> bool:
    """Attempt to claim or renew leadership for a background task via Supabase.

    Returns True if this replica is the current leader for *task_name*.

    For the hot alert loop we keep the default short TTL (~45s) so a
    crashed leader is replaced quickly. For rarely-fired jobs like daily
    CoinGecko supply or weekly Finnhub fundamentals we pass a TTL just
    shorter than the job interval — the winning replica holds the lease
    across the whole cycle so other replicas short-circuit when they
    wake up, turning N redundant syncs into exactly one.
    """
    if not supabase:
        return True  # dev mode — single process
    try:
        res = supabase.rpc("try_claim_leadership", {
            "p_task": task_name,
            "p_holder_id": _REPLICA_ID,
            "p_ttl_seconds": ttl_seconds,
        }).execute()
        return res.data is True
    except Exception as exc:
        logger.warning("Leadership claim failed for %s (will skip this cycle): %s", task_name, exc)
        return False


async def _alert_worker_loop():
    """Main loop for the alert background worker.

    Each iteration starts by trying to claim leadership.  Only the leader
    replica executes the actual work; all others just sleep and re-try
    on the next cycle.  This guarantees that deposit scanning and
    (when enabled) alert notifications are never duplicated across replicas.
    """
    logger.info("Alert worker loop started (replica %s)", _REPLICA_ID[:8])

    _sig_cleanup_counter = 0
    while True:
        is_leader = await asyncio.to_thread(_try_claim_leadership)
        if is_leader:
            try:
                await _check_deposit_notifications()
                await _drain_trade_sync_queue()

                # Purge expired rows every ~60 cycles (~30 min)
                _sig_cleanup_counter += 1
                if _sig_cleanup_counter >= 60:
                    _sig_cleanup_counter = 0
                    try:
                        await asyncio.to_thread(lambda: supabase.table("used_signatures").delete().lt(
                            "used_at", (datetime.utcnow() - timedelta(hours=2)).isoformat()
                        ).execute())
                    except Exception as ce:
                        logger.debug("Signature cleanup error: %s", ce)
            except Exception as e:
                logger.error("Alert worker error: %s", e)
        else:
            logger.debug("Not leader this cycle — skipping worker tasks")

        await asyncio.sleep(ALERT_CHECK_INTERVAL_SECONDS)


def start_alert_worker():
    """Start the alert background worker task."""
    global _alert_worker_task
    if not supabase:
        logger.warning("Cannot start alert worker: Supabase not configured")
        return
    if _alert_worker_task is not None:
        logger.info("Alert worker already running")
        return
    _alert_worker_task = asyncio.create_task(_alert_worker_loop())
    logger.info("Alert worker task created (replica %s)", _REPLICA_ID[:8])


def stop_alert_worker():
    """Cancel the alert background worker task."""
    global _alert_worker_task
    if _alert_worker_task:
        _alert_worker_task.cancel()
        _alert_worker_task = None
    logger.info("Alert worker stopped")


# Start background workers on app startup
@app.on_event("startup")
async def startup_event():
    """Called when the FastAPI app starts."""
    logger.info("Replica %s starting up", _REPLICA_ID[:8])
    start_alert_worker()
    start_demo_cleanup_worker()

    # Display-currency rates — table exists; fill it so the first /forex/rates is a cache hit.
    asyncio.create_task(_warmup_forex_rates_on_startup())

    # Unused leftover (earnings / CoinGecko supply / stock fundamentals / Finnhub
    # stock news) is not started. /news endpoints stay for a later sports feed.

@app.on_event("shutdown")
async def shutdown_event():
    """Called when the FastAPI app shuts down."""
    stop_alert_worker()
    stop_demo_cleanup_worker()
# Include the router in the main app
# ---------------------------------------------------------------------------
# Geo-fence: block users from restricted regions (US)
# DISABLED FOR TESTING — keep the original below to restore.
# API lookup (ipapi.co HTTPS) with 24 h per-IP cache.
# Enforced via both a /geo-check endpoint (frontend screen) AND
# middleware (prevents direct API bypass).
# ---------------------------------------------------------------------------
# import ipaddress as _ipaddress
#
# _APPLE_REVIEW_BYPASS = os.getenv("APPLE_REVIEW_BYPASS", "").lower() == "true"
#
# _geo_cache: Dict[str, Tuple[str, float]] = {}  # ip -> (country_code, epoch)
# _GEO_CACHE_TTL = 86_400
# _GEO_BLOCKED_COUNTRIES = {
#     "US",  # United States
#     "UK",  # United Kingdom
#     "KP",  # North Korea
#     "IR",  # Iran
#     "CU",  # Cuba
#     "RU",  # Russia (includes Crimea, Donetsk, Luhansk in most geo-IP databases)
# }
# # Paths that must remain accessible regardless of geo (health, geo-check itself)
# _GEO_EXEMPT_PATHS = {"/api/geo-check", "/api/health", "/health", "/", "/docs", "/openapi.json"}
#
#
# def _is_private_ip(ip: str) -> bool:
#     """Return True for loopback / private / link-local addresses."""
#     try:
#         return _ipaddress.ip_address(ip).is_private
#     except (ValueError, TypeError):
#         return False
#
#
# def _get_client_ip(request: Request) -> str:
#     """Extract real client IP from proxy headers (Railway / Cloudflare / nginx)."""
#     forwarded = request.headers.get("x-forwarded-for")
#     if forwarded:
#         return forwarded.split(",")[0].strip()
#     real_ip = request.headers.get("x-real-ip")
#     if real_ip:
#         return real_ip.strip()
#     return request.client.host if request.client else "0.0.0.0"
#
#
# async def _lookup_country(ip: str) -> Optional[str]:
#     """Return ISO 3166-1 alpha-2 country code for *ip*, or None on failure."""
#     import time as _time
#
#     # Never look up private/local IPs
#     if _is_private_ip(ip):
#         return None
#
#     cached = _geo_cache.get(ip)
#     if cached:
#         code, ts = cached
#         if (_time.time() - ts) < _GEO_CACHE_TTL:
#             return code
#
#     try:
#         resp = await http_client.get(
#             f"https://ipapi.co/{ip}/json/",
#             timeout=3.0,
#         )
#         data = resp.json()
#         if not data.get("error"):
#             code = data.get("country_code", "")
#             _geo_cache[ip] = (code, _time.time())
#             return code
#     except Exception as exc:
#         logger.warning(f"Geo lookup failed for {ip}: {exc}")
#
#     return None


# ---------------------------------------------------------------------------
# Forex display-currency rates  (ExchangeRate-API, cached 24 h in Supabase)
# ---------------------------------------------------------------------------
async def _fetch_and_upsert_forex_rates(*, force: bool = False) -> Dict[str, Any]:
    """Return USD-based rates. When ``force`` is False, reuse Supabase cache <24 h old."""
    if not FOREXRATE_KEY:
        raise HTTPException(status_code=503, detail="Forex rate service not configured")

    if not force:
        row = await asyncio.to_thread(
            lambda: supabase.table("forex_rates_cache").select("*")
            .eq("base_currency", "USD").maybe_single().execute()
        )
        cached = row.data if row else None
        if cached and cached.get("rates"):
            updated_at = datetime.fromisoformat(cached["updated_at"].replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - updated_at).total_seconds() / 3600
            if age_hours < 24:
                return {
                    "base": "USD",
                    "rates": _normalize_forex_rates(cached["rates"]),
                    "updated_at": cached["updated_at"],
                }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{FOREXRATE_BASE_URL}/{FOREXRATE_KEY}/latest/USD")
        resp.raise_for_status()
        data = resp.json()

    if data.get("result") != "success":
        raise HTTPException(status_code=502, detail="ExchangeRate-API returned error")

    all_rates = data.get("conversion_rates", {})
    filtered = {code: all_rates[code] for code in FOREXRATE_SUPPORTED if code in all_rates}
    if "CNH" not in filtered and "CNY" in all_rates:
        filtered["CNH"] = all_rates["CNY"]
    filtered["USD"] = 1.0
    filtered = _normalize_forex_rates(filtered)

    now_iso = datetime.now(timezone.utc).isoformat()
    await asyncio.to_thread(
        lambda: supabase.table("forex_rates_cache").upsert({
            "base_currency": "USD",
            "rates": filtered,
            "updated_at": now_iso,
        }).execute()
    )
    return {"base": "USD", "rates": filtered, "updated_at": now_iso}


async def _warmup_forex_rates_on_startup() -> None:
    """Populate forex_rates_cache once at boot. Needed for display-currency conversion."""
    if not FOREXRATE_KEY:
        logger.info("Forex rates: FOREXRATE_KEY not set — /forex/rates will 503 until it is")
        return
    if not supabase:
        logger.info("Forex rates: Supabase not configured — skipping cache warmup")
        return
    try:
        result = await _fetch_and_upsert_forex_rates(force=False)
        logger.info("Forex rates cache ready (updated_at=%s)", result.get("updated_at"))
    except Exception as exc:
        logger.warning("Forex rates warmup failed: %s", exc)


@api_router.get("/forex/rates")
async def get_forex_rates():
    """Return USD-based exchange rates for supported display currencies.

    Reads from a Supabase cache table (`forex_rates_cache`).  If the cached row
    is older than 24 hours the endpoint fetches fresh rates from ExchangeRate-API,
    upserts them into Supabase, and returns the new rates.  This keeps external
    API usage to ~1 request / day regardless of backend replica count.
    """
    try:
        return await _fetch_and_upsert_forex_rates(force=False)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Forex rates fetch failed: {exc}")
        # Attempt to return stale cache on error
        try:
            row = await asyncio.to_thread(
                lambda: supabase.table("forex_rates_cache").select("*")
                .eq("base_currency", "USD").maybe_single().execute()
            )
            if row and row.data and row.data.get("rates"):
                return {
                    "base": "USD",
                    "rates": _normalize_forex_rates(row.data["rates"]),
                    "updated_at": row.data["updated_at"],
                }
        except Exception:
            pass
        raise HTTPException(status_code=502, detail="Failed to fetch forex rates")


@api_router.post("/forex/rates/refresh")
async def refresh_forex_rates(request: Request):
    """Bypass the 24 h Supabase cache and fetch fresh display-currency rates.

    Gated by ``INTERNAL_SYNC_SECRET`` (or ``ALPHA_WARMUP_SECRET``). Pass via
    ``Authorization: Bearer <secret>`` or ``?secret=<secret>``.
    """
    _assert_internal_sync_authorized(request)
    try:
        result = await _fetch_and_upsert_forex_rates(force=True)
        return {"ok": True, **result}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Forex rates refresh failed: {exc}")
        raise HTTPException(status_code=502, detail="Failed to refresh forex rates")


# Geo-check (disabled for testing)
# @api_router.get("/geo-check")
# async def geo_check(request: Request):
#     """Return whether the caller's region is allowed."""
#     if _APPLE_REVIEW_BYPASS:
#         return {"allowed": True, "country": None}
#     ip = _get_client_ip(request)
#     country = await _lookup_country(ip)
#     blocked = country in _GEO_BLOCKED_COUNTRIES if country else False
#     return {"allowed": not blocked, "country": country}


app.include_router(api_router)

# ---------------------------------------------------------------------------
# Geo-fence middleware — DISABLED FOR TESTING.
# Enforces block on ALL API routes so users cannot bypass the frontend check.
# Runs *after* CORS (added below) so preflight OPTIONS still work.
# Fail-open: if lookup fails (None), allow the request through.
# ---------------------------------------------------------------------------
# @app.middleware("http")
# async def geo_block_middleware(request: Request, call_next):
#     if _APPLE_REVIEW_BYPASS:
#         return await call_next(request)
#
#     path = request.url.path
#     # Skip exempt paths and non-API routes
#     if (
#         path in _GEO_EXEMPT_PATHS
#         or path.startswith("/api/showcase")
#         or not path.startswith("/api/")
#     ):
#         return await call_next(request)
#
#     ip = _get_client_ip(request)
#     country = await _lookup_country(ip)
#
#     if country in _GEO_BLOCKED_COUNTRIES:
#         return JSONResponse(
#             status_code=451,  # Unavailable For Legal Reasons
#             content={"detail": "This service is not available in your region."},
#         )
#
#     return await call_next(request)


# CORS: Restrict to known origins (mobile apps bypass CORS entirely)
ALLOWED_ORIGINS = [
    "https://orbcast.xyz",
    "https://www.orbcast.xyz",
    "https://app.orbcast.xyz",
    # Vite web app (web/)
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    # Showcase local / static hosts
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

_extra_cors = os.getenv("CORS_ORIGINS", "").strip()
if _extra_cors:
    ALLOWED_ORIGINS.extend(
        origin.strip() for origin in _extra_cors.split(",") if origin.strip()
    )

# In development, also allow localhost
if os.getenv("ENVIRONMENT", "production") != "production":
    ALLOWED_ORIGINS.extend([
        "http://localhost:3000",
        "http://localhost:8081",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8081",
    ])

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
