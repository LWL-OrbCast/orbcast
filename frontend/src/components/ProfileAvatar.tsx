import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';
import { useAuth } from '../providers/AuthContext';
import { showErrorToast } from '../lib/toast';
import {
  ONBOARDING_ACCOUNT_INFO_QUERY_KEY,
  deleteOnboardingAvatar,
  fetchOnboardingAccountInfo,
  isAllowedAvatarFile,
  readCachedAvatarUrl,
  uploadOnboardingAvatar,
  writeCachedAvatarUrl,
} from '../lib/onboarding';

type Props = {
  size?: number;
  /** Profile: + to upload, − to delete. Home header is display-only. */
  editable?: boolean;
};

export function ProfileAvatar({ size = 40, editable = false }: Props) {
  const { t } = useTranslation();
  const { getAccessToken, user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [ONBOARDING_ACCOUNT_INFO_QUERY_KEY, user?.id],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token) return { created_at: null, avatar_url: null, has_avatar: false };
      return fetchOnboardingAccountInfo(token);
    },
    enabled: isAuthenticated && !!user?.id,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!user?.id) {
      setCachedUrl(null);
      return;
    }
    let cancelled = false;
    void readCachedAvatarUrl(user.id).then((url) => {
      if (!cancelled) setCachedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !query.isSuccess) return;
    const url = query.data?.has_avatar ? query.data.avatar_url : null;
    setCachedUrl(url);
    void writeCachedAvatarUrl(user.id, url);
  }, [user?.id, query.isSuccess, query.data?.has_avatar, query.data?.avatar_url]);

  const displayUrl =
    isAuthenticated && user?.id
      ? (query.data?.has_avatar && query.data.avatar_url) || cachedUrl || null
      : null;
  const hasAvatar = Boolean(displayUrl);
  const initial = (
    String(user?.email ?? user?.wallet?.address ?? 'U').trim().charAt(0) || 'U'
  ).toUpperCase();

  const pickAndUpload = useCallback(async () => {
    if (busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.status !== 'granted') {
      showErrorToast(t('profile.avatarPermission', 'Allow photo access to set a profile picture.'));
      return;
    }
    let result: ImagePicker.ImagePickerResult;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        exif: false,
        base64: true,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
    } catch {
      showErrorToast(t('profile.avatarReadError', 'Could not read that photo. Try another PNG, JPG, or WebP.'));
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const mime = (asset.mimeType || '').toLowerCase();
    if (mime.includes('heic') || mime.includes('heif') || mime.includes('gif') || mime.includes('svg')) {
      showErrorToast(t('profile.avatarTypeError', 'Use a PNG, JPG, or WebP image (2 MB max).'));
      return;
    }
    const clientErr = isAllowedAvatarFile({ mimeType: asset.mimeType, fileSize: asset.fileSize });
    if (clientErr) {
      showErrorToast(clientErr);
      return;
    }
    if (!asset.base64) {
      showErrorToast(t('profile.avatarReadError', 'Could not read that photo. Try another PNG, JPG, or WebP.'));
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      showErrorToast(t('profile.avatarSaveError', 'Could not save avatar.'));
      return;
    }
    setBusy(true);
    try {
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const saved = await uploadOnboardingAvatar(token, asset.base64);
      queryClient.setQueryData([ONBOARDING_ACCOUNT_INFO_QUERY_KEY, user?.id], (prev) => ({
        created_at: prev && typeof prev === 'object' && 'created_at' in prev
          ? (prev as { created_at: string | null }).created_at
          : null,
        avatar_url: saved.avatar_url,
        has_avatar: saved.has_avatar,
      }));
      setCachedUrl(saved.avatar_url);
      if (user?.id) void writeCachedAvatarUrl(user.id, saved.avatar_url);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : t('profile.avatarSaveError', 'Could not save avatar.'));
    } finally {
      setBusy(false);
    }
  }, [busy, getAccessToken, queryClient, t, user?.id]);

  const removeAvatar = useCallback(async () => {
    if (busy) return;
    const token = await getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      await deleteOnboardingAvatar(token);
      queryClient.setQueryData([ONBOARDING_ACCOUNT_INFO_QUERY_KEY, user?.id], (prev) => ({
        created_at: prev && typeof prev === 'object' && 'created_at' in prev
          ? (prev as { created_at: string | null }).created_at
          : null,
        avatar_url: null,
        has_avatar: false,
      }));
      setCachedUrl(null);
      if (user?.id) void writeCachedAvatarUrl(user.id, null);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : t('profile.avatarDeleteError', 'Could not remove avatar.'));
    } finally {
      setBusy(false);
    }
  }, [busy, getAccessToken, queryClient, t, user?.id]);

  const badgeSize = Math.max(16, Math.round(size * 0.36));
  const inner = (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {hasAvatar ? (
        <Image
          source={{ uri: displayUrl! }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <Text style={[styles.letter, { fontSize: Math.round(size * 0.38) }]}>{initial}</Text>
      )}
      {busy ? (
        <View style={[styles.busy, { borderRadius: size / 2 }]}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );

  if (!editable) {
    return inner;
  }

  return (
    <View style={{ width: size + 6, height: size + 6, alignItems: 'center', justifyContent: 'center' }}>
      <TouchableOpacity
        activeOpacity={hasAvatar ? 1 : 0.8}
        onPress={hasAvatar ? undefined : pickAndUpload}
        disabled={busy || hasAvatar}
        accessibilityRole="button"
        accessibilityLabel={
          hasAvatar
            ? t('profile.avatarA11ySet', 'Profile picture')
            : t('profile.avatarA11yAdd', 'Add profile picture')
        }
      >
        {inner}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.badge,
          {
            width: badgeSize,
            height: badgeSize,
            borderRadius: badgeSize / 2,
            backgroundColor: hasAvatar ? colors.status.error : colors.accent.gold,
          },
        ]}
        onPress={hasAvatar ? removeAvatar : pickAndUpload}
        disabled={busy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          hasAvatar
            ? t('profile.avatarA11yRemove', 'Remove profile picture')
            : t('profile.avatarA11yAdd', 'Add profile picture')
        }
      >
        <Ionicons name={hasAvatar ? 'remove' : 'add'} size={Math.round(badgeSize * 0.72)} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.accent.gold,
    overflow: 'hidden',
  },
  letter: {
    fontFamily: fonts.bold,
    color: colors.accent.goldDark,
  },
  busy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background.card,
  },
});
