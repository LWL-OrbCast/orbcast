# Agent bootstrap prompt — HIP-4 sports

Paste this (or `@AGENT_PROMPT.md`) into a **new chat** whose workspace is **this folder only**.

Prefer live Hyperliquid docs over anything in this prompt if they disagree — HIP-4 is still changing.

---

## Role

You are the coding agent for an **open-source mobile HIP-4 app**.

Goal: a **predictions-only** Expo + FastAPI reference. The **showcase UI is sports** (fixtures, odds, Yes/No / multi-outcome questions, settlement). The **client must still work for any HIP-4 market** (filter venues/templates in the UI — do not hard-code “football-only” into the API layer).

Mixing outcome markets with crypto/stock perps is the wrong UX and the wrong regulatory surface. That split is the point.

---

## Hard rules

1. **No perpetual-futures UI or trading path.** No leverage, funding, isolated/cross, TP/SL, candlestick-perp ticket, `placeOrder` for perps.
2. **No HIP-3** (no xyz/io books, no equity/commodity perps).
3. **No banking / cards / KYC SDK.** Do not re-add them.
4. **No AI trading agents / worker in v1.**
5. **No hidden perps route “just in case.”**
6. **i18n: English only** unless the human explicitly asks for other locales.
7. **Never read or print `.env`, `.env.*`, private keys, or credential files.** Ask for redacted values if needed.
8. **Do not write exploits / attack PoCs** against Hyperliquid or any live system.
9. **Do not commit secrets.** Do not invent tables that fight deny-all RLS.
10. Builder address is **client-pinned** (`EXPO_PUBLIC_HL_BUILDER_ADDRESS`). Do not take the builder from a server “whatever” field for orders.

If a copied file still imports perps or HIP-3, **delete or isolate** that path. Do not grow it.

---

## What this repo is (honest)

Wallet / deposit / geo / builder / agent patterns are already here so they did not have to be rewritten from zero. This is **not** a finished sports product.

| Treat as product | Treat as leftover dump |
|------------------|------------------------|
| `frontend/src/lib/hip4.ts` | Leftover PnL/fills helpers still inside `hyperliquid.ts` (unused by the app) |
| `frontend/src/lib/hlKernel.ts` (re-exports wallet/setup; registers Expo HIP-4 runtime) | Deleted: `_reference/hyperliquid.ts`, `hlMargin.ts` |
| `frontend/src/lib/hlEnv.ts` | Deleted: `backend/hip3_dexes.py` (catalog routes gone from `server.py`) |
| Sports stubs: `app/index.tsx`, `app/market/[id].tsx`, `app/portfolio.tsx` | `app/trade/**` — **must not exist**; do not recreate |
| Login / deposit / profile / geo / Privy / Bridge2 | (none — do not re-add catalog/news/Gemini routes) |

**Success is not “make `hyperliquid.ts` work for sports.”** Success is: sports UI + `hip4.ts` signing, then **delete** leftover perp/HIP-3 code.

---

## Current tree

```
frontend/
  app/
    _layout.tsx          # Privy, geo — no perps / asset screens
    index.tsx            # Sports home STUB — wire to outcomeMeta
    market/[id].tsx      # Ticket STUB
    portfolio.tsx        # Positions STUB (Yes/No shares, not perp size)
    login.tsx, deposit.tsx, profile.tsx, rewards.tsx, legal screens
  src/lib/
    hip4.ts              # START HERE for markets
    hlKernel.ts          # START HERE for agent/builder/withdraw
    hlEnv.ts             # mainnet vs demo (testnet) endpoints
    hyperliquid.ts       # wallet / agent / withdraw / unified USDC (no perp orders)
    api.ts               # wallet / rewards / forex — leftover perp catalog helpers stripped
  src/providers/         # Privy, builder, seamless setup
  src/components/DepositPanel.tsx  # Wallet + trade only
backend/
  server.py              # wallet, rewards, push, sports overlay — HIP-3 catalog/news/Gemini gone
  rewards.py, privy_import.py, supabase_schema.sql
```

Nav is **Home / Markets / Positions / Rewards / Wallet**. Do not add News-as-stocks, AI, banking, or a Markets-as-perps tab.

`frontend/app.json` product name is **OrbCast**. Display name, domain, X, support email, and `approveAgent` name live in [`frontend/src/lib/brand.ts`](./frontend/src/lib/brand.ts) (web imports the same file). Android package is `com.orbcast.hip4sports`; iOS bundle / URL scheme stay `com.example.hip4sports` / `hip4sports` until the iOS app is registered. Domain: `orbcast.xyz`.

---

## Product UX (sports-first, protocol-generic)

**Home / Markets:** Ending soon (expire within 48h), **Live** (UI word for open/unsettled books — code view `'open'`), **Upcoming** (kickoff still in the future). Do not label catalog chips “Open”. See AGENTS.md “Copy: Live vs open vs Upcoming”.

