# HIP-4 notes

Outcome markets are **not** perpetual futures:

- Fully collateralized, dated, no leverage, no liquidations
- Asset id = `100_000_000 + 10 * outcome + side` (side 0 or 1)
- Info: `outcomeMeta`, `outcomeTemplates`, `settledOutcome`
- User actions: `userOutcome` split / merge / mergeQuestion / negate
- Fees: mint free; pay on close or settle; builder codes on sells **and** buys (quote)
- The official HIP-4 *overview* can lag deployer/API pages and live `outcomeMeta`

Live client: `frontend/src/lib/hip4.ts`.

## Venues

HIP-4 deployers register a **venue** (2–4 lowercase letters). People may say “HIP-4 DEX”; on-chain it is `venue`. That is a different namespace from HIP-3 perp dex names.

Probe (re-run yourself): `POST https://api.hyperliquid.xyz/info` body `{"type":"outcomeMeta"}`.

**Mainnet snapshot 2026-08-29:** one deployer, venue `out`, address `0x0c46eb73fae2816f219fcf11f50d6d3c59b5819e`, 19 outcomes + 1 question. Markets were recurring crypto binaries / BTC buckets / price templates. **No sports listings in that snapshot.**

**Testnet:** many venues — permissionless `activateOutcomeDeployer` is in use.

## Outcome.xyz

[Outcome.xyz](https://docs.outcome.xyz/outcome-architecture) is a HIP-4 **deployer + frontend**. Docs name the venue **OUT**, stake 500k HYPE, and cover sports / politics / macro / crypto / culture. Their SDK is `@outcome.xyz/hip4`.

Their published deployer `0x423d7f725ae7056f03f7ef57f9d0303f91c62e06` **did not match** live mainnet `outcomeMeta` — trust the API.

This app is a **trader** UI. Do not become a HIP-4 deployer unless asked.

Home’s featured EPL card is **match chrome** (API-Sports via the backend). It is not a HIP-4 market and is not joined to `outcomeId` yet. See [SPORTS.md](./SPORTS.md).
