-- Profile avatars: path on user_onboarding, bytes in a private Storage bucket.
-- Uploads go through FastAPI (Privy JWT + magic-byte / Pillow re-encode).
-- No storage.objects policies — anon / authenticated cannot read or write.

ALTER TABLE public.user_onboarding
  ADD COLUMN IF NOT EXISTS avatar_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
