# Sports overlay (match chrome)

Price, depth, tape, and settlement stay on **Hyperliquid HIP-4**. API-Sports is only *who is playing and what is happening on the pitch*.

There is **no** `outcomeId` ↔ `fixtureId` join yet. Mainnet `outcomeMeta` may still have no sports rows — Home shows those books as-is (or empty). Do not invent a football market from a BTC daily.

---

## What the home banner shows

With `API_SPORTS_KEY` set, `FeaturedMatchCard` loads `GET /api/sports/football/epl`:

| State | UI |
|-------|----|
| Live EPL | Crests, score, minute / HT / FT, last few events |
| Nothing live | Next EPL on today’s (or tomorrow’s) date feed, if the plan allows it |
| Key missing | UEFA stub (Madrid / City art) so Home is not blank |
| Key set, no fixture | “No upcoming Premier League match” |

Tap still opens the first live HIP-4 book. That is intentional until a mapper exists.

Arsenal vs Aston Villa uses `frontend/assets/images/symbols/featured-arsenal-villa.webp`. Other EPL rows use `featured-banner.webp`.

---

## Backend

| | |
|--|--|
| Module | `backend/sports_football.py` |
| Route | `GET /api/sports/football/epl` on `api_router` |
| Upstream | [API-Football v3](https://www.api-football.com/documentation-v3) · `https://v3.football.api-sports.io` · header `x-apisports-key` |
| League | Premier League id **39** |
| Key | `API_SPORTS_KEY` on the **server only** — never `EXPO_PUBLIC_*` |

Odds, predictions, and in-play prices from API-Sports are **not** called. HIP-4 is the book.

### What one “request” is

One HTTP call to `v3.football.api-sports.io` = one quota unit, whether the body has 1 match or 380. Phone → `/api/sports/football/epl` does **not** count. Team/league logos on `media.api-sports.io` do **not** count ([API-Football terms](https://www.api-football.com/terms)).

This app’s cache-miss spend while Home is open on a live match:

1. `GET /fixtures?live=39-39` (hyphenated ids — a lone `live=39` is rejected)
2. `GET /fixtures/events?fixture=…` for the featured live game only

TTL is ~90s in process memory. Many phones sharing one replica still cost those two calls per window.

**Free plan (100/day, ~10/min):** current season and `next=` are locked; `live=all` / `live=39-39` still work. Fine for proving the banner. **Pro (7,500/day, 300/min)** is plenty for this overlay plus later standings / lineups / a few leagues — see [pricing](https://www.api-football.com/pricing) and [how ratelimit works](https://www.api-football.com/news/post/how-ratelimit-works). They stop you at the cap; they do not overbill.

### Multi-replica

The cache in `sports_football.py` is **process-local**. Each Railway replica (and each uvicorn worker) can miss independently and spend quota. `worker_leader` is for deposit scan / alerts, not sports. Before scaling past one backend: share the JSON (Supabase row, same idea as `forex_rates_cache`) or let only the leader refresh. There is a `TODO(multi-replica)` on that cache.

Do **not** add a sports table that fights deny-all RLS just for this. `news_cache` is reserved for a later feed, not this overlay.

---

## Frontend

| File | Role |
|------|------|
| `frontend/src/lib/sportsFootball.ts` | Types + `fetchEplBoard()` via existing `api` axios |
| `frontend/src/components/sports/FeaturedMatchCard.tsx` | Home banner |
| `frontend/app/index.tsx` | Pull-to-refresh invalidates `['sports', 'football', 'epl']` |

English strings: `hip4.featured.*` in `frontend/src/i18n/locales/en.json`.

---

## Fork checklist

1. Copy `backend/.env.example` → `.env`; set `API_SPORTS_KEY` (dashboard at [dashboard.api-football.com](https://dashboard.api-football.com/)).
2. Confirm `GET http://localhost:8000/api/sports/football/epl` returns `"configured": true` — do not paste the key into chat or Expo.
3. Keep football-only filters in the **UI / overlay**, not in `hip4.ts`.
4. Other sports (NBA, etc.) are separate API-Sports products with their own keys/quotas if you add them later.
