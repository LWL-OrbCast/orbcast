# AGENTS.md — guide for coding agents (and humans)

This repo is a **mobile-first HIP-4 outcome-markets** reference (Expo + FastAPI). Read this before large edits.

**Outcome markets only.** No perpetual futures, no HIP-3, no banking, no AI worker in v1.

This file is for *you* (Cursor / Claude / etc.). Not in-app AI trading agents.

---

## Product

| | |
|--|--|
| Showcase UI | Sports (fixtures, Yes/No / multi-outcome, settlement) |
| Client | `frontend/src/lib/hip4.ts` — any HIP-4 venue/template |
| Wallet | Privy embedded EOA, Bridge2 deposits, HL agent key, client-pinned builder |
| Scope | This app **trades**. It does not deploy (`activateOutcomeDeployer` / `outcomeDeploy`) |

Do not add a hidden perps route.

### Copy: Live vs open vs Upcoming

UI says **Live**. Code / HIP-4 status say **open**. That is a display choice, not two products.

| User sees | Code |
|-----------|------|
| **Live** (catalog chip) | `MarketCatalogView` `'open'` — every unsettled book (`status !== 'settled'`) |
| **Upcoming** | `status === 'upcoming'` — sports (or any market) whose kickoff/`startsAt` is still in the future |
| **Ending soon** | unsettled books that expire within 48 hours (or already past expiry), sorted by `expiresAt` ascending |
| Row/ticket **Live** | `ListedMarket.status === 'live'` — book is in play (started, or no start time) |

Do not rename the catalog view to `'live'`. That string already means in-play on `ListedMarket.status`. Do not show **Open** on catalog chips.

---

## Read these first

| Doc | When |
|-----|------|
| [README.md](./README.md) | Orientation |
| [AGENT_PROMPT.md](./AGENT_PROMPT.md) | First-sprint order + HIP-4 facts to re-verify |
| [docs/HIP4.md](./docs/HIP4.md) | Venues, Outcome.xyz vs trade.xyz |
| [docs/SPORTS.md](./docs/SPORTS.md) | EPL overlay: API-Sports chrome, quota, key stays on server |
| [docs/SETUP.md](./docs/SETUP.md) | Local / deploy bootstrap |
| [docs/DATABASE.md](./docs/DATABASE.md) | Which tables this app uses |
| [docs/HL_BUILDER.md](./docs/HL_BUILDER.md) | Builder fee, Bridge2 |
| [docs/ENVIRONMENT.md](./docs/ENVIRONMENT.md) | Env vars |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | What’s next (markets / orders / UI) |
| [SECURITY.md](./SECURITY.md) | Secrets hygiene |

---

## Where to edit

| Task | Path |
|------|------|
| Outcome API | `frontend/src/lib/hip4.ts` |
| Agent / builder / withdraw | `frontend/src/lib/hlKernel.ts` (then stop using raw `hyperliquid.ts`) |
| Sports home / ticket / positions | `frontend/app/index.tsx`, `market/[id].tsx`, `portfolio.tsx` |
| Vite desktop web | `web/` (DOM UI). Share `hip4.ts` via aliases. Do **not** import Expo screens, `hyperliquid.ts`, or `@privy-io/expo`. |
| EPL match chrome | `backend/sports_football.py`, `frontend/src/lib/sportsFootball.ts`, `FeaturedMatchCard.tsx` |
| Catalog sport chips / API-Sports hosts | `frontend/src/lib/sportsCatalog.ts`, `backend/sports_api.py` |
| Catalog row images | `frontend/src/lib/marketSymbol.ts` + files in `frontend/assets/images/symbols/` (`lol-icon.webp` → LoL). Category chips stay vector glyphs. Do not fetch API-Sports art for catalog thumbs. |
| Backend (wallet, rewards, push) | `backend/server.py` |
| Product name / domain / X / support / HL agent name | `frontend/src/lib/brand.ts` (Expo + web). Keep `WALLET_TRANSFER_INTENT_NAME` in sync with `backend/server.py`. |

`frontend/src/lib/hyperliquid.ts` is wallet/setup/balances only. Do not add perp or HIP-3 order paths there. HIP-4 orders go through `hip4.ts`.

---

## Repo map

