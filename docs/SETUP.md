# Setup guide

Run **HIP-4 Sports** locally or deploy your own copy.
About **45–90 minutes** if you already have Privy, Supabase, and a host for the API.

Also: [DATABASE.md](./DATABASE.md) · [HIP4.md](./HIP4.md) · [ENVIRONMENT.md](./ENVIRONMENT.md)

---

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- [Expo dev client](https://docs.expo.dev/develop/development-builds/introduction/) (Expo Go is not enough for Privy + native modules)
- Accounts: [Privy](https://privy.io), [Supabase](https://supabase.com), [Railway](https://railway.app) (or any Docker host)
- Arbitrum RPC URL (Alchemy, Infura, QuickNode, etc.)
- A Hyperliquid **builder code** if you want fees on orders (see [HL_BUILDER.md](./HL_BUILDER.md))

---

## 1. Clone and install

```bash
git clone https://github.com/LWL-OrbCast/orbcast.git
cd orbcast

# Backend
cd backend
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

---

## 2. Supabase

1. Create a **new** Supabase project.
2. Create the tables listed in [DATABASE.md](./DATABASE.md) (SQL editor or your migration history).
3. Copy **Project URL** and **service_role** key (Settings → API).

The mobile app does not need the Supabase anon key for core flows. The backend uses `service_role` for rewards, push tokens, deposit scan, and onboarding.

---

## 3. Privy

| Variable | Where | Required? |
|----------|--------|-----------|
| `PRIVY_APP_ID` | Backend | **Yes** — JWT verify |
| `PRIVY_APP_SECRET` | Backend only | Yes if you look up email / wallet ownership; never ship to mobile |
| `EXPO_PUBLIC_PRIVY_APP_ID` | Expo / EAS | **Yes** — same App ID as backend |
| `EXPO_PUBLIC_PRIVY_CLIENT_ID` | Expo / EAS | **Yes** — mobile **Client** ID (not the App Secret) |

Backend does **not** use `PRIVY_CLIENT_ID`. The app passes it to `<PrivyProvider clientId={…}>` in `frontend/app/_layout.tsx`. Find the client under **App settings → Basics → Clients**.

Create a Privy app, then:

1. **Allowed origins** — add `http://localhost:5173` for the Vite app, production hosts (`https://orbcast.xyz`, `https://www.orbcast.xyz`, `https://app.orbcast.xyz`), and your API host if needed. SIWE defaults to domain `orbcast.xyz` — allowlist that host in Privy **Settings → Domains**. See [Privy allowed domains](https://docs.privy.io/recipes/dashboard/allowed-domains). Same **App ID** as Expo. Optional: add a second dashboard client named **Web**, then set `VITE_PRIVY_CLIENT_ID` in `web/.env`. Never put the Expo/mobile client ID in the Vite env.

   **HttpOnly cookies (web)** — enable in the Privy dashboard (not in app code). `web/src/lib/auth.tsx` has no cookie adapter; without the dashboard toggle, sessions stay in JS-readable storage. Allowlist the same apex + `www` hosts. See [Privy cookies](https://docs.privy.io/recipes/react/cookies).

2. **Mobile client** — React Native [requires a client](https://docs.privy.io/basics/get-started/dashboard/app-clients). Set:
   - **Allowed app identifiers** to `expo.android.package` and `expo.ios.bundleIdentifier` in `frontend/app.json` (placeholders: `com.example.hip4sports`). An empty list denies mobile requests.
   - **Allowed URL schemes** to the Expo `scheme` (`hip4sports` unless you rebrand).

3. **Embedded wallets** — enable automatic **EVM** wallet creation in the dashboard. In code, `PrivyProvider` uses `createOnLogin: 'users-without-wallets'` ([Privy RN docs](https://docs.privy.io/basics/react-native/advanced/automatic-wallet-creation)). Do **not** create Solana wallets in app code.

4. Enable email / Google (and Apple if you want it on Expo).

   **Google Cloud** — one **Web application** client (not iOS/Android). Paste Client ID + secret into Privy → Login methods → Google. Google fields:

   | Field | Value |
   |-------|--------|
   | Authorized JavaScript origins | `https://auth.privy.io` |
   | Authorized redirect URIs | `https://auth.privy.io/api/v1/oauth/callback` |

   Do **not** put `localhost` or `orbcast.xyz` in Google. The phone app and Vite both use this same web client.

   **Privy OAuth return (Vite)** — **Configuration → App settings → Advanced → Allowed OAuth redirect URLs**. Exact match only: no `*`, no `/positions`, no `/market/:id`. The web app always returns to `/login` (`customOAuthRedirectUrl` in `web/src/lib/auth.tsx`), then sends the user back to the page they started from.

   Add one URL per host you actually use:

   - `http://localhost:5173/login`
   - `https://orbcast.xyz/login`
   - `https://www.orbcast.xyz/login` and `https://app.orbcast.xyz/login` if those origins are allowlisted

   Each host must already be in **Allowed origins** (step 1). See [Privy allowed OAuth redirects](https://docs.privy.io/recipes/react/allowed-oauth-redirects).

   Web Google is `initOAuth` (headless). That path does **not** auto-create an embedded wallet; `web/src/lib/auth.tsx` calls `createWallet()` after login. Leave dashboard **user-owned recovery / password-on-create** off so that does not hang on “Creating your wallet.” Do not set `VITE_PRIVY_CLIENT_ID` to the Expo/mobile client.

5. Copy App ID → `PRIVY_APP_ID` + `EXPO_PUBLIC_PRIVY_APP_ID` + `VITE_PRIVY_APP_ID`.  
   Copy **mobile** Client ID → `EXPO_PUBLIC_PRIVY_CLIENT_ID` only (`frontend/.env` / EAS).  
   Copy **web** Client ID (if you created one) → `VITE_PRIVY_CLIENT_ID` in `web/.env`.  
   Copy App Secret → `PRIVY_APP_SECRET` on the server only.

---

## 4. Backend environment

```bash
cp backend/.env.example backend/.env
```

Minimum:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
PRIVY_APP_ID=your-privy-app-id
ARBITRUM_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/KEY
BRIDGE2_RELAYER_PRIVATE_KEY=0x...   # dedicated EOA — fund with ETH on Arbitrum
```

```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Health: `GET http://localhost:8000/api/health`

Railway: connect the repo, root `backend/`, `backend/Dockerfile`, same env vars in the dashboard.

---

## 5. Relayer wallet (Bridge2 deposits)

1. Generate a **dedicated** EOA (not your builder wallet).
2. Set `BRIDGE2_RELAYER_PRIVATE_KEY`.
3. Send **ETH on Arbitrum** for gas.
4. Users sign USDC EIP-2612 permits; the backend submits `permit` + `deposit`.

Without a funded relayer, deposits fail at submission.

---

## 6. Builder configuration

Orders attach a builder address from the **client** (`EXPO_PUBLIC_HL_BUILDER_ADDRESS`). The API can discount the fee; it cannot send fees to a different address.

The repo has a default address/fee in `server.py` and the frontend. Forks that want **their** fees should:

1. Register a builder on Hyperliquid
2. Set `EXPO_PUBLIC_HL_BUILDER_ADDRESS` / `EXPO_PUBLIC_HL_BUILDER_FEE_TENTHS_BPS` in `frontend/.env` **and** EAS
3. Set matching `BUILDER_ADDRESS` / `BUILDER_FEE` on the backend

Details: [HL_BUILDER.md](./HL_BUILDER.md)

---

## 7. Frontend environment

```bash
cp frontend/.env.example frontend/.env
```

```env
EXPO_PUBLIC_BACKEND_URL=http://YOUR_LAN_IP:8000
EXPO_PUBLIC_ARBITRUM_RPC_URL=https://arb-mainnet...
EXPO_PUBLIC_PRIVY_APP_ID=your-privy-app-id
EXPO_PUBLIC_PRIVY_CLIENT_ID=your-privy-client-id

# Your builder (also set in EAS for release builds):
# EXPO_PUBLIC_HL_BUILDER_ADDRESS=0xYourBuilderAddress
# EXPO_PUBLIC_HL_BUILDER_FEE_TENTHS_BPS=30
```

Put secrets in `.env` / EAS, not committed `app.json`.

Firebase push: copy `*.example` → `GoogleService-Info.plist` / `google-services.json`, then replace with files from your Firebase project (gitignored).

```bash
cd frontend
npx expo start --dev-client
```

---

## 8. Optional — demo / testnet

```env
HL_TESTNET_MASTER_PK=0x...          # testnet-only
DEMO_GRANT_AMOUNT_USDC=100
```

The app switches HL endpoints in `frontend/src/lib/hlEnv.ts` when demo mode is on.

---

## 9. Optional — display FX

| Feature | Key |
|---------|-----|
| Display-currency rates | `FOREXRATE_KEY` (populates `forex_rates_cache`) |

Core wallet / deposit still works without it.

---

## 10. Optional — EPL featured banner

Set `API_SPORTS_KEY` on the **backend** (API-Football v3). Never put it in Expo.

`GET /api/sports/football/epl` should return `"configured": true`. Home then shows live Premier League chrome (score, minute, crests). Without the key, Home keeps the UEFA stub.

This is **not** a HIP-4 book. Full notes: [SPORTS.md](./SPORTS.md).

---

## 11. Optional — push notifications

1. Create a Firebase project.
2. Add iOS + Android apps; download `GoogleService-Info.plist` and `google-services.json` into `frontend/` (gitignored).
3. Configure Expo notifications + EAS credentials.

Client Firebase files and Expo **Google Service Account Keys** are different:

| Artifact | Role |
|----------|------|
| `google-services.json` / `GoogleService-Info.plist` | Native Firebase SDK in the app |
| Expo Google Service Account Keys | EAS / FCM / Play automation |

You typically need **both**. Do not commit the real client files.

EAS cloud builds only upload git-tracked files, so the gitignored plist/json will not be on the builder. Upload them as **file** env vars (not string — the value is a path on the runner, not the file text). `frontend/app.config.js` reads them:

| EAS file var | Local file |
|--------------|------------|
| `GOOGLE_SERVICES_PLIST` | `frontend/GoogleService-Info.plist` |
| `GOOGLE_SERVICES_JSON` | `frontend/google-services.json` |

Visibility **secret**. Attach `development` / `preview` / `production` as needed. CLI if the dashboard file picker rejects a `.plist`:

```bash
cd frontend
npx eas-cli env:create --name GOOGLE_SERVICES_PLIST --type file --value ./GoogleService-Info.plist --visibility secret --environment development --environment preview --environment production
npx eas-cli env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment development --environment preview --environment production
```

`eas-build-pre-install` copies those env paths (or the committed `*.example` stubs) into the filenames above. Local `eas build --local` can use the gitignored files on disk instead. Expo **Credentials → FCM V1 service account key** is a different JSON — do not put it in `GOOGLE_SERVICES_JSON`.

Match Expo **Application identifier** / iOS bundle id to `frontend/app.json`.

---

## 12. Vite web app (`web/`)

Desktop client (React 19 + Vite). Expo screens stay as-is. Catalog/orders still come from `frontend/src/lib/hip4.ts`.

```bash
cp web/.env.example web/.env
# VITE_BACKEND_URL=http://localhost:8000
# VITE_PRIVY_APP_ID=<same App ID as Expo>
# VITE_PRIVY_CLIENT_ID=<optional Web client from Privy Clients tab — not the Expo one>
# VITE_HL_BUILDER_ADDRESS=<pin; never take address from /builder-config>
cd web && npm install && npm run dev
```

Open **http://localhost:5173**. CORS already allows that origin; for production set `CORS_ORIGINS=https://your-web-host` on the API.

The HIP-4 agent private key lives in **IndexedDB**, AES-GCM encrypted and scoped to the logged-in master wallet (`web/src/lib/agentStore.ts`). Logout wipes it — the next login may need one extra Enable trading confirm. This is still weaker than Expo SecureStore; XSS is the residual risk. Production builds inject a strict CSP from `VITE_BACKEND_URL` / `VITE_ARBITRUM_RPC_URL` (`vite.config.ts`) — rebuild with prod env. `frame-ancestors 'none'` and HSTS ship in `web/public/_headers` (Cloudflare Pages / Netlify). On **Vercel**, `web/vercel.json` rewrites every path to `index.html` (so Privy Google return to `/login` is not a 404) and sets those headers.

Do not import `frontend/src/lib/hyperliquid.ts`, `@privy-io/expo`, or Expo UI into `web/`.

---

## Smoke test

- [ ] Privy login (email or OAuth)
- [ ] EVM embedded wallet created (no Solana)
- [ ] Agent approval completes
- [ ] USDC wallet → trade via Bridge2
- [ ] Push on deposit (if Firebase is wired)
- [ ] `GET /api/builder-config` returns your builder address
- [ ] Sports home loads (empty HIP-4 sports list is OK)
- [ ] Optional: `cd web && npm run dev` — catalog at localhost:5173; Privy origin includes 5173
- [ ] Optional: with `API_SPORTS_KEY`, featured banner shows a real EPL fixture (or the empty EPL card)

---

## Next

- [HL_BUILDER.md](./HL_BUILDER.md) — builder fees, Bridge2, scaling
- [DATABASE.md](./DATABASE.md) · [ENVIRONMENT.md](./ENVIRONMENT.md)
- [ROADMAP.md](./ROADMAP.md) · [MOBILE_RELEASE.md](./MOBILE_RELEASE.md)
