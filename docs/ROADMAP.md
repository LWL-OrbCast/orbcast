# Roadmap

Wallet, auth, Bridge2, relayer, push, rewards, and the HIP-4 ticket work. Sports *books* still follow live `outcomeMeta` (may be empty).

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
| EPL featured banner | Optional `API_SPORTS_KEY` — chrome only ([SPORTS.md](./SPORTS.md)) |

---

## Next

1. **Sports join** — map HIP-4 `outcomeId` to a fixture when sports books exist; featured tap should open that book, not “first live crypto”.
2. **Home featured slider (mobile)** — done (`FeaturedEventSlider`). All mixes up to 5 categories.
3. **Kernel extract** — move agent / builder / withdraw into `hlKernel.ts`; delete leftover perp dump.
4. **Backend prune** — drop unused market-data helpers from `server.py`.
5. **Shared sports cache** — done (`news_cache` key `sports:epl:board`). Keep other leagues on the same pattern if you add them.

---

## Later (only if asked)

- **Chat** — in-app chat (market / community). Not an AI trading agent.
- **Copy-trading wallets** — opt-in follow of other addresses’ HIP-4 fills (size / markets they trade). Not the unused AI worker, not perp copy-trading.
- More leagues / sports APIs (each API-Sports sport is a separate product/quota)
- Sports-focused news
- Broader HIP-4 templates beyond sports
- Store listing + prediction-market legal copy ([MOBILE_RELEASE.md](./MOBILE_RELEASE.md))

**Out of scope for this binary:** perpetual futures, HIP-3 books, banking / cards, HIP-4 deployer staking.
