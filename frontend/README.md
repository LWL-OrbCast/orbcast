# HIP-4 Sports — Mobile frontend

This is the **Expo / React Native** app. Start with the **[root README](../README.md)** and **[Setup guide](../docs/SETUP.md)**.

## Quick commands

```bash
npm install
cp .env.example .env          # set EXPO_PUBLIC_BACKEND_URL, Privy, RPC, builder
npx expo start --dev-client   # requires a dev build (Privy + native modules)
```

## Key paths

| Path | Purpose |
|------|---------|
| `app/` | Expo Router — sports stubs, wallet, rewards |
| `src/lib/hip4.ts` | HIP-4 client |
| `src/lib/hlKernel.ts` | Agent / builder / withdraw (extract next) |
| `src/providers/` | Privy auth, builder config |
| `src/components/DepositPanel.tsx` | Bridge2 USDC deposits |

## Docs

- [Setup](../docs/SETUP.md)
- [HIP-4](../docs/HIP4.md)
- [HL builder](../docs/HL_BUILDER.md)
- [Environment](../docs/ENVIRONMENT.md)
- [Mobile store](../docs/MOBILE_RELEASE.md)
