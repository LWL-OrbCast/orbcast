# Sports overlay (match chrome)

Price, depth, tape, and settlement stay on **Hyperliquid HIP-4**. API-Sports is only *who is playing and what the score is*.

HIP-4 sports templates (`out` / `txyz`) publish `participantA` / `participantB`, `scheduledStart`, and `competition` — **not** an API-Sports `fixtureId`. Overlay rows join on those fields (names + kickoff, competition as a tie-break). Do not invent a football market from a BTC daily.

**Football (soccer) and NFL are different sports.** Catalog chip `football` is association football (API-Sports FOOTBALL). Chip `nfl` is American football (API-Sports NFL / `v1.american-football`). HIP-4 `sport:football/soccer` → Football; `sport:football` + NFL competition → NFL.

---

## Catalog chips vs API-Sports

HIP-4 titles land on chips in `frontend/src/lib/sportsCatalog.ts`. Overlay hosts live in `backend/sports_api.py` (same `API_SPORTS_KEY`, **separate daily quotas**). Do not call a host until that overlay exists — free plans are 100 req/day each.

| Chip | API-Sports product | Host | Overlay today |
|------|--------------------|------|----------------|
| Football | FOOTBALL | `v3.football.api-sports.io` | EPL + La Liga + Serie A + UEFA club (UCL / UEL / UECL) stadium chrome |
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

**Top Events** (All) is a HIP-4 mix: one lead per chip, then the most urgent of those (**in-play first**, then upcoming kickoff → ending soon → long-dated last). Among live football contests, the overlay pin follows the **highest-volume** HIP-4 book (not a random API-Sports row). Chip list order does not reserve a slot. The pager auto-advances (~6.5s fill on the active pill, bottom-right); dots stay clickable. Named chips stay in that category.

Football contest slides (`FeaturedMatchCard` / web `EplFeatured`) use stadium chrome — banner, crests, countdown / score. That is every **match** book (two clubs), not season winners. `GET /api/sports/football/epl` returns EPL + La Liga + Serie A + UEFA club fixtures (`matches`). Books match fixtures by `participantA`/`B` + `scheduledStart` (competition breaks ties). No `fixtureId` exists on-chain.

| State | UI |
|-------|----|
| Football contest, fixture on the board | Crests, score, minute / HT / FT |
| Football contest, upcoming | Same chrome with countdown |
| Football contest, no API row | Stadium + HIP-4 names / `startsAt`; crests from the static team-id map (`media.api-sports.io`, no quota). Marseille / Slovan / LASK / Viking use bundled `symbols/` art |
| Key missing (Expo Football chip, empty) | UEFA stub (Madrid / City art) |
| Key set, no fixture and no books | “No upcoming football match” |
| All chip | Mix slider; football **matches** still get stadium chrome |

Tap opens the HIP-4 book for that slide.

Arsenal vs Aston Villa uses `frontend/assets/images/symbols/featured-arsenal-villa.webp`. Other football rows use `featured-banner.webp`.

---

## Backend (football overlay)

