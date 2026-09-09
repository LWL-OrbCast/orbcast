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
  footballEventKind,
  footballEventLabel,
  footballEventMinute,
  type FootballEvent,
  type FootballEventKind,
  type FootballFixture,
} from '../../lib/sportsFootball';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';

type Props = {
  fixture: FootballFixture;
  onClose: () => void;
};

function EventGlyph({ kind }: { kind: FootballEventKind }) {
  if (kind === 'goal' || kind === 'penalty') {
    return (
      <View style={[styles.glyph, styles.glyphGoal]}>
        <Ionicons name="football" size={16} color={colors.accent.goldDark} />
      </View>
    );
  }
  if (kind === 'ownGoal' || kind === 'missedPenalty') {
    return (
      <View style={[styles.glyph, styles.glyphBad]}>
        <Ionicons name="football" size={16} color={colors.status.errorDark} />
      </View>
    );
  }
  if (kind === 'sub') {
    return (
      <View style={[styles.glyph, styles.glyphSub]}>
        <Ionicons name="swap-vertical" size={16} color="#2563EB" />
      </View>
    );
  }
  if (kind === 'yellow') {
    return (
      <View style={[styles.glyph, styles.glyphYellow]}>
        <View style={[styles.card, { backgroundColor: '#EAB308' }]} />
      </View>
    );
  }
  if (kind === 'red') {
    return (
      <View style={[styles.glyph, styles.glyphBad]}>
        <View style={[styles.card, { backgroundColor: colors.status.errorDark }]} />
      </View>
    );
  }
  if (kind === 'var') {
    return (
      <View style={[styles.glyph, styles.glyphMuted]}>
        <Ionicons name="eye-outline" size={15} color={colors.text.secondary} />
      </View>
    );
  }
  return (
    <View style={[styles.glyph, styles.glyphMuted]}>
      <View style={styles.dot} />
    </View>
  );
}

function EventRow({ ev, last }: { ev: FootballEvent; last?: boolean }) {
  const kind = footballEventKind(ev);
  const minute = footballEventMinute(ev);
  const label = footballEventLabel(ev);
  const team = ev.team?.trim();
  const off = ev.assist?.trim();
  const on = ev.player?.trim();
  const meta = [label, team].filter(Boolean).join(' · ');
  const extra = (kind === 'goal' || kind === 'penalty') && off ? `Assist ${off}` : null;

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <EventGlyph kind={kind} />
      <View style={styles.rowBody}>
        {kind === 'sub' ? (
          <>
            {off ? (
              <Text style={styles.primary}>
                <Text style={styles.arrowOff}>↓  </Text>
                {off}
              </Text>
            ) : null}
            {on ? (
              <Text style={styles.primary}>
                <Text style={styles.arrowOn}>↑  </Text>
                {on}
              </Text>
            ) : null}
            {!off && !on ? (
              <Text style={styles.primary}>{team || label}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.primary}>{on || team || label}</Text>
        )}
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {extra ? <Text style={styles.extra}>{extra}</Text> : null}
      </View>
      {minute ? <Text style={styles.minute}>{minute}</Text> : null}
    </View>
  );
}

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
              rows.map((ev, i) => (
                <EventRow
                  key={`${i}-${footballEventMinute(ev)}-${ev.player}-${ev.type}`}
                  ev={ev}
                  last={i === rows.length - 1}
                />
              ))
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
    paddingHorizontal: 18,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    maxHeight: '82%',
    borderRadius: 22,
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
    paddingTop: 18,
    paddingBottom: 14,
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
    marginTop: 3,
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.secondary,
  },
  close: {
    padding: 4,
  },
  list: { maxHeight: 440 },
  listInner: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.primary,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 8,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  glyph: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphGoal: { backgroundColor: '#ECFDF3' },
  glyphSub: { backgroundColor: '#EFF6FF' },
  glyphYellow: { backgroundColor: '#FFFBEB' },
  glyphBad: { backgroundColor: '#FFF1F2' },
  glyphMuted: { backgroundColor: colors.background.secondary },
  card: {
    width: 11,
    height: 15,
    borderRadius: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.muted,
  },
  primary: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
  meta: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  extra: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 16,
  },
  minute: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.text.secondary,
    fontVariant: ['tabular-nums'],
    paddingTop: 2,
  },
  arrowOff: {
    fontFamily: fonts.extraBold,
    color: colors.status.errorDark,
  },
  arrowOn: {
    fontFamily: fonts.extraBold,
    color: colors.accent.goldDark,
  },
  empty: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingVertical: 32,
  },
  pad: { marginVertical: 32 },
});
