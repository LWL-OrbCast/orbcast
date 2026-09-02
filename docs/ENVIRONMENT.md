# Environment variables

Copy the templates (placeholders only — never commit real `.env` files):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp web/.env.example web/.env
```

`.env.example` files may still list unused names. You only need the variables below. Full setup: [SETUP.md](./SETUP.md).

| File | Deploy |
|------|--------|
| `backend/.env.example` | FastAPI (Railway or local uvicorn) |
| `frontend/.env.example` | Expo / EAS (`EXPO_PUBLIC_*`) |
| `web/.env.example` | Vite (`VITE_*`) — same Privy App ID, no mobile client ID |

---

## Backend

### Required

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend DB access (**never** ship to mobile) |
| `PRIVY_APP_ID` | Verify Privy JWTs |
| `PRIVY_APP_SECRET` | Server Privy API (email / wallet lookup) |
| `ARBITRUM_RPC_URL` | Bridge2 relayer + deposit scan |
| `BRIDGE2_RELAYER_PRIVATE_KEY` | Hot wallet for permit deposits (ETH-funded; comma-separated OK via `BRIDGE2_RELAYER_PRIVATE_KEYS`) |

### Builder (optional for demos; required for your own fees)

| Variable | Purpose |
|----------|---------|
| `BUILDER_ADDRESS` / `BUILDER_FEE` | Override defaults in `server.py`. Keep in sync with `EXPO_PUBLIC_HL_BUILDER_*`. Fee is **tenths of a basis point** (`30` = 3 bps). |

### Bridge2 defaults (usually fine)

| Variable | Purpose |
|----------|---------|
| `HL_BRIDGE2_ADDRESS` | HL Bridge2 spender (has a default) |
| `ARBITRUM_USDC_ADDRESS` | Native USDC on Arbitrum |
| `ARBITRUM_RPC_URL_FALLBACKS` | Comma-separated backup RPCs |

### Demo / testnet

| Variable | Purpose |
|----------|---------|
| `HL_TESTNET_MASTER_PK` | Signs testnet USDC grants |
| `HL_TESTNET_MASTER_ADDRESS` | Optional; derived from PK if omitted |
| `DEMO_GRANT_AMOUNT_USDC` / `DEMO_TRANSFER_FEE_USDC` | Defaults `100` / `1` |

### Optional

| Variable | Purpose |
|----------|---------|
| `FOREXRATE_KEY` | Display-currency rates → `forex_rates_cache` |
| `API_SPORTS_KEY` | API-Football v3 key for Home EPL chrome. Server only. Details: [SPORTS.md](./SPORTS.md). |
| `APPLE_REVIEW_BYPASS` | `true` relaxes geo-fence for App Review |
| `ENVIRONMENT` | Non-`production` enables some dev-only behavior |
| `CORS_ORIGINS` | Extra browser origins (comma-separated). Local Vite (`http://localhost:5173`) and production (`https://orbcast.xyz`, `www`, `app`) are already in `server.py`. |

---

## Frontend (Expo)

Injected at build time (`EXPO_PUBLIC_*`). Prefer `.env` / EAS secrets over committed `app.json` `extra`.

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_BACKEND_URL` | FastAPI base URL |
| `EXPO_PUBLIC_PRIVY_APP_ID` / `EXPO_PUBLIC_PRIVY_CLIENT_ID` | PrivyProvider (**required**) |
| `EXPO_PUBLIC_ARBITRUM_RPC_URL` | Client Arbitrum reads |
| `EXPO_PUBLIC_HL_BUILDER_ADDRESS` | Builder on orders. Unset → repo default. Forks that earn fees must set this (match backend). |
| `EXPO_PUBLIC_HL_BUILDER_FEE_TENTHS_BPS` | Client fee ceiling (tenths bps). API may lower via rewards discount. |
| `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID`, `EXPO_PUBLIC_SIWE_*` | External wallet connect |
| `EXPO_PUBLIC_APPSFLYER_DEV_KEY`, `EXPO_PUBLIC_WHITEPAPER_URL` | Optional |

**Firebase:** gitignored `GoogleService-Info.plist` / `google-services.json` — copy from `*.example`.

Do **not** copy `EXPO_PUBLIC_*` onto the backend host.

---

## Web (Vite)

`web/.env` — never commit. Same backend + Privy **App ID** as Expo.

| Variable | Purpose |
|----------|---------|
| `VITE_BACKEND_URL` | FastAPI base (e.g. `http://localhost:8000`). Also baked into the production CSP `connect-src` at `vite build` — rebuild when this changes. |
| `VITE_PRIVY_APP_ID` | Same App ID as `EXPO_PUBLIC_PRIVY_APP_ID` |
| `VITE_PRIVY_CLIENT_ID` | Optional. Privy **Web** client ID (Clients tab). Not the Expo/mobile client. |
| `VITE_HL_NETWORK` | `mainnet` or `testnet` |
| `VITE_HL_BUILDER_ADDRESS` | Builder on orders. Unset → repo default. Never take address from `/builder-config`. |
| `VITE_HL_BUILDER_FEE_TENTHS_BPS` | Client fee ceiling (tenths bps). API may lower via rewards. |
| `VITE_ARBITRUM_RPC_URL` | Client Arbitrum USDC reads. Origin is allowlisted in the production CSP — rebuild after changing. |

Add `http://localhost:5173` and production origins (`https://orbcast.xyz`, `https://www.orbcast.xyz`, `https://app.orbcast.xyz`) under Privy **Allowed origins**. Enable **HttpOnly cookies** in the dashboard for those hosts (not an app-code flag). Wallet SIWE uses domain `orbcast.xyz` unless `EXPO_PUBLIC_SIWE_DOMAIN` / `EXPO_PUBLIC_SIWE_URI` override it.

Privy **Allowed OAuth redirect URLs** (Advanced) must be exact `/login` paths — `http://localhost:5173/login` and `https://orbcast.xyz/login` (plus www/app if you use them). Wildcards and per-route URLs (`/market/…`) are rejected. Google Cloud only needs `https://auth.privy.io/api/v1/oauth/callback`. Full steps: [SETUP.md](./SETUP.md) §3.

---

## Security

- Never commit `.env`, relayer keys, or the Supabase service_role key
- Never embed `SUPABASE_SERVICE_ROLE_KEY` or `PRIVY_APP_SECRET` in the mobile app
- Fund the relayer with **minimal** ETH; rotate if leaked
- Separate Privy apps for dev vs production

See [SECURITY.md](../SECURITY.md).
