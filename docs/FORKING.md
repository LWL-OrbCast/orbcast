# Forking

Checklist if you want your own outcome-markets mobile app from this repo.

Also: [AGENTS.md](../AGENTS.md) · [SETUP.md](./SETUP.md) · [DATABASE.md](./DATABASE.md) · [HIP4.md](./HIP4.md) · [HL_BUILDER.md](./HL_BUILDER.md)

This product is **HIP-4 only**. Do not add perps, HIP-3 books, banking, or an AI worker unless you deliberately change the product.

---

## 1. Identity and secrets

1. Clone; copy `backend/.env.example` and `frontend/.env.example`.
2. New Privy app — `EXPO_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_CLIENT_ID` + backend `PRIVY_APP_ID` (and `PRIVY_APP_SECRET` if you look up email / wallets).
3. New Supabase project — apply [DATABASE.md](./DATABASE.md).
4. New Arbitrum RPC; **new** Bridge2 relayer EOA + ETH. Do not reuse another product’s relayer keys.
5. **Builder fees:** pin `EXPO_PUBLIC_HL_BUILDER_ADDRESS` (and fee tenths) in frontend `.env` **and** EAS, plus `VITE_HL_BUILDER_*` in `web/.env`. Match backend `BUILDER_ADDRESS`. Register your builder on Hyperliquid. [HL_BUILDER.md](./HL_BUILDER.md).
6. Branding:
   - **Copy / URLs** — `frontend/src/lib/brand.ts` (shared by Expo + Vite): `BRAND_NAME`, `BRAND_DOMAIN`, X, support email, `HL_AGENT_NAME` (`approveAgent`), `WALLET_TRANSFER_INTENT_NAME`. If you change the transfer-intent name, match `WALLET_TRANSFER_INTENT_DOMAIN_NAME` in `backend/server.py` or deposits fail EIP-712 verify.
   - **Native shell** — `frontend/app.json` (name, Android `com.orbcast.hip4sports`, iOS `com.example.hip4sports` until registered, scheme `hip4sports`). Put RPC / Privy / analytics in `.env`, not committed `extra`.
   - Logos live under `frontend/assets/images/` and `web/src/assets/`. This file does not swap those.
7. Firebase: copy `*.example` → real plist/json (gitignored).
8. Smoke test: [SETUP.md](./SETUP.md). Optional EPL banner: `API_SPORTS_KEY` on the backend only ([SPORTS.md](./SPORTS.md)).

---

## 2. What to keep vs strip

| Keep | Strip when you touch it |
|------|-------------------------|
| Privy, Bridge2, rewards, push, onboarding | (done) Perp `placeOrder` / HIP-3 JIT in `hyperliquid.ts` |
| `hip4.ts`, sports screens | (done) `hlMargin.ts`, `backend/hip3_dexes.py` |
| `hlKernel.ts` (grow this) | Dead compat shims after leftover imports die |
| `ConfirmModal` (wallet ↔ trade) | Unused PnL/fills helpers still in `hyperliquid.ts` |

Keep the client venue-generic. Filter sports in the UI; do not hard-code football-only into `hip4.ts`. Do not copy `API_SPORTS_KEY` into Expo.

---

## 3. Store / legal

Prediction markets ≠ leveraged futures. Use outcome-market copy. Do not ship a hidden perps tab. Geo-fence is present but loose — review before production ([MOBILE_RELEASE.md](./MOBILE_RELEASE.md)).