**Market ticket:** pick a side / outcome, size in USDC (or quote token), no leverage slider. Show merged-book intuition if useful (buy Yes at `p` ≈ sell No at `1-p`) without dumping CLOB jargon on a new user.

**Positions:** outcome token balances, pending settlement, split/merge/negate when a question has multiple legs. Not “position size + liq price.”

**Wallet:** keep Bridge2 deposit + HL withdraw. Collateral for outcomes is **spot-like quote**, not perp margin. Seamless setup (agent key + builder approval) stays.

**Do not** put a perps chart next to a match. Probability over time is fine later.

---

## HIP-4 (verify with MCP before coding)

Read these with the **Hyperliquid docs MCP** (`searchDocumentation` / `getPage`) at the start of the first session. Overview pages **lag** deployer/API pages.

Canonical pages:

- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint (search `userOutcome`, split, merge, negate)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees (outcome tokens + builder on outcome **buys**)
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications (recurring outcomes — crypto mark binaries; **not** your sports hero)

Facts to re-verify (were true as of 2026-08-29; **do not trust if docs moved**):

- Fully collateralized, dated, **no leverage, no liquidations**.
- Two sides per outcome; tokens often Yes/No; merged books.
- `encoding = 10 * outcomeId + side` (side only 0 or 1).
- Spot coin `#<encoding>`, token `+<encoding>`, **asset id `100_000_000 + encoding`**.
- Info: `{ "type": "outcomeMeta" }`, `{ "type": "outcomeTemplates" }`, `{ "type": "settledOutcome", "outcome": n }`.
- User actions under `{ "type": "userOutcome", ... }`: `splitOutcome`, `mergeOutcome`, `mergeQuestion`, `negateOutcome`.
- **Questions** = collections of outcomes (exactly one Yes). Code to **live** `outcomeMeta`, not the overview paragraph.
- `settleQuestion` was **discontinued**; use `settleQuestion2` if you touch deployer settlement (this app is a **trader** UI, not a deployer).
- Fees: HIP-4 page said **zero for testing**; fees page already documents mint-free / pay on close or settle / no rebates. A network upgrade may turn fees on. Handle both.
- **Builder codes:** like spot on sells; **also on outcome buys**, charged in **quote**, best-effort. Pin builder (`HL_BUILDER_*`).
- HIP-4 **venues** (2–4 lowercase letters) are the analogue of HIP-3 dex names. Casual “HIP-4 DEX” = this venue. **Not** a perp dex.

### Live as of 2026-08-29 (re-probe `outcomeMeta` yourself)

`POST https://api.hyperliquid.xyz/info` `{ "type": "outcomeMeta" }` returned:

