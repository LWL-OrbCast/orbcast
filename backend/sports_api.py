"""API-Sports product registry.

One dashboard key (`API_SPORTS_KEY`) covers every subscribed sport; each product
has its own host and daily quota. Overlay modules (see `sports_football.py`)
must call only their host. Odds / predictions endpoints stay unused — HIP-4
is the book.

Tennis and esports are catalog chips only (no API-Sports product on this account).
"""

from __future__ import annotations

from typing import Dict, Optional, TypedDict


class SportsProduct(TypedDict):
    chip: str
    dashboard: str
    host: str
    docs: str


# Keep in sync with frontend/src/lib/sportsCatalog.ts `API_SPORTS_PRODUCTS`.
PRODUCTS: Dict[str, SportsProduct] = {
    "football": {
        "chip": "football",
        "dashboard": "FOOTBALL",
        "host": "https://v3.football.api-sports.io",
        "docs": "https://api-sports.io/documentation/football/v3",
    },
    "nfl": {
        "chip": "nfl",
        "dashboard": "NFL",
        "host": "https://v1.american-football.api-sports.io",
        "docs": "https://api-sports.io/documentation/nfl/v1",
    },
    "nba": {
        "chip": "nba",
        "dashboard": "NBA",
        "host": "https://v2.nba.api-sports.io",
        "docs": "https://api-sports.io/documentation/nba/v2",
    },
    "basketball": {
        "chip": "basketball",
        "dashboard": "BASKETBALL",
        "host": "https://v1.basketball.api-sports.io",
        "docs": "https://api-sports.io/documentation/basketball/v1",
    },
    "mlb": {
        "chip": "mlb",
        "dashboard": "BASEBALL",
        "host": "https://v1.baseball.api-sports.io",
        "docs": "https://api-sports.io/documentation/baseball/v1",
    },
    "hockey": {
        "chip": "hockey",
        "dashboard": "HOCKEY",
        "host": "https://v1.hockey.api-sports.io",
        "docs": "https://api-sports.io/documentation/hockey/v1",
    },
    "mma": {
        "chip": "mma",
        "dashboard": "MMA",
        "host": "https://v1.mma.api-sports.io",
        "docs": "https://api-sports.io/documentation/mma/v1",
    },
    "rugby": {
        "chip": "rugby",
        "dashboard": "RUGBY",
        "host": "https://v1.rugby.api-sports.io",
        "docs": "https://api-sports.io/documentation/rugby/v1",
    },
    "volleyball": {
        "chip": "volleyball",
        "dashboard": "VOLLEYBALL",
        "host": "https://v1.volleyball.api-sports.io",
        "docs": "https://api-sports.io/documentation/volleyball/v1",
    },
    "afl": {
        "chip": "afl",
        "dashboard": "AFL",
        "host": "https://v1.afl.api-sports.io",
        "docs": "https://api-sports.io/documentation/afl/v1",
    },
    "f1": {
        "chip": "f1",
        "dashboard": "FORMULA-1",
        "host": "https://v1.formula-1.api-sports.io",
        "docs": "https://api-sports.io/documentation/formula-1/v1",
    },
    "handball": {
        "chip": "handball",
        "dashboard": "HANDBALL",
        "host": "https://v1.handball.api-sports.io",
        "docs": "https://api-sports.io/documentation/handball/v1",
    },
}


def product(chip: str) -> Optional[SportsProduct]:
    return PRODUCTS.get(chip)


def host_for(chip: str) -> str:
    row = PRODUCTS.get(chip)
    if not row:
        raise KeyError(f"Unknown API-Sports product chip: {chip}")
    return row["host"]
