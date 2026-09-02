-- In-app update banner policy (ops — optional but used by production app).
-- One row per platform. Service-role reads via FastAPI GET /api/... version policy.
-- RLS enabled with NO policies (deny-all for anon/authenticated).

CREATE TABLE IF NOT EXISTS public.app_version_policy (
  platform text PRIMARY KEY
    CHECK (platform = ANY (ARRAY['android'::text, 'ios'::text])),
  latest_version text NOT NULL,
  min_version text NOT NULL,
  store_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_version_policy IS
  'Drives the in-app update banner. One row per platform. latest_version = newest published build (below it -> soft banner). min_version = oldest supported (below it -> force, reserved for future use). enabled toggles the whole check off.';

ALTER TABLE public.app_version_policy ENABLE ROW LEVEL SECURITY;

-- Seed placeholders — replace versions/URLs for your fork before shipping.
INSERT INTO public.app_version_policy (platform, latest_version, min_version, store_url, enabled, message)
VALUES
  ('android', '0.0.0', '0.0.0', 'https://play.google.com/store/apps/details?id=YOUR_PACKAGE', false, NULL),
  ('ios', '0.0.0', '0.0.0', 'https://apps.apple.com/app/idYOUR_APP_ID', false, NULL)
ON CONFLICT (platform) DO NOTHING;
