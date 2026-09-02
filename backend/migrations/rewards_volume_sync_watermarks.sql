-- Per-address HL fill cursors for rewards volume sync.
-- Master stays in last_volume_sync_at; Dedicated subs (HL-owned only) get
-- their own watermark so we can backfill without double-counting.
ALTER TABLE user_rewards
  ADD COLUMN IF NOT EXISTS volume_sync_watermarks JSONB DEFAULT '{}'::jsonb;
