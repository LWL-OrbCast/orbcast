# Mobile release & compliance

Native Expo / React Native app. Bundle IDs in this repo are placeholders (`com.example.hip4sports`). Prediction / outcome markets have a different store and legal surface than leveraged futures — write copy for **this** product.

This is **not legal advice**.

---

## Expo credentials

In **Expo → Project settings → Credentials**:

- **Android application identifier** must match `expo.android.package` in `frontend/app.json`
- **iOS bundle identifier** must match `expo.ios.bundleIdentifier`
- Expo **Google Service Account Keys** are for EAS / FCM / Play — separate from Firebase **client** files (`google-services.json` / `GoogleService-Info.plist`). See [SETUP.md](./SETUP.md) §10.

---

## Why mobile-first?

Most retail users trade on phones. Hyperliquid’s API and WS work on mobile; the hard parts are wallet UX, deposits, push, and store policy.

You do not need every HIP-4 template. A sports-only or politics-only fork is fine — keep `hip4.ts` venue-generic and filter in the UI.

---

## What to expect

Publishing to **Google Play** and the **Apple App Store** is consumer-app territory, not just DeFi. A web-only fork can avoid store org checks; a mobile fork generally cannot.

### Business license + D-U-N-S

Stores commonly expect:

- A **registered business** (LLC / Ltd / equivalent)
- A **[D-U-N-S](https://www.dnb.com/duns.html) number** — free from Dun & Bradstreet; used for Apple org accounts and some Play flows

Budget entity formation + annual filings ([COSTS.md](./COSTS.md)). D-U-N-S itself is free. Formation providers exist in many jurisdictions — pick counsel and a formation path that fits where you operate.

### Non-custodial interface

In listings, terms, and review questionnaires, say you are a **non-custodial interface** to Hyperliquid:

- Users hold keys (Privy); you are not a broker holding customer assets
- Orders and withdrawals are user-authorized on HL
- The backend sponsors gas for Bridge2 deposits — that is not custody of trading balances

Get your own legal review. This wording does not remove geo, licensing, or store rules.

### Geo-fencing

The backend can geo-fence restricted regions (including the **US**). `APPLE_REVIEW_BYPASS` exists for App Review testing. The fence is currently loose in this starting build — review it before production.

Re-check Play / Apple financial policies before each major release.

### Product regulation

Requirements vary by country. Prediction / outcome markets are **not** the same as perpetual futures. You may need disclosures, terms, privacy policy, and age gating. Do not hide a perps route in this binary.

### App store policies

- Google Play **Financial features** declaration
- Apple **Guideline 3.1** and crypto-related questions
- Accurate metadata — no “guaranteed returns”
- Export compliance (`ITSAppUsesNonExemptEncryption` in `app.json`)

### Operational

- EAS Build or a local signed pipeline
- Firebase (or equivalent) for production push
- Incident response if API keys or the relayer leak

---

## Minimum path

| Goal | What you need |
|------|----------------|
| Local / TestFlight | Privy, backend, Supabase, HL (testnet optional), Expo dev client |
| Play Store | Business entity, D-U-N-S, Play Console, policies, signed AAB, prod backend, geo / disclosures |
| App Store | Org Apple account, D-U-N-S, stricter review, often counsel |
| Web-only | Still need legal / tax judgment; store D-U-N-S may not apply |

---

## Disclaimer

Reference software, not legal advice. Consult qualified counsel for licensing, tax, and securities law in every jurisdiction you serve.