```
frontend/                 Expo Router app
  app/                    Sports stubs, login, profile, rewards, legal
  src/lib/hip4.ts         HIP-4 client — start here for markets
  src/lib/hlEndpoints.ts  Pure HL URLs (Vite-safe)
  src/lib/hip4Runtime.ts  registerHip4Runtime — Expo kernel vs web IndexedDB
  src/lib/sportsFootball.ts  EPL board client (backend proxy)
  src/lib/sportsCatalog.ts   Catalog chips + API-Sports hosts
  src/lib/hlKernel.ts     Agent / builder / withdraw (extract next)
  src/lib/hyperliquid.ts  Wallet / agent / withdraw / unified USDC (no perp orders)
  src/providers/          Privy, builder config, currency
  src/components/         DepositPanel, ConfirmModal, sports/*
web/                      Vite + React 19 desktop app (port 5173)
backend/
  server.py               FastAPI — wallet, rewards, push, geo, sports overlay
  sports_football.py      API-Sports EPL chrome (not odds)
  rewards.py              Points / referrals
docs/                     Human + agent documentation
```

Nav is **Home / Markets / Positions / Rewards / Wallet**. Do not add banking, AI, or a perps tab. Markets is the HIP-4 outcome catalog (not HIP-3). Catalog chip **Live** is still view `'open'` (see Copy above).

The Vite app in `web/` is the product desktop UI. Leave Expo `WebLayout` / `MockAuthProvider` alone. Web registers `registerWebHip4Runtime()` at boot; the agent key is AES-GCM encrypted in IndexedDB, scoped per master wallet, and wiped on logout (`web/src/lib/agentStore.ts`).

### `server.py`

Large single module. Jump by route prefix (`/api/health`, `/api/sports/football/epl`, `/api/builder-config`, Bridge2, rewards, push). Do not re-add unused stock-data loops.

---

## Hard rules

1. **Secrets** — never commit `.env`, service_role keys, relayer PKs, Privy secrets, RPC keys in `app.json`. See `SECURITY.md`. Never read or print those files.
2. **No exploit / attack tooling** against Hyperliquid or any live system.
3. **No perps / HIP-3 / banking / AI worker** unless the human explicitly re-opens that product.
4. **Builder identity** — pin `EXPO_PUBLIC_HL_BUILDER_ADDRESS` on orders. Do not take builder from a server “whatever” field.
5. **Privy** — `EXPO_PUBLIC_PRIVY_*` + backend `PRIVY_APP_ID` via env. Web uses `VITE_PRIVY_APP_ID` (same App ID) + dashboard allowed origins (`https://orbcast.xyz` and www/app). SIWE domain defaults to `orbcast.xyz`.
6. **i18n** — English-only string changes unless asked.
7. **DB** — follow [DATABASE.md](./docs/DATABASE.md). Do not invent tables that fight deny-all RLS.
8. **Relayer** — new EOAs for this app. Do not reuse another product’s relayer keys (nonce wars).
9. **Trust live `outcomeMeta`** — do not hardcode docs deployer addresses. `settleQuestion` was replaced by `settleQuestion2`.
10. **Sports chrome ≠ the book** — API-Sports is fixtures/score only. Soccer and NFL are different products (`sportsCatalog.ts` / `sports_api.py`). Do not show their odds next to HIP-4 mids. Key is `API_SPORTS_KEY` on the server; never Expo. See [SPORTS.md](./docs/SPORTS.md).

---

## Docs to follow (Hyperliquid / Outcome)

- [HIP-4](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets)
- [Asset IDs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids)
- [Deployer actions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions)
- [Outcome.xyz architecture](https://docs.outcome.xyz/outcome-architecture) — venue **OUT**, not trade.xyz

Watch API announcements. Re-probe `outcomeMeta`; sports rows may still be empty.

---

## Recommended MCP servers

Configure in Cursor MCP settings. **Do not commit API keys.**

| MCP | Use? |
|-----|------|
| **Hyperliquid docs** | Always — HIP-4, asset ids, exchange, fees, builder |
| **Outcome.xyz docs** | Yes — venue OUT, event/sports types, their SDK |
| **Privy docs** | Auth, embedded wallets, Expo |
| **Expo MCP** | Libraries, EAS |
| **Supabase** | This project only |
| **Railway** | Backend deploy/logs when asked |
| **Alchemy** | Arbitrum / Bridge2 debug |
| **Reown docs** | Only if you touch WalletConnect / AppKit |
| trade.xyz / Entropy | **Do not use** (HIP-3 perps) |

---

## Safe default tasks

- HIP-4 types + signing in `hip4.ts`
- Sports list / ticket / positions against live `outcomeMeta`
- EPL overlay only via the backend proxy ([SPORTS.md](./docs/SPORTS.md)) — no API-Sports odds
- Extract kernel into `hlKernel.ts`, then delete perp/HIP-3 dump
- Wallet / deposit / push / onboarding fixes
- Vite `web/` catalog / ticket / positions (do not restyle Expo)
- Docs that match what the code actually does

## Avoid unless explicitly requested

- Re-adding perps, HIP-3, banking, or AI workers
- HIP-4 **deployer** ops
- Desktop/web-first trading rewrite
- Broad `server.py` splits mid-feature
