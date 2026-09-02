# Hyperliquid builder integration

How this app attaches **builder fees**, talks to Hyperliquid, and runs **Bridge2** deposits.

HIP-4 outcome orders take a builder on **buys and sells** (charged in quote). Pin `EXPO_PUBLIC_HL_BUILDER_ADDRESS` on the client.

Official: [Hyperliquid Docs](https://hyperliquid.gitbook.io/hyperliquid-docs) · [Builder codes](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes)

---

## Architecture

```
Expo / Vite (Privy EOA + HL agent key)
    ├── REST / WS ──► Hyperliquid (orders, info, account stream)
    └── REST ───────► Your FastAPI
                          ├── Supabase
                          └── Arbitrum RPC + Bridge2 relayer
```

### Signed on the client

The backend does **not** place the user's outcome orders.

| Flow | Who signs |
|------|-----------|
| Place / cancel / modify | HL agent key — Expo SecureStore; web IndexedDB (`agentStore.ts`) |
| Approve agent / approve builder fee | Privy master EOA |
| Withdrawals | Master / EIP-712 (see `hlEnv.ts` / `webKernel.ts` for chain IDs) |

### Via the backend

| Flow | Why |
|------|-----|
| Bridge2 gasless deposit | Relayer submits `permit` + deposit; pays Arbitrum gas |
| `GET /api/builder-config` | Fee + optional rewards discount. Public; clients **ignore** a different `address` and clamp fee to the shipped ceiling |
| Push, rewards, onboarding | Supabase + Privy JWT |

---

## Builder fee

Fees use **tenths of a basis point**:

- `30` tenths = 3 bps = **0.03%**
- `100` tenths = 10 bps = **0.1%**

### Backend

```env
BUILDER_ADDRESS=0xYourBuilderAddress
BUILDER_FEE=30   # tenths bps
```

If unset, `server.py` uses the repo default. Exposed at `GET /api/builder-config` (`address`, `fee`, optional rewards `discount`).

### Frontend (client-pinned)

Orders attach the builder from **app env**, not blindly from the API:

1. Expo: `EXPO_PUBLIC_HL_BUILDER_ADDRESS` / `EXPO_PUBLIC_HL_BUILDER_FEE_TENTHS_BPS` (`.env` or EAS). Web: `VITE_HL_BUILDER_ADDRESS` / `VITE_HL_BUILDER_FEE_TENTHS_BPS`. Unset → hardcoded default in the client.
2. Clients fetch `/api/builder-config` for **fee discounts only**. A mismatched API `address` is ignored; fee is clamped to the client ceiling (`BuilderConfigProvider` / `web/src/lib/builderFee.ts`).
3. The user must `approveBuilderFee` once for that pinned address.

```env
EXPO_PUBLIC_HL_BUILDER_ADDRESS=0xYourBuilderAddress
EXPO_PUBLIC_HL_BUILDER_FEE_TENTHS_BPS=30
# web/.env — same address
VITE_HL_BUILDER_ADDRESS=0xYourBuilderAddress
VITE_HL_BUILDER_FEE_TENTHS_BPS=30
```

Rebuild the native / dev client after changing `EXPO_PUBLIC_*`. Rebuild Vite after changing `VITE_*`.

To collect fees yourself: register a builder on Hyperliquid, set the Expo **and** Vite vars **and** matching backend vars, keep fee ≤ your registered max, then test an order with the builder field set.

---

## Agent key

A dedicated HL agent private key signs trades. It **cannot** withdraw — `withdraw3` / permits stay on the Privy master EOA.

| | Mobile (Expo) | Web (Vite) |
|--|---------------|------------|
| Store | SecureStore, device-only (`hyperliquid.ts`) | AES-GCM IndexedDB, scoped to master wallet (`agentStore.ts`) |
| Namespace | `mainnet` vs `demo` in `hlEnv.ts` | `agent_v2_${network}_${owner}` |
| Logout | Clears SecureStore agent state | Wipes the encrypted record — next login may re-`approveAgent` |

Privy EOA stays the master account. The agent signs trades without prompting every tap.

---

## Deposits — Bridge2 on Arbitrum

1. User holds USDC on Arbitrum (Privy EOA)
2. App builds an EIP-2612 **permit** for Bridge2
3. User signs the permit
4. App sends permit + deposit intent to the backend
5. Relayer submits the on-chain tx (pays ETH gas)
6. USDC credits on Hyperliquid L1

| Piece | Location |
|-------|----------|
| Bridge2 address | `HL_BRIDGE2_ADDRESS` or defaults in `DepositPanel.tsx` |
| Relayer key | `BRIDGE2_RELAYER_PRIVATE_KEY` (backend only) |
| Min deposit | 5 USDC (HL convention) |

Withdrawals are signed **client-side** and sent to the HL exchange endpoint.

---

## Mainnet vs demo

| | Mainnet | Demo (HL testnet) |
|---|---------|-------------------|
| Switch | `tradingEnv = 'mainnet'` | `tradingEnv = 'demo'` |
| Code | `frontend/src/lib/hlEnv.ts` | same |
| REST | `https://api.hyperliquid.xyz` | `https://api.hyperliquid-testnet.xyz` |
| WS | `wss://api.hyperliquid.xyz/ws` | `wss://api.hyperliquid-testnet.xyz/ws` |
| Agent keys | Separate SecureStore namespace | Do not reuse the mainnet agent |
| Grants | — | `HL_TESTNET_MASTER_PK` |

Demo is for onboarding and store review. You can ship mainnet-only and omit `HL_TESTNET_*`.

---

## Outcome markets

HIP-4 types, venues, and `userOutcome` live in [HIP4.md](./HIP4.md) and `frontend/src/lib/hip4.ts`.

Trust live `outcomeMeta` — do not hardcode deployer addresses from docs.

---

## Scaling & rate limits

Dollar ballparks: [COSTS.md](./COSTS.md). Official: [HL rate limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits).

| Lever | Launch minimum |
|-------|----------------|
| FastAPI replicas | **1** is enough for Bridge2. Locks make extra replicas safe. |
| Relayer keys | **1** works; more helps under concurrent deposits |

Most trading hits **the phone → Hyperliquid**, not your Railway IP. The backend scales with deposits, push, and rewards — not with every order.

| Limit | Scope |
|-------|--------|
| **IP weight** | ~1200 REST weight / minute / IP |
| **Address actions** | Per user; grows with traded USDC |

Because each phone uses its own IP, many traders do not stack onto one backend HL budget.

Optional HL levers (not wired in by default): [`reserveRequestWeight`](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint#reserve-additional-actions), a [non-validating info node](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/nodes), vendor indexed APIs, [priority fees](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/priority-fees).

Other walls: Alchemy / RPC on deposit spikes, relayer ETH float, Supabase / Privy plan limits.

A modest stack can handle on the order of **~1k active users** if Bridge2 stays bursty. That is a planning guess, not a guarantee.

---

## What you can skip

Bridge2 is strongly recommended for mobile UX (users can still deposit manually). Rewards, FX cache, and push are optional.

---

## Stay current

| Channel | Why |
|---------|-----|
| [Hyperliquid API Announcements](https://t.me/hyperliquid_api) | Breaking / additive API notes |
| [HL Discord](https://discord.gg/hyperliquid) `#api-traders` | API questions |
| [Privy React Native changelog](https://docs.privy.io/changelogs/react-native) | `@privy-io/expo` fixes |

Also: [SETUP.md](./SETUP.md) · [ENVIRONMENT.md](./ENVIRONMENT.md) · [MOBILE_RELEASE.md](./MOBILE_RELEASE.md)
