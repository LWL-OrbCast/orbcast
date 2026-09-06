# Roadmap

Wallet, auth, Bridge2, relayer, push, rewards, and the HIP-4 ticket work. Sports *books* follow live `outcomeMeta` (empty filter is OK).

---

## Shipped (this starting build)

| Area | Notes |
|------|--------|
| Privy login (email / Google / Apple) | EVM embedded wallet only |
| Bridge2 wallet ↔ trade | Relayer + permit; deposit scanner + push |
| Rewards / referrals | Trading points |
| Onboarding stub row | Created on first authenticated API call |
| Push tokens | Expo + backend register |
| Forex display rates | `forex_rates_cache` |
| Outcome client | `frontend/src/lib/hip4.ts` — list, ticket, positions |
| Sports home / ticket / positions | Against live `outcomeMeta`; catalog chips All → Crypto → Stocks → Economics → sports. Stocks = HIP-4 books whose oracle is a HIP-3 coin (`xyz:SNDK`), not HIP-3 trading. |
| Vite web (`web/`) | Desktop catalog / ticket / positions / wallet / rewards |
| Home featured slider | `FeaturedEventSlider` / web mix — football **matches** get stadium chrome |
| Football overlay | Optional `API_SPORTS_KEY` — EPL + La Liga + Serie A + UEFA club score/crests; unmatched contests use the static / bundled crest map ([SPORTS.md](./SPORTS.md)) |
| Shared sports cache | `news_cache` key `sports:football:board` |

---

## Next

1. **Sports join** — HIP-4 has no `fixtureId`. Overlay matches `participantA`/`B` + `scheduledStart` (competition as a tie-break). Featured tap already opens that HIP-4 contest book.
2. **Kernel extract** — move agent / builder / withdraw into `hlKernel.ts`; delete leftover perp dump.
3. **Backend prune** — drop unused market-data helpers from `server.py`.

---

## Later (only if asked)

- **Chat** — in-app chat (market / community). Not an AI trading agent.
- **Copy-trading wallets** — opt-in follow of other addresses’ HIP-4 fills (size / markets they trade). Not the unused AI worker, not perp copy-trading.
- More leagues / sports APIs (each API-Sports sport is a separate product/quota)
- Sports-focused news
- Broader HIP-4 templates beyond sports
- Store listing + prediction-market legal copy ([MOBILE_RELEASE.md](./MOBILE_RELEASE.md))

**Out of scope for this binary:** perpetual futures, HIP-3 books, banking / cards, HIP-4 deployer staking.
