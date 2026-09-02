import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebAuth } from '../lib/auth';
import { useCopy } from '../lib/copy';
import {
  accountInfoQueryKey,
  avatarImgReady,
  deleteOnboardingAvatar,
  fetchOnboardingAccountInfo,
  fileToAvatarBase64,
  isAllowedAvatarFile,
  markAvatarImgReady,
  readAvatarHint,
  uploadOnboardingAvatar,
  writeAvatarHint,
} from '../lib/onboarding';

type Props = {
  size?: number;
  /** Wallet: + to upload, − to delete. Header is display-only. */
  editable?: boolean;
};

export function ProfileAvatar({ size = 40, editable = false }: Props) {
  const { profile: profileCopy } = useCopy();
  const { getAccessToken, authenticated, userId, email, address } = useWebAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const signedUrlRetry = useRef(false);

  const query = useQuery({
    queryKey: accountInfoQueryKey(userId),
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { created_at: null, avatar_url: null, has_avatar: false };
      return fetchOnboardingAccountInfo(token);
    },
    enabled: authenticated && !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: true,
    retry: 1,
  });

  const [hint, setHint] = useState<string | null>(null);
  useEffect(() => {
    signedUrlRetry.current = false;
    setHint(userId ? readAvatarHint(userId) : null);
    setBroken(false);
  }, [userId]);

  // Fresh answer wins; while the request is in flight, fall back to the hint
  // so a page refresh doesn't flash the letter fallback before the image.
  const url = !authenticated || !userId
    ? null
    : query.data
      ? (query.data.has_avatar ? query.data.avatar_url : null)
      : hint || null;
  const resolving = authenticated && !!userId && !query.data && !query.isError && hint === null;

  // Persist what the backend said for this user only — never from a logout wipe.
  useEffect(() => {
    if (!userId || !query.isSuccess || !query.data) return;
    writeAvatarHint(userId, query.data.has_avatar ? query.data.avatar_url : null);
  }, [userId, query.isSuccess, query.data]);

  // Only show a URL once its image has decoded, so we never paint the letter
  // (or a blank circle) and then snap to the photo — or vice versa.
  const [shownUrl, setShownUrl] = useState<string | null>(() =>
    url && avatarImgReady(url) ? url : null,
  );
  useEffect(() => {
    if (!url) {
      setShownUrl(null);
      setBroken(false);
      return;
    }
    if (avatarImgReady(url)) {
      setShownUrl(url);
      setBroken(false);
      return;
    }
    let cancelled = false;
    const im = new Image();
    im.onload = () => {
      markAvatarImgReady(url);
      if (!cancelled) {
        setShownUrl(url);
        setBroken(false);
      }
    };
    im.onerror = () => {
      if (cancelled) return;
      setBroken(true);
      if (!signedUrlRetry.current && userId) {
        signedUrlRetry.current = true;
        void qc.invalidateQueries({ queryKey: accountInfoQueryKey(userId) });
      }
    };
    im.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, userId, qc]);

  // Skeleton while we don't yet know the answer, or while the known image decodes.
  const pending = resolving || (Boolean(url) && !shownUrl && !broken);
  const hasAvatar = Boolean(shownUrl) && !broken;
  const initial = (
    String(email ?? address ?? 'U').replace(/^0x/i, '').trim().charAt(0) || 'U'
  ).toUpperCase();

  const pickAndUpload = useCallback(async (file: File) => {
    if (busy) return;
    const clientErr = isAllowedAvatarFile({ mimeType: file.type, fileSize: file.size });
    if (clientErr) {
      setNote(clientErr);
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      setNote(profileCopy.avatarSaveError);
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const dataUrl = await fileToAvatarBase64(file);
      const saved = await uploadOnboardingAvatar(token, dataUrl);
      setBroken(false);
      qc.setQueryData(accountInfoQueryKey(userId), (prev) => ({
        created_at:
          prev && typeof prev === 'object' && 'created_at' in prev
            ? (prev as { created_at: string | null }).created_at
            : null,
        avatar_url: saved.avatar_url,
        has_avatar: saved.has_avatar,
      }));
      if (userId) writeAvatarHint(userId, saved.avatar_url);
    } catch (e) {
      setNote(e instanceof Error ? e.message : profileCopy.avatarSaveError);
    } finally {
      setBusy(false);
    }
  }, [busy, getAccessToken, qc, userId, profileCopy.avatarSaveError]);

  const removeAvatar = useCallback(async () => {
    if (busy) return;
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    setNote(null);
    try {
      await deleteOnboardingAvatar(token);
      setBroken(false);
      qc.setQueryData(accountInfoQueryKey(userId), (prev) => ({
        created_at:
          prev && typeof prev === 'object' && 'created_at' in prev
            ? (prev as { created_at: string | null }).created_at
            : null,
        avatar_url: null,
        has_avatar: false,
      }));
      if (userId) writeAvatarHint(userId, null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : profileCopy.avatarDeleteError);
    } finally {
      setBusy(false);
    }
  }, [busy, getAccessToken, qc, userId, profileCopy.avatarDeleteError]);

  const inner = (
    <span
      className="relative flex items-center justify-center overflow-hidden rounded-full border-2 border-[var(--accent)] bg-[#DCFCE7] text-sm font-extrabold text-[var(--accent-dark)]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {hasAvatar && shownUrl ? (
        <img
          src={shownUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : pending ? (
        <span className="skel absolute inset-0 rounded-full" />
      ) : (
        initial
      )}
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center bg-[rgba(15,23,42,0.35)]">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </span>
      ) : null}
    </span>
  );

  if (!editable) return inner;

  const badgeSize = Math.max(16, Math.round(size * 0.36));
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size + 6, height: size + 6 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void pickAndUpload(file);
        }}
      />
      <button
        type="button"
        disabled={busy || hasAvatar}
        aria-label={hasAvatar ? profileCopy.avatarA11ySet : profileCopy.avatarA11yAdd}
        onClick={() => {
          if (!hasAvatar) inputRef.current?.click();
        }}
        className="rounded-full p-0 disabled:cursor-default"
      >
        {inner}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (hasAvatar) void removeAvatar();
          else inputRef.current?.click();
        }}
        aria-label={hasAvatar ? profileCopy.avatarA11yRemove : profileCopy.avatarA11yAdd}
        className="absolute flex items-center justify-center rounded-full border-2 border-white text-white"
        style={{
          width: badgeSize,
          height: badgeSize,
          right: -2,
          bottom: -2,
          background: hasAvatar ? 'var(--danger)' : 'var(--accent)',
          fontSize: Math.round(badgeSize * 0.72),
          lineHeight: 1,
        }}
      >
        {hasAvatar ? '−' : '+'}
      </button>
      {note ? (
        <span className="absolute left-1/2 top-full z-10 mt-1 w-40 -translate-x-1/2 text-center text-[11px] font-semibold text-[var(--danger)]">
          {note}
        </span>
      ) : null}
    </span>
  );
}
