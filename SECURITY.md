# Security

This app handles user authentication, a hot Bridge2 relayer, and database access.
Treat the repo as **sensitive infrastructure**, not a toy demo.

Regulatory surface is **prediction / outcome markets**, not perpetual futures.

---

## Never commit

- `.env`, `.env.local`, or any file containing secrets (keep `*.env.example`)
- `BRIDGE2_RELAYER_PRIVATE_KEY` or `HL_TESTNET_MASTER_PK`
- Supabase **service_role** key
- Privy app secrets (server-side `PRIVY_APP_SECRET`)
- Alchemy / RPC URLs that embed API keys (use env, not `app.json`)
- `API_SPORTS_KEY` (API-Football; server only — never Expo)
- Firebase `GoogleService-Info.plist` / `google-services.json` (gitignored; use `*.example`)
- Production AppsFlyer / analytics keys

`.gitignore` excludes `*.env` / `*.env.*` but **allows** `*.env.example`. Double-check before pushing.

---

## Key handling

| Secret | Where it lives | Exposure |
|--------|----------------|----------|
| User EOA | Privy embedded wallet | User device |
| HL agent key (mobile) | Expo SecureStore (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`) | User device — trades only; withdraw is master-signed |
| HL agent key (web) | IndexedDB, AES-GCM + per-wallet (`web/src/lib/agentStore.ts`) | User browser — wiped on logout; CSP is the XSS defence |
| Relayer EOA | Backend env only | Server |
| Supabase service_role | Backend env only | Server |
| Privy App ID | `EXPO_PUBLIC_PRIVY_APP_ID` + `VITE_PRIVY_APP_ID` + backend `PRIVY_APP_ID` | Public-ish; still use **your** Privy app |
| API-Football key | Backend `API_SPORTS_KEY` only | Server — see [SPORTS.md](./docs/SPORTS.md) |
| Privy Client ID | `EXPO_PUBLIC_PRIVY_CLIENT_ID` / `VITE_PRIVY_CLIENT_ID` | Public-ish; still use **your** Privy app |
| Builder address/fee | `EXPO_PUBLIC_HL_BUILDER_*` / `VITE_HL_BUILDER_*` + matching `BUILDER_*` | Client pins address on orders — see [HL_BUILDER.md](./docs/HL_BUILDER.md) |

**Relayer wallet:** dedicated EOA with minimal Arbitrum ETH. **Do not reuse another product’s relayer keys** — nonce wars and shared blast radius. Rotate immediately if leaked.

**Testnet master PK:** testnet funds only. Never reuse mainnet keys.

**Embedded wallets:** create EVM only. Do not call Solana `create()` unless the product needs it.

---

## Reporting vulnerabilities

If you discover a security issue in this repository, please **do not** open a public GitHub issue with exploit details.

Contact the maintainers privately with:

- Description and impact
- Steps to reproduce
- Suggested fix (optional)

---

## Forking safely

1. Create **new** Privy, Supabase, and Railway projects — do not reuse another product’s production credentials.
2. Register your **own** HL builder code.
3. Apply the core schema on a **fresh** Supabase project ([DATABASE.md](./docs/DATABASE.md)).
4. Review [ENVIRONMENT.md](./docs/ENVIRONMENT.md) before copying old env dumps.

---

## Disclaimer

This software is provided as-is. You are responsible for securing your deployment, complying with applicable law (including prediction-market rules in your jurisdictions), and protecting user funds.
