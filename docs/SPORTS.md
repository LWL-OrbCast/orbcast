# Sports overlay (match chrome)

Price, depth, tape, and settlement stay on **Hyperliquid HIP-4**. API-Sports is only *who is playing and what the score is*.

There is **no** `outcomeId` ↔ `fixtureId` join yet. Home lists live HIP-4 books as-is. Do not invent a football market from a BTC daily.

**Football (soccer) and NFL are different sports.** Catalog chip `football` is association football (API-Sports FOOTBALL). Chip `nfl` is American football (API-Sports NFL / `v1.american-football`). HIP-4 `sport:football/soccer` → Football; `sport:football` + NFL competition → NFL.

---

## Catalog chips vs API-Sports

HIP-4 titles land on chips in `frontend/src/lib/sportsCatalog.ts`. Overlay hosts live in `backend/sports_api.py` (same `API_SPORTS_KEY`, **separate daily quotas**). Do not call a host until that overlay exists — free plans are 100 req/day each.

| Chip | API-Sports product | Host | Overlay today |
|------|--------------------|------|----------------|
| Football | FOOTBALL | `v3.football.api-sports.io` | EPL banner only |
| NFL | NFL | `v1.american-football.api-sports.io` | none |
| NBA | NBA | `v2.nba.api-sports.io` | none |
| Basketball | BASKETBALL | `v1.basketball.api-sports.io` | none |
| Baseball | BASEBALL | `v1.baseball.api-sports.io` | none |
| Hockey | HOCKEY | `v1.hockey.api-sports.io` | none |
| MMA | MMA | `v1.mma.api-sports.io` | none |
| Rugby | RUGBY | `v1.rugby.api-sports.io` | none |
| Volleyball | VOLLEYBALL | `v1.volleyball.api-sports.io` | none |
| AFL | AFL | `v1.afl.api-sports.io` | none |
| F1 | FORMULA-1 | `v1.formula-1.api-sports.io` | none |
| Handball | HANDBALL | `v1.handball.api-sports.io` | none |
| Tennis / Esports | — | — | HIP-4 chips only |

Odds, predictions, and in-play prices from API-Sports are **not** called. HIP-4 is the book.

---

## What the home banner shows

**Top Events** (All) is a HIP-4 mix: one lead per chip, then the five most urgent of those (ending soon → upcoming kickoff → live → long-dated last). Chip list order does not reserve a slot — a near Fed book beats a season NFL book. The pager auto-advances (~6.5s fill on the active pill, bottom-right); dots stay clickable. Named chips stay in that category.

EPL chrome (`FeaturedMatchCard` / web `EplFeatured`) is the **Football** chip hero only — All no longer replaces the mix with the fixture banner. `GET /api/sports/football/epl`:

| State | UI |
|-------|----|
| Football chip, live / kickoff today | Crests, score, minute / HT / FT |
| Football chip, upcoming today | Same chrome with countdown |
| Football chip, key missing | UEFA stub (Madrid / City art) |
| Football chip, key set, no fixture | “No upcoming Premier League match” |
| All chip | HIP-4 featured slider (not EPL chrome) |

Tap still opens the first live HIP-4 book. That is intentional until a mapper exists.

Arsenal vs Aston Villa uses `frontend/assets/images/symbols/featured-arsenal-villa.webp`. Other EPL rows use `featured-banner.webp`.

---

## Backend (EPL overlay)

| | |
|--|--|
| Registry | `backend/sports_api.py` |
| Module | `backend/sports_football.py` |
| Route | `GET /api/sports/football/epl` on `api_router` |
| Upstream | [API-Football v3](https://www.api-football.com/documentation-v3) · `https://v3.football.api-sports.io` · header `x-apisports-key` |
| League | Premier League id **39** |
| Key | `API_SPORTS_KEY` on the **server only** — never `EXPO_PUBLIC_*` |

### What one “request” is

One HTTP call to that sport’s host = one quota unit on **that** product, whether the body has 1 match or 380. Phone → `/api/sports/*` does **not** count. Team/league logos on `media.api-sports.io` do **not** count ([API-Football terms](https://www.api-football.com/terms)).

This app’s cache-miss spend (phones hit our backend only; logos on `media.api-sports.io` are free):

| Window | Upstream |
|--------|----------|
| Always | `GET /fixtures?live=39-39` (hyphenated ids — a lone `live=39` is rejected) |
| No live EPL | `GET /fixtures?league=39&season=…&next=8` (Pro). If that is empty, `league=39&season=…&date=today` |
| Live featured | `GET /fixtures/events?fixture=…` for that game only |

Do **not** call `live=all` (whole-world live list). TTL is ~90s for the board / live / events, ~180s for upcoming. The composed board is shared in Supabase `news_cache` (`sports:epl:board`) so every replica reads the same payload. A miss is 1–2 upstream calls, not one per phone.

Quiet day upper bound (one replica, cache working): ~1 live check / 90s ≈ 960/day, plus an upcoming refresh every 180s ≈ 480/day → **~1.5k**. Live match: live + events every 90s ≈ **~1.9k**. Pro is 7,500/day / 300/min.

**Pro (7,500/day)** unlocks `next=` / current season. Keep the overlay this tight even so — headroom is for later leagues, not a wider poll. They stop you at the cap; they do not overbill. See [pricing](https://www.api-football.com/pricing) and [how ratelimit works](https://www.api-football.com/news/post/how-ratelimit-works).

### Multi-replica

The board JSON is process-cached **and** written to `news_cache` key `sports:epl:board` (deny-all RLS; service_role only). A miss on one replica fills the row; the others read it until TTL (~90s). If Supabase is down, each process falls back to its own memory (same as before). `worker_leader` is still for deposit scan / alerts, not sports.

Do **not** add a dedicated sports table. Later overlays can reuse other `news_cache` keys (`sports:nfl:board`, …); this overlay only uses `sports:epl:board`.

---

## Frontend

| File | Role |
|------|------|
| `frontend/src/lib/sportsCatalog.ts` | Chip ids, HIP-4 `sport` → chip, API-Sports hosts |
| `frontend/src/lib/sportsFootball.ts` | Types + `fetchEplBoard()` via existing `api` axios |
| `frontend/src/components/sports/FeaturedMatchCard.tsx` | Mobile EPL banner |
| `frontend/app/index.tsx` | Pull-to-refresh invalidates `['sports', 'football', 'epl']` |
| `web/src/ui/EplFeatured.tsx` | Desktop EPL banner (Football chip when the fixture is today) |

English strings: `hip4.featured.*` and `hip4.sport.*` in `frontend/src/i18n/locales/en.json`.

---

## Fork checklist

1. Copy `backend/.env.example` → `.env`; set `API_SPORTS_KEY` (dashboard at [dashboard.api-football.com](https://dashboard.api-football.com/)).
2. Confirm `GET http://localhost:8000/api/sports/football/epl` returns `"configured": true` — do not paste the key into chat or Expo.
3. Keep sport filters in the **UI / overlay** (`sportsCatalog.ts`), not as hardcoded titles in `hip4.ts`.
4. Adding NBA / NFL / … chrome: new `sports_*.py` against `sports_api.host_for("nba")` (etc.), own `news_cache` key, own quota. Do not reuse the football host.
