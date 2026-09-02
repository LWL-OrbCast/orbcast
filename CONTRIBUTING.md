# Contributing

Thanks for interest in this HIP-4 reference. It is a **mobile-first outcome-markets** app. Read these before opening a PR:

- [AGENTS.md](./AGENTS.md) — repo map for coding agents
- [docs/HIP4.md](./docs/HIP4.md) — protocol + venue notes
- [docs/SPORTS.md](./docs/SPORTS.md) — EPL chrome vs HIP-4 book
- [docs/SETUP.md](./docs/SETUP.md) — local run
- [SECURITY.md](./SECURITY.md) — what never to commit

## Scope for PRs

| In scope | Out of scope |
|----------|----------------|
| Outcome client, sports UI, wallet, Bridge2, rewards, push, docs | Perps, HIP-3, banking, AI worker, deployer actions |

Prefer changes that help the **trader** path: list markets → ticket → sign an outcome order → positions.

## Development

1. Fork / clone; copy `backend/.env.example` and `frontend/.env.example`.
2. Use **your** Privy, Supabase, RPC, and Firebase files — not this app’s production secrets.
3. Use a **new** relayer EOA (do not reuse another product’s keys).
4. Run backend + Expo per [SETUP.md](./docs/SETUP.md).
5. Keep PRs focused; match existing style; English-only i18n unless asked otherwise.

## Pull requests

- Describe **why** the change matters (UX, security, bug fix, docs).
- Don’t commit `.env`, Firebase plist/json, relayer keys, or `service_role` keys.
- Don’t add exploit tooling or production credentials.
- Update docs when you change setup, env vars, or product scope.

## Support / donations

Optional — if you want to support maintenance of this reference app:

`0x29a1D36DaEE6B0E0Dd4873dd964677000B6e23EB`

## License

By contributing, you agree your contributions are licensed under the MIT License (see [LICENSE](./LICENSE)).