| | |
|--|--|
| Registry | `backend/sports_api.py` |
| Module | `backend/sports_football.py` |
| Route | `GET /api/sports/football/epl` on `api_router` |
| Upstream | [API-Football v3](https://www.api-football.com/documentation-v3) · `https://v3.football.api-sports.io` · header `x-apisports-key` |
| Leagues | Premier League **39**, La Liga **140**, Serie A **135**, Champions League **2**, Europa League **3**, Conference League **848** |
| Key | `API_SPORTS_KEY` on the **server only** — never `EXPO_PUBLIC_*` |

### What one “request” is

One HTTP call to that sport’s host = one quota unit on **that** product, whether the body has 1 match or 380. Phone → `/api/sports/*` does **not** count. Team/league logos on `media.api-sports.io` do **not** count ([API-Football terms](https://www.api-football.com/terms)).

This app’s cache-miss spend (phones hit our backend only; logos on `media.api-sports.io` are free):

| Window | Upstream |
|--------|----------|
| Always | `GET /fixtures?live=39-140-135-2-3-848` (hyphenated ids — a lone `live=39` is rejected) |
| Upcoming | `GET /fixtures?league={39\|140\|135\|2\|3\|848}&season=…&next=10` (Pro, 6 calls, 240s TTL). If a league’s `next=` is empty, that league only: `date=today` |
| Finished | `GET /fixtures?league={39\|140\|135\|2\|3\|848}&season=…&last=10` (6 calls, 240s TTL). FT games drop off `live=` immediately — this is how the catalog knows to hide them |
| Live featured | `GET /fixtures/events?fixture=…` — **one call returns the whole timeline** (goals, cards, subs). We keep every event (cap 80). The stadium card still previews the last 2; **All events** opens the rest. Other board fixtures fetch the same endpoint on demand (cached 90s). |

Do **not** call `live=all` (whole-world live list). TTL is ~90s for the board / live / events, ~240s for upcoming and finished. The composed board is shared in Supabase `news_cache` (`sports:football:board`) so every replica reads the same payload.

Quiet day upper bound (one replica, cache working): ~1 live check / 90s ≈ 960/day, plus 6 upcoming + 6 finished refreshes every 240s ≈ 4.3k/day → **~5.3k**. Live featured: live + events every 90s ≈ **~6.2k**. Pro is 7,500/day / 300/min. Do not add more football leagues without checking that headroom.

**API-Sports `finished` is not HIP-4 `settled`.** `status.short` `FT` / `AET` / `PEN` / `AWD` / `WO` means the match is over. The Outcome / Hyperliquid book stays `open` until the venue calls `settleQuestion2` (event markets, validator vote — Outcome targets resolution within ~4 hours, and the contest template fixes the official result one hour after full-time). Home, Markets, search, featured, and trending hide football **contest** books only when the overlay marks that fixture **finished** (kickoff-aligned). A live book missing from `live=` / `next=` is **not** treated as FT — kickoff-past alone does not hide it. HIP-4 `live` and a held position do **not** keep a true FT book in All or Football — Positions is enough. A direct `/market/:id` stays reachable. We do not invent settlement.

**Pro (7,500/day)** unlocks `next=` / current season. Keep the overlay this tight — do not add more leagues without checking headroom. They stop you at the cap; they do not overbill. See [pricing](https://www.api-football.com/pricing) and [how ratelimit works](https://www.api-football.com/news/post/how-ratelimit-works).

### Multi-replica

The board JSON is process-cached **and** written to `news_cache` key `sports:football:board` (deny-all RLS; service_role only). A miss on one replica fills the row; the others read it until TTL (~90s). If Supabase is down, each process falls back to its own memory (same as before). `worker_leader` is still for deposit scan / alerts, not sports.

Do **not** add a dedicated sports table. Later overlays can reuse other `news_cache` keys (`sports:nfl:board`, …); this overlay only uses `sports:football:board`.

---

## Frontend

| File | Role |
|------|------|
| `frontend/src/lib/sportsCatalog.ts` | Chip ids, HIP-4 `sport` → chip, API-Sports hosts |
| `frontend/src/lib/sportsFootball.ts` | Types + `fetchEplBoard()` via existing `api` axios |
| `frontend/src/lib/footballChrome.ts` | Board `matches` + HIP-4 synthetic fixture (Vite-safe) |
| `frontend/src/lib/footballTeamLogos.ts` | Name → API-Sports team id or bundled `symbols/` crest (`local:…`) |
| `frontend/src/components/sports/FeaturedMatchCard.tsx` | Mobile stadium banner |
| `frontend/app/index.tsx` | Pull-to-refresh invalidates `['sports', 'football', 'epl']` |
| `web/src/ui/EplFeatured.tsx` | Desktop stadium banner for football contest slides |

English strings: `hip4.featured.*` and `hip4.sport.*` in `frontend/src/i18n/locales/en.json`.

---

## Fork checklist

1. Copy `backend/.env.example` → `.env`; set `API_SPORTS_KEY` (dashboard at [dashboard.api-football.com](https://dashboard.api-football.com/)).
2. Confirm `GET http://localhost:8000/api/sports/football/epl` returns `"configured": true` — do not paste the key into chat or Expo.
3. Keep sport filters in the **UI / overlay** (`sportsCatalog.ts`), not as hardcoded titles in `hip4.ts`.
4. Adding NBA / NFL / … chrome: new `sports_*.py` against `sports_api.host_for("nba")` (etc.), own `news_cache` key, own quota. Do not reuse the football host.