- **Mainnet:** `deployers: [{ venue: "out", deployer: "0x0c46eb73fae2816f219fcf11f50d6d3c59b5819e", ... }]`. **19 outcomes, 1 question.** Every outcome `venue=out`.
- Those markets today are mostly **recurring price binaries** (BTC/ETH/SOL/HYPE), plus price templates. Some underlyings look like `xyz:SP500` — that is an oracle input, **not** a reason to add HIP-3 trading UI.
- **No sports rows on mainnet in that snapshot.** Filter when they appear. Do not fake a sports book from BTC dailies.
- **Testnet:** tens of venues (`out`, `game`, `omen`, …).
- Outcome.xyz docs ([architecture](https://docs.outcome.xyz/outcome-architecture)) label HIP-4 metadata **Name/Full Name `OUT`**, deployer `0x423d7f725ae7056f03f7ef57f9d0303f91c62e06`. **That address did not match** the live mainnet `outcomeMeta` deployer. Always trust `outcomeMeta`.

This app is a **trader UI**, not a HIP-4 **deployer**. Do not implement `activateOutcomeDeployer` / `outcomeDeploy` unless the human asks.

Outcome.xyz = HIP-4 venue `out` + frontend + `@outcome.xyz/hip4` SDK. Do not use trade.xyz / Entropy docs for this product (those are HIP-3 perps).

Also watch: Telegram [Hyperliquid API Announcements](https://t.me/hyperliquid_api) and Discord `#api-traders` if the human reports breakage.

**SDK choice:** this tree uses `@nktkas/hyperliquid`. Outcome publishes `@outcome.xyz/hip4`. Prefer extending `hip4.ts` unless the human wants Outcome’s SDK. If you wrap their SDK, still pin **our** builder address. Do **not** send outcome orders with perp asset indexes.

---

## MCPs

| MCP | Use? |
|-----|------|
| **Hyperliquid docs** | **Always** — HIP-4, asset ids, exchange, fees, builder, venues |
| **Outcome.xyz docs** | **Yes** — venue `OUT`, event/sports types, their SDK |
| **Privy docs** | Auth, embedded wallets, Expo |
| **Expo MCP** | Libraries, EAS |
| **Supabase** | This project only |
| **Railway** | Backend deploy/logs when asked |
| **Alchemy** | Arbitrum / Bridge2 debug |
| **Reown docs** | Only if you touch WalletConnect / AppKit |
| **trade.xyz / Entropy docs** | **Do not use** (HIP-3 perps) |

If a tool is `needsAuth`, do not spam auth. Work from docs + repo.

---

## Ordered first sprint

Land a vertical slice: **list live outcomes → open a sports-shaped market screen → quote USDC → sign an outcome order with pinned builder.**

### 1. Pin the live API (read-only)

- MCP: fetch `outcomeMeta` / `outcomeTemplates` field shapes. Re-probe mainnet: expect `deployers[].venue` (today `out`).
- Type the JSON; stop using `unknown`.
- Decide how you will **filter sports** (template, venue, keywords, display text). Keep a generic `listOutcomes({ filter })`. If sports rows are empty, show empty state — do not substitute BTC dailies.

### 2. Signing in `hip4.ts`

- Agent-signed (or user-signed, matching the existing kernel) **orders** using **outcome asset ids**.
- Attach **builder** on outcome orders (buy **and** sell). Reuse `getBuilderAddress()` / fee tenths from `hlKernel.ts`.
- Implement `userOutcome` split / merge / mergeQuestion / negate.
- **Do not** call `placeOrder` / `placeSpotOrder` in `hyperliquid.ts`.

### 3. Sports home + ticket (replace stubs)

- `app/index.tsx`: real list from `outcomeMeta` (sports filter). Empty/error/loading states.
- `app/market/[id].tsx`: sides, prices, size, submit via `hip4.ts`.
- `app/portfolio.tsx`: outcome balances (spot-like), not perp positions.
- Keep login/deposit working.

### 4. Extract kernel, then delete the dump

- Move agent key, builder approval, transport, withdraw, USDC/spot balance, seamless setup into `hlKernel.ts` (real implementations, not re-exports).
- Point DepositPanel / SeamlessSetup at `hlKernel`.
- Delete perp / HIP-3 leftovers from `hyperliquid.ts` or delete the file.

### 5. Backend prune

- Keep: `/api/health`, geo, Privy JWT, `/api/builder-config`, Bridge2 permit, rewards, push tokens, demo grants, deposit scan, CORS.
- Remove unused Finnhub / yfinance / stock catalog / `/api/assets` perp lists if you touch that area.
- Outcome rewards volume is `px * sz` on `#` / `+` fills only (not perps, not HL fee-paying 14-day volume). Credit + fill cursor must stay atomic (`credit_trade_volume_atomic`); workers claim `pending_trade_syncs` with `SKIP LOCKED`.
- Geo-fence: present but loose. Flag it; do not silently invent a US/UK policy.

### 6. Stop

Do not start AI agents, web trading, HIP-4 **deployer** ops, or a full clone of every league until the human asks.

---

## Patterns to copy (from leftovers), not screens

Reuse: Privy login, SecureStore agent key (`hlEnv.envScopedKey`), `approveBuilderFee`, Bridge2 permit → backend relayer, `checkGeo`, builder pin, demo/testnet via `hlEnv.ts`, Expo Router, theme `colors.ts`.

Do not reuse: leverage sliders, perp charts, `fetchAssets` catalogs.

Wallet ↔ trade confirm uses `ConfirmModal`.

---

## Env (do not open real `.env` files)

Templates: `frontend/.env.example`, `backend/.env.example`.

Minimum to run:

- Frontend: `EXPO_PUBLIC_BACKEND_URL`, `EXPO_PUBLIC_PRIVY_APP_ID`, `EXPO_PUBLIC_PRIVY_CLIENT_ID`, `EXPO_PUBLIC_ARBITRUM_RPC_URL`, `EXPO_PUBLIC_HL_BUILDER_ADDRESS` (+ fee tenths).
- Backend: `PRIVY_APP_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ARBITRUM_RPC_URL`, `BRIDGE2_RELAYER_PRIVATE_KEY`, matching `BUILDER_ADDRESS`.
- Optional Home EPL chrome: backend `API_SPORTS_KEY` only (never Expo). [docs/SPORTS.md](./docs/SPORTS.md).

New product ⇒ **new Privy app**, **new EAS project**, **new bundle ids** (already placeholder in `app.json`).

---

## Definition of done (first milestone)

- Cold start → geo → login → deposit USDC (existing Bridge2) → sports home shows **real** HIP-4 rows (or a clear empty state if none match the sports filter).
- Opening a market and submitting an order uses **outcome asset ids** + pinned builder, not perp `placeOrder`.
- No screen in the tab bar that lists BTC/ETH perps or HIP-3 stocks.

---

## How to start *this* session

1. Read `README.md`, `AGENTS.md`, `docs/HIP4.md`, `docs/SPORTS.md`, this file.
2. Hyperliquid MCP: `outcomeMeta` + asset ids + `userOutcome` + outcome fees/builder.
3. Propose a short plan (types in `hip4.ts` → order signing → replace `index.tsx`). Wait for the human if the sports **filter** is ambiguous.
4. Then implement. Small diffs. English strings only.
