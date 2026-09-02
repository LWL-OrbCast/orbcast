# HIP-4 Sports

Open-source reference for a **mobile-native Hyperliquid HIP-4 app** — outcome / prediction markets, Privy wallets, Bridge2 deposits, agent signing, builder fees, alerts, and rewards.

**Outcome markets only.** No perpetual futures, no HIP-3 books, no banking / cards, no AI trading worker.

> **Mobile-first.** Showcase UI is sports. The client (`frontend/src/lib/hip4.ts`) is venue-generic so other HIP-4 templates still work. This app **trades**; it does not deploy markets.

---

## What this is

A production-style **Expo / React Native** app with a **FastAPI** backend:

- **Hyperliquid HIP-4** — outcome tokens, `outcomeMeta` / templates, `userOutcome` (split / merge / negate)
- **Privy** — embedded self-custody wallets (email, Google, Apple)
- **Bridge2** — gasless USDC deposits (EIP-2612 permit + backend relayer on Arbitrum)
- **Supabase** — rewards, push tokens, deposit scanner, onboarding
- **Railway** — backend hosting (`railway.toml` + Dockerfile)

**Not included:** perpetual-futures UI, HIP-3, banking / cards, AI trading agents, legal advice, or store approval guarantees.

HIP-4 venues are live on mainnet (`venue: "out"` in `outcomeMeta`). Sports listings may still be empty — show an empty state; do not fake a book from BTC dailies. See [docs/HIP4.md](./docs/HIP4.md).

---

## Architecture

```
Mobile (Expo + Privy)  ─┐
                        ├──► Hyperliquid API / WS     outcome meta, orders, account stream
Web (Vite + Privy)     ─┤
                        └──► Your backend (FastAPI)
                                  ├──► Supabase
                                  ├──► Arbitrum RPC + Bridge2 relayer
                                  └──► API-Sports (optional)  EPL match chrome only — not odds
```

Orders and HIP-4 actions are signed on-device (agent key). The backend does **not** place outcome orders.

---

## Quick start

**~45 min** if you have Privy + Supabase + an Arbitrum RPC URL.

```bash
git clone https://github.com/LWL-OrbCast/orbcast.git && cd orbcast

# Backend
cp backend/.env.example backend/.env   # fill in secrets
cd backend && pip install -r requirements.txt
uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Frontend (separate terminal — requires Expo dev client)
cp frontend/.env.example frontend/.env
cd frontend && npm install && npx expo start --dev-client

# Optional: desktop web (Vite, port 5173)
cp web/.env.example web/.env   # same Privy App ID; no mobile client ID
cd web && npm install && npm run dev
```

Full checklist: **[docs/SETUP.md](./docs/SETUP.md)**

Database: apply the core tables on a **new** Supabase project — see **[docs/DATABASE.md](./docs/DATABASE.md)**.

---

## Documentation

| Doc | Contents |
|-----|----------|
| [SETUP.md](./docs/SETUP.md) | Step-by-step infra setup |
| [DATABASE.md](./docs/DATABASE.md) | Supabase tables for this app |
| [HIP4.md](./docs/HIP4.md) | Outcome markets, venues, Outcome.xyz vs trade.xyz |
| [SPORTS.md](./docs/SPORTS.md) | EPL featured banner (API-Sports chrome vs HIP-4 book) |
| [HL_BUILDER.md](./docs/HL_BUILDER.md) | Builder fees, Bridge2, scaling |
| [ENVIRONMENT.md](./docs/ENVIRONMENT.md) | Env vars |
| [FORKING.md](./docs/FORKING.md) | Rebrand, builder address, strip leftovers |
| [COSTS.md](./docs/COSTS.md) | Expected infra costs |
| [MOBILE_RELEASE.md](./docs/MOBILE_RELEASE.md) | Play / App Store, D-U-N-S |
| [ROADMAP.md](./docs/ROADMAP.md) | What’s shipped vs next (markets / orders / UI) |
| [AGENTS.md](./AGENTS.md) | Coding-agent map + MCPs |
| [SECURITY.md](./SECURITY.md) | Secrets and reporting |

New-chat bootstrap for agents: [`AGENT_PROMPT.md`](./AGENT_PROMPT.md).

---

## What’s in the repo

| Area | Status |
|------|--------|
| Privy login, Bridge2 wallet ↔ trade, relayer, push, rewards, onboarding | Working reference |
| Outcome client (`hip4.ts`) | Working trader client — sports HIP-4 rows may still be empty |
| Sports home / ticket / positions | Ticket + positions against live `outcomeMeta`; Home featured banner is EPL chrome ([SPORTS.md](./docs/SPORTS.md)) |
| Perps / HIP-3 / banking / AI | **Out of scope** (some leftover dumps still exist; do not grow them) |

This is a working trader UI. Sports *books* still depend on live `outcomeMeta` (empty is OK). The featured EPL card is match chrome, not a HIP-4 market.

---

## Project layout

```
hip4-app/
├── backend/
│   ├── server.py              # FastAPI (wallet, rewards, push, geo)
│   ├── sports_football.py     # EPL chrome proxy (optional API_SPORTS_KEY)
│   ├── rewards.py             # Points / referrals
│   ├── supabase_schema.sql    # Historical dump — prefer DATABASE.md
│   └── .env.example
├── frontend/
│   ├── app/                   # Expo Router (home, market, portfolio, wallet)
│   ├── src/lib/hip4.ts        # HIP-4 client
│   ├── src/lib/hlKernel.ts    # Agent / builder / withdraw (extract from dump)
│   └── .env.example
├── web/                   # Vite + React 19 desktop client (aliases hip4.ts)
├── docs/
├── AGENTS.md
└── AGENT_PROMPT.md
```

---

## Credits

TypeScript Hyperliquid client: [`@nktkas/hyperliquid`](https://github.com/nktkas/hyperliquid) by [nktkas](https://github.com/nktkas).

HIP-4: [HIP-4](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets) · [Outcome.xyz architecture](https://docs.outcome.xyz/outcome-architecture) (venue **OUT**).

---

## License

[MIT](./LICENSE) — see also [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Support the project

If this reference helps you ship, donations are welcome:

`0x29a1D36DaEE6B0E0Dd4873dd964677000B6e23EB`

---

## Disclaimer

Reference software only. Not financial, legal, or tax advice. Users hold keys via Privy; you operate your own backend and relayer at your risk. Prediction / outcome markets have a different regulatory surface than perpetual futures — do not hide a perps route in this binary.
