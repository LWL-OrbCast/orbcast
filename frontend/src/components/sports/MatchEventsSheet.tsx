import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  fetchFootballEvents,
  formatFootballEvent,
  type FootballFixture,
} from '../../lib/sportsFootball';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

type Props = {
  fixture: FootballFixture;
  onClose: () => void;
};

export function MatchEventsSheet({ fixture, onClose }: Props) {
  const { t } = useTranslation();
  const seeded = fixture.events ?? [];
  const q = useQuery({
    queryKey: ['sports', 'football', 'events', fixture.fixtureId],
    queryFn: () => fetchFootballEvents(fixture.fixtureId),
    enabled: fixture.fixtureId > 0,
    staleTime: 45_000,
    retry: 1,
  });
  const rows = q.data?.events?.length ? q.data.events : seeded;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.headCopy}>
              <Text style={styles.title}>{t('hip4.featured.events')}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {fixture.home.name} vs {fixture.away.name}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel={t('common.close', 'Close')}
            >
              <Ionicons name="close" size={18} color={colors.text.secondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
            {q.isPending && !rows.length ? (
              <ActivityIndicator color={colors.accent.goldDark} style={styles.pad} />
            ) : q.isError && !rows.length ? (
              <Text style={styles.empty}>{t('hip4.featured.eventsLoadError')}</Text>
            ) : !rows.length ? (
              <Text style={styles.empty}>{t('hip4.featured.eventsEmpty')}</Text>
            ) : (
              rows.map((ev, i) => {
                const line = formatFootballEvent(ev);
                return line ? (
                  <Text key={`${i}-${line}`} style={styles.line}>
                    {line}
                  </Text>
                ) : null;
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    maxHeight: '80%',
    borderRadius: 20,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border.primary,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
  },
  headCopy: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.text.primary,
  },
  sub: {
    marginTop: 2,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.secondary,
  },
  close: {
    padding: 4,
  },
  list: { maxHeight: 420 },
  listInner: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 8,
  },
  line: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
  empty: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingVertical: 28,
  },
  pad: { marginVertical: 28 },
});
