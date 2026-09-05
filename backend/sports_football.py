"""API-Sports football v3 — match chrome only (not trading odds).

Premier League (league id 39). The key stays on the server; the app never sees it.
Odds / predictions endpoints are intentionally unused — price lives on HIP-4.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx
from dotenv import load_dotenv

from sports_api import host_for

logger = logging.getLogger(__name__)

API_BASE = host_for("football")
EPL_LEAGUE_ID = 39
LIVE_TTL_SEC = 90.0
NEXT_TTL_SEC = 180.0
EVENTS_TTL_SEC = 90.0
REQUEST_TIMEOUT = 12.0
EVENT_LIMIT = 4

# https://www.api-football.com/documentation-v3#tag/Fixtures
LIVE_SHORTS = frozenset({"1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT", "SUSP", "BREAK"})
FINISHED_SHORTS = frozenset({"FT", "AET", "PEN", "AWD", "WO"})
PL_LOGO = "https://media.api-sports.io/football/leagues/39.png"
_ENV_PATH = Path(__file__).parent / ".env"

# Process-local first; shared JSON in `news_cache` key `sports:epl:board`
# so N Railway replicas do not each spend API-Football on the same miss.
# Phone → /api/sports/* does not count; only v3.football.api-sports.io calls do.
_BOARD_CACHE_KEY = "sports:epl:board"
_BOARD_TTL_SEC = LIVE_TTL_SEC
_cache: Dict[str, tuple[float, Any]] = {}
_locks: Dict[str, asyncio.Lock] = {}
_store: Any = None


def configure_sports_store(client: Any) -> None:
    """Wire the Supabase service-role client so the EPL board is replica-safe."""
    global _store
    _store = client


def _ensure_env() -> None:
    load_dotenv(_ENV_PATH, override=False)


def _api_key() -> str:
    _ensure_env()
    return (os.environ.get("API_SPORTS_KEY") or "").strip()


def is_configured() -> bool:
    return bool(_api_key())


def epl_season(now: Optional[datetime] = None) -> int:
    """Season year is the August start year (Jul–Jun)."""
    dt = now or datetime.now(timezone.utc)
    return dt.year if dt.month >= 7 else dt.year - 1


def _empty_board(season: int, configured: bool) -> Dict[str, Any]:
    return {
        "configured": configured,
        "season": season,
        "league": {
            "id": EPL_LEAGUE_ID,
            "name": "Premier League",
            "logo": PL_LOGO,
        },
        "featured": None,
        "upcoming": [],
    }


def _lock_for(key: str) -> asyncio.Lock:
    lock = _locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _locks[key] = lock
    return lock


def _cache_get(key: str) -> Any:
    hit = _cache.get(key)
    if not hit:
        return None
    exp, val = hit
    if time.monotonic() > exp:
        return None
    return val


def _cache_set(key: str, val: Any, ttl: float) -> None:
    _cache[key] = (time.monotonic() + ttl, val)


def _cache_stale(key: str) -> Any:
    hit = _cache.get(key)
    return hit[1] if hit else None


async def _cached(key: str, ttl: float, fetcher: Callable[[], Awaitable[Any]]) -> Any:
    hit = _cache_get(key)
    if hit is not None:
        return hit
    async with _lock_for(key):
        hit = _cache_get(key)
        if hit is not None:
            return hit
        val = await fetcher()
        _cache_set(key, val, ttl)
        return val


def _error_keys(data: Any) -> List[str]:
    err = data.get("errors") if isinstance(data, dict) else None
    if isinstance(err, dict) and err:
        return list(err.keys())
    if isinstance(err, list) and err:
        return ["list"]
    return []


async def _get(path: str, params: Dict[str, Any]) -> List[Any]:
    headers = {"x-apisports-key": _api_key()}
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        r = await client.get(f"{API_BASE}{path}", params=params, headers=headers)
    if r.status_code >= 400:
        logger.warning("api-sports %s status=%s", path, r.status_code)
        r.raise_for_status()
    data = r.json() if r.content else {}
    keys = _error_keys(data)
    if keys:
        logger.warning("api-sports %s errors=%s", path, keys)
    resp = data.get("response")
    return resp if isinstance(resp, list) else []


def _team(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {"id": None, "name": "", "logo": ""}
    return {
        "id": raw.get("id"),
        "name": (raw.get("name") or "").strip(),
        "logo": raw.get("logo") or "",
    }


def _kickoff_ms(fx: Dict[str, Any]) -> Optional[int]:
    ts = fx.get("timestamp")
    if isinstance(ts, (int, float)) and ts > 0:
        return int(ts) * 1000
    raw = fx.get("date")
    if not raw:
        return None
    try:
        return int(datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp() * 1000)
    except ValueError:
        return None


def _normalize_fixture(item: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(item, dict):
        return None
    fx = item.get("fixture") if isinstance(item.get("fixture"), dict) else {}
    lg = item.get("league") if isinstance(item.get("league"), dict) else {}
    teams = item.get("teams") if isinstance(item.get("teams"), dict) else {}
    goals = item.get("goals") if isinstance(item.get("goals"), dict) else {}
    status = fx.get("status") if isinstance(fx.get("status"), dict) else {}
    venue = fx.get("venue") if isinstance(fx.get("venue"), dict) else {}
    short = str(status.get("short") or "NS").upper()
    fid = fx.get("id")
    if fid is None:
        return None
    return {
        "fixtureId": fid,
        "kickoffAt": _kickoff_ms(fx),
        "status": short,
        "statusLong": status.get("long") or "",
        "elapsed": status.get("elapsed"),
        "live": short in LIVE_SHORTS,
        "finished": short in FINISHED_SHORTS,
        "home": _team(teams.get("home")),
        "away": _team(teams.get("away")),
        "goals": {"home": goals.get("home"), "away": goals.get("away")},
        "league": {
            "id": lg.get("id") or EPL_LEAGUE_ID,
            "name": lg.get("name") or "Premier League",
            "logo": lg.get("logo") or PL_LOGO,
            "round": lg.get("round") or "",
        },
        "venue": (venue.get("name") or "").strip(),
    }


def _is_epl(row: Dict[str, Any]) -> bool:
    lg = row.get("league") if isinstance(row.get("league"), dict) else {}
    return lg.get("id") == EPL_LEAGUE_ID


def _normalize_event(ev: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(ev, dict):
        return None
    t = ev.get("time") if isinstance(ev.get("time"), dict) else {}
    team = ev.get("team") if isinstance(ev.get("team"), dict) else {}
    player = ev.get("player") if isinstance(ev.get("player"), dict) else {}
    return {
        "elapsed": t.get("elapsed"),
        "extra": t.get("extra"),
        "type": ev.get("type") or "",
        "detail": ev.get("detail") or "",
        "team": (team.get("name") or "").strip(),
        "player": (player.get("name") or "").strip(),
    }


async def _fetch_live() -> List[Dict[str, Any]]:
    # live= must be hyphenated ids (39-39). Do not fall back to live=all —
    # that spends a quota unit on every league worldwide.
    raw = await _get("/fixtures", {"live": f"{EPL_LEAGUE_ID}-{EPL_LEAGUE_ID}"})
    rows = [n for n in (_normalize_fixture(x) for x in raw) if n and _is_epl(n)]
    rows.sort(key=lambda r: (r.get("elapsed") is None, -(r.get("elapsed") or 0)))
    return rows


async def _fetch_upcoming_epl() -> List[Dict[str, Any]]:
    """Pro: league + season + next=. Date-only worldwide dump is a last resort."""
    season = epl_season()
    raw = await _get(
        "/fixtures",
        {"league": EPL_LEAGUE_ID, "season": season, "next": 8},
    )
    rows = [n for n in (_normalize_fixture(x) for x in raw) if n and _is_epl(n)]
    if not rows:
        today = datetime.now(timezone.utc).date().isoformat()
        raw = await _get(
            "/fixtures",
            {"league": EPL_LEAGUE_ID, "season": season, "date": today},
        )
        rows = [n for n in (_normalize_fixture(x) for x in raw) if n and _is_epl(n)]
    rows.sort(key=lambda r: r.get("kickoffAt") or 0)
    return rows


async def _fetch_events(fixture_id: int) -> List[Dict[str, Any]]:
    raw = await _get("/fixtures/events", {"fixture": fixture_id})
    out: List[Dict[str, Any]] = []
    for item in raw:
        n = _normalize_event(item)
        if n:
            out.append(n)
    return out[-EVENT_LIMIT:]


async def _live_fixtures() -> List[Dict[str, Any]]:
    return await _cached("epl:live", LIVE_TTL_SEC, _fetch_live)


async def _events(fixture_id: int) -> List[Dict[str, Any]]:
    return await _cached(
        f"epl:events:{fixture_id}",
        EVENTS_TTL_SEC,
        lambda: _fetch_events(fixture_id),
    )


def _shared_board_get() -> Optional[Dict[str, Any]]:
    if _store is None:
        return None
    try:
        res = (
            _store.table("news_cache")
            .select("items,updated_at")
            .eq("key", _BOARD_CACHE_KEY)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        logger.warning("sports overlay cache read failed: %s", type(exc).__name__)
        return None
    row = res.data if res else None
    if not row or not isinstance(row.get("items"), dict):
        return None
    raw_at = row.get("updated_at")
    if not raw_at:
        return None
    try:
        ts = datetime.fromisoformat(str(raw_at).replace("Z", "+00:00"))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age = (datetime.now(timezone.utc) - ts).total_seconds()
    except ValueError:
        return None
    if age > _BOARD_TTL_SEC:
        return None
    return row["items"]


def _shared_board_set(board: Dict[str, Any]) -> None:
    if _store is None:
        return
    try:
        _store.table("news_cache").upsert(
            {
                "key": _BOARD_CACHE_KEY,
                "items": board,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:
        logger.warning("sports overlay cache write failed: %s", type(exc).__name__)


async def _build_epl_board(season: int) -> Dict[str, Any]:
    live: List[Dict[str, Any]] = []
    upcoming: List[Dict[str, Any]] = []
    try:
        live = await _live_fixtures()
        if not live:
            upcoming = await _cached("epl:upcoming", NEXT_TTL_SEC, _fetch_upcoming_epl)
            upcoming = [r for r in upcoming if not r.get("finished")]
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        logger.warning("api-sports epl board failed: %s", type(exc).__name__)
        live = _cache_stale("epl:live") or []
        upcoming = _cache_stale("epl:upcoming") or []

    featured = live[0] if live else (upcoming[0] if upcoming else None)
    events: List[Dict[str, Any]] = []
    if featured and featured.get("live") and featured.get("fixtureId") is not None:
        try:
            events = await _events(int(featured["fixtureId"]))
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning("api-sports epl events failed: %s", type(exc).__name__)
            events = []
    if featured:
        featured = {**featured, "events": events}

    return {
        **_empty_board(season, True),
        "featured": featured,
        "upcoming": upcoming[:8],
    }


async def get_epl_board() -> Dict[str, Any]:
    season = epl_season()
    if not is_configured():
        return _empty_board(season, False)

    hit = _cache_get("epl:board")
    if isinstance(hit, dict):
        return hit

    async with _lock_for("epl:board"):
        hit = _cache_get("epl:board")
        if isinstance(hit, dict):
            return hit
        shared = await asyncio.to_thread(_shared_board_get)
        if isinstance(shared, dict) and shared.get("configured"):
            _cache_set("epl:board", shared, _BOARD_TTL_SEC)
            return shared
        stale = _cache_stale("epl:board")
        try:
            board = await _build_epl_board(season)
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            logger.warning("api-sports epl board rebuild failed: %s", type(exc).__name__)
            if isinstance(stale, dict):
                return stale
            return _empty_board(season, True)
        _cache_set("epl:board", board, _BOARD_TTL_SEC)
        await asyncio.to_thread(_shared_board_set, board)
        return board
