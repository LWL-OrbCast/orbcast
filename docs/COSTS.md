# Expected costs

Order-of-magnitude monthly costs. Prices change — treat this as expectation-setting, not a quote.

Builder fees use **tenths of a basis point** ([HL_BUILDER.md](./HL_BUILDER.md)): **0.1% = 10 bps = `100` tenths**. Example: **$1M** monthly volume at **0.1%** ≈ **$1,000** builder fee. A lean stack can sit under **~$500/mo** SaaS before gas float and store one-offs.

Scaling notes: [HL_BUILDER.md](./HL_BUILDER.md#scaling--rate-limits).

---

## Core stack

| Service | Role | Ballpark |
|---------|------|----------|
| **Expo / EAS** | Mobile builds | ~$19 → expect ~$199 if you upgrade |
| **Railway** (FastAPI) | Backend | ~$5 hobby → expect ~$20+ when upgraded |
| **Supabase** | Postgres | $0 free → expect ~$25 on Pro |
| **Privy** | Embedded wallets | $0 start → expect ~$299 on growth plans |
| **Alchemy** (or similar RPC) | Arbitrum / Bridge2 | ~$5 → pay-as-you-go if you scale |
| **Domain** | API / marketing | Often ≤ ~$5/mo |

**Also budget:**

| Item | Notes |
|------|--------|
| **Bridge2 relayer ETH** | Hot wallet gas on Arbitrum — keep a float |
| **Play / Apple** | Play ~$25 one-time; Apple Developer ~$99/yr |
| **Business entity + D-U-N-S** | Stores often expect a company for financial apps. D-U-N-S is free. See [MOBILE_RELEASE.md](./MOBILE_RELEASE.md) |
| **Firebase / Expo push** | Usually free at small scale |
| **FX rates** | Optional; app degrades if unset |

Web-only forks may skip store org checks. Mobile forks should budget a company + D-U-N-S.

**$1M volume × 0.1% builder fee ≈ $1,000** — a mental model for “does infra pay for itself,” not a volume promise.

---

## Related

- [HL_BUILDER.md](./HL_BUILDER.md) · [ENVIRONMENT.md](./ENVIRONMENT.md) · [SETUP.md](./SETUP.md)
- [MOBILE_RELEASE.md](./MOBILE_RELEASE.md)
