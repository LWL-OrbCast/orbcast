# Database (Supabase)

Postgres via Supabase. The backend uses the **service_role** key (bypasses RLS). Sensitive tables enable RLS with **no client policies** (deny-all for anon / authenticated).

---

## Fresh project

Create a **new** Supabase project. In the SQL editor, create the tables below (or apply the equivalent from your migration history). Prefer this list over dumping every table in `backend/supabase_schema.sql` (that file can still list leftovers).

### Required

| Table | Role |
|-------|------|
| `relayer_lock` | Mutex for Bridge2 / permit relayer (multi-replica) |
| `worker_leader` | Leader election for the alert / deposit worker |
| `used_signatures` | Permit / intent replay guard |
| `user_rewards` | Points, tier, volume, referrals |
| `point_transactions` | Points ledger |
| `referrals` | Referral graph |
| `pending_trade_syncs` | Async volume-sync queue |
| `push_tokens` | Expo push tokens (Privy `user_id`) |
| `user_notification_preferences` | Push opt-in. `system_alerts_enabled` was BTC/GOLD level pushes (disabled in this app). Keep the column for a later HIP-4 sports alert worker. |
| `transfer_rate_limits` | External-transfer abuse limits |
| `deposit_scan_cursor` | Bridge2 deposit scanner cursor |
| `deposit_notifications_log` | Dedup for deposit / trade-funded pushes |
| `user_onboarding` | Identity stub (`user_id`, email, `created_at`, guide flags, `avatar_path`) |
| `forex_rates_cache` | Display-currency rates (USD base, 24h) |
| `news_cache` | Reserved for a later sports feed |

EPL featured chrome is **not** a table — in-memory cache in `sports_football.py`. See [SPORTS.md](./SPORTS.md).

### Optional ops

| Table | Role |
|-------|------|
| `app_version_policy` | In-app update banner (iOS / Android) |

### RPCs the backend expects

- `try_claim_leadership(p_task, p_holder_id, p_ttl_seconds)`
- `acquire_relayer_lock_v2` / `release_relayer_lock_v2`
- `check_and_mark_signature(p_sig_hash)`
- Rewards (service_role only): `award_points_atomic`, `grant_achievement_atomic`, `credit_trade_volume_atomic`, `qualify_referral_atomic`, `claim_pending_trade_syncs`

### Do not create

Skip leftover stock/crypto caches (`earnings_cache`, `crypto_metadata`, `stock_fundamentals`) and any banking / AI-agent tables. They are not used.

`user_onboarding` columns: `user_id`, `email`, `guide_completed`, `completed_at`, `asset_guide_completed`, `created_at`, `avatar_path`. A row is created on first authenticated API call; tour flags stay false until the user finishes a guide. `avatar_path` is the Storage object key (not a user-supplied URL). Files live in the private `avatars` bucket; the backend validates and re-encodes uploads.

---

## RLS

Enable RLS on client-reachable tables. Backend uses service_role. Do not add `anon` / `authenticated` write policies on rewards, locks, or push tokens.

Also: [SETUP.md](./SETUP.md) · [ENVIRONMENT.md](./ENVIRONMENT.md) · [SECURITY.md](../SECURITY.md)
