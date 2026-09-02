import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/fonts';
import { cardShadow } from '../../theme/shadows';
import { RollingNumber } from '../RollingNumber';
import { ShimmerBone, useShimmerX } from '../skeleton/ShimmerBone';
import { useTranslation } from 'react-i18next';
import {
  fetchEplBoard,
  formatFootballEvent,
  formatKickoff,
  type FootballFixture,
} from '../../lib/sportsFootball';

const BANNER_STUB = require('../../../assets/images/symbols/featured-city-madrid.webp');
const BANNER_STADIUM = require('../../../assets/images/symbols/featured-banner.webp');
const BANNER_ARSENAL_VILLA = require('../../../assets/images/symbols/featured-arsenal-villa.webp');
const MADRID = require('../../../assets/images/symbols/madrid.webp');
const CITY = require('../../../assets/images/symbols/mancity.webp');
const UEFA = require('../../../assets/images/symbols/uefa.webp');

/** Sample kickoff until API-Sports is configured — today 21:00 local, live for 90m. */
const KICKOFF_HOUR = 21;
const LIVE_WINDOW_MS = 90 * 60 * 1000;

type Props = {
  onPress: () => void;
};

function nextWindow(now: number): { kickoffAt: number; liveUntil: number } {
  const d = new Date(now);
  d.setHours(KICKOFF_HOUR, 0, 0, 0);
  let kickoffAt = d.getTime();
  if (now >= kickoffAt + LIVE_WINDOW_MS) {
    kickoffAt += 24 * 60 * 60 * 1000;
  }
  return { kickoffAt, liveUntil: kickoffAt + LIVE_WINDOW_MS };
}

function formatHms(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function scoreText(fixture: FootballFixture): string {
  const { home, away } = fixture.goals;
  if (home == null || away == null) return '';
  return `${home}  –  ${away}`;
}

function LiveBadge({ label }: { label: string }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.2, { duration: 650 }),
        withTiming(1, { duration: 650 }),
      ),
      -1,
      false,
    );
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.75 + pulse.value * 0.45 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value * 0.45,
    transform: [{ scale: 1.15 + (1 - pulse.value) * 0.7 }],
  }));

  return (
    <View style={styles.livePill}>
      <View style={styles.liveDotWrap}>
        <Animated.View style={[styles.liveRing, ringStyle]} />
        <Animated.View style={[styles.liveDot, dotStyle]} />
      </View>
      <Text style={styles.liveText}>{label}</Text>
    </View>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <View style={[styles.livePill, styles.statusPill]}>
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

function teamSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isArsenalVilla(fixture: FootballFixture): boolean {
  const names = [fixture.home.name, fixture.away.name].map(teamSlug);
  const arsenal = names.some((n) => n.includes('arsenal'));
  const villa = names.some((n) => n.includes('villa'));
  return arsenal && villa;
}

function featuredBanner(fixture?: FootballFixture | null): ImageSource {
  if (fixture && isArsenalVilla(fixture)) return BANNER_ARSENAL_VILLA;
  return BANNER_STADIUM;
}

function CardChrome({
  children,
  banner = BANNER_STADIUM,
}: {
  children: React.ReactNode;
  banner?: ImageSource;
}) {
  return (
    <View style={[styles.card, cardShadow]}>
      <Image source={banner} style={styles.banner} contentFit="cover" />
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.88)', '#FFFFFF']}
        locations={[0, 0.42, 0.68, 1]}
        style={styles.fade}
      />
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function FeaturedSkeleton() {
  const shimmerX = useShimmerX([-200, 200]);
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <CardChrome>
        <ShimmerBone shimmerX={shimmerX} style={styles.leagueBone} />
        <ShimmerBone shimmerX={shimmerX} style={styles.countBone} />
        <View style={styles.teams}>
          <View style={styles.team}>
            <ShimmerBone shimmerX={shimmerX} style={styles.crestBone} />
            <ShimmerBone shimmerX={shimmerX} style={styles.nameBone} />
          </View>
          <ShimmerBone shimmerX={shimmerX} style={styles.vsBone} />
          <View style={styles.team}>
            <ShimmerBone shimmerX={shimmerX} style={styles.crestBone} />
            <ShimmerBone shimmerX={shimmerX} style={styles.nameBone} />
          </View>
        </View>
      </CardChrome>
    </View>
  );
}

function CountdownBlock({ kickoffAt, now }: { kickoffAt: number; now: number }) {
  const { t } = useTranslation();
  const remainSec = Math.max(0, Math.ceil((kickoffAt - now) / 1000));
  return (
    <View style={styles.countdownCol}>
      <RollingNumber
        value={remainSec}
        format={formatHms}
        durationMs={280}
        align="center"
        style={styles.countdown}
      />
      <Text style={styles.countdownLabel}>{t('hip4.featured.startsIn')}</Text>
    </View>
  );
}

function FixtureStatus({ fixture, now }: { fixture: FootballFixture; now: number }) {
  const { t } = useTranslation();
  if (fixture.finished) {
    return <StatusPill label={t('hip4.featured.ft')} />;
  }
  if (fixture.status === 'HT') {
    return <StatusPill label={t('hip4.featured.ht')} />;
  }
  if (fixture.live) {
    const minute =
      fixture.elapsed != null ? t('hip4.featured.minute', { n: fixture.elapsed }) : '';
    const label = minute ? `${t('hip4.status.live')} · ${minute}` : t('hip4.status.live');
    return <LiveBadge label={label} />;
  }
  if (fixture.kickoffAt && fixture.kickoffAt > now) {
    return <CountdownBlock kickoffAt={fixture.kickoffAt} now={now} />;
  }
  return <StatusPill label={fixture.statusLong || fixture.status} />;
}

function EplCard({ fixture, onPress }: { fixture: FootballFixture; onPress: () => void }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const showScore = fixture.live || fixture.finished;
  const mid = showScore ? scoreText(fixture) : '';
  const events = (fixture.events ?? []).slice(-2).map(formatFootballEvent).filter(Boolean);
  const leagueLogo = fixture.league.logo;
  const kickoffHint =
    !fixture.live && !fixture.finished && fixture.kickoffAt
      ? formatKickoff(fixture.kickoffAt)
      : fixture.venue;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.94 }]}>
      <CardChrome banner={featuredBanner(fixture)}>
        {leagueLogo ? (
          <Image
            source={{ uri: leagueLogo }}
            style={styles.leagueLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
            accessibilityLabel={t('hip4.featured.epl')}
          />
        ) : (
          <Text style={styles.kicker}>{t('hip4.featured.epl')}</Text>
        )}
        <FixtureStatus fixture={fixture} now={now} />

        <View style={styles.teams}>
          <View style={styles.team}>
            {fixture.home.logo ? (
              <Image
                source={{ uri: fixture.home.logo }}
                style={styles.crest}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.crestFallback} />
            )}
            <Text style={styles.teamName} numberOfLines={1}>
              {fixture.home.name}
            </Text>
          </View>
          <Text style={showScore && mid ? styles.score : styles.vs}>
            {showScore && mid ? mid : t('hip4.featured.vs')}
          </Text>
          <View style={styles.team}>
            {fixture.away.logo ? (
              <Image
                source={{ uri: fixture.away.logo }}
                style={styles.crest}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={styles.crestFallback} />
            )}
            <Text style={styles.teamName} numberOfLines={1}>
              {fixture.away.name}
            </Text>
          </View>
        </View>

        {events.length > 0 ? (
          <View style={styles.events}>
            {events.map((line, i) => (
              <Text key={`${i}-${line}`} style={styles.eventLine} numberOfLines={1}>
                {line}
              </Text>
            ))}
          </View>
        ) : kickoffHint ? (
          <Text style={styles.kickoffHint} numberOfLines={1}>
            {kickoffHint}
          </Text>
        ) : null}
      </CardChrome>
    </Pressable>
  );
}

function EmptyEplCard({ logo, onPress }: { logo?: string; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.94 }]}>
      <CardChrome>
        {logo ? (
          <Image
            source={{ uri: logo }}
            style={styles.leagueLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
            accessibilityLabel={t('hip4.featured.epl')}
          />
        ) : (
          <Text style={styles.kicker}>{t('hip4.featured.epl')}</Text>
        )}
        <Text style={styles.emptyCopy}>{t('hip4.featured.none')}</Text>
      </CardChrome>
    </Pressable>
  );
}

function StubCard({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { kickoffAt, liveUntil } = useMemo(() => nextWindow(now), [now]);
  const isLive = now >= kickoffAt && now < liveUntil;
  const remainSec = Math.max(0, Math.ceil((kickoffAt - now) / 1000));

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.94 }]}>
      <CardChrome banner={BANNER_STUB}>
        <Image
          source={UEFA}
          style={styles.leagueLogo}
          contentFit="contain"
          accessibilityLabel={t('hip4.featured.league')}
        />
        {isLive ? (
          <LiveBadge label={t('hip4.status.live')} />
        ) : (
          <View style={styles.countdownCol}>
            <RollingNumber
              value={remainSec}
              format={formatHms}
              durationMs={280}
              align="center"
              style={styles.countdown}
            />
            <Text style={styles.countdownLabel}>{t('hip4.featured.startsIn')}</Text>
          </View>
        )}

        <View style={styles.teams}>
          <View style={styles.team}>
            <Image source={MADRID} style={styles.crest} contentFit="contain" />
            <Text style={styles.teamName} numberOfLines={1}>
              {t('hip4.featured.madrid')}
            </Text>
          </View>
          <Text style={styles.vs}>{t('hip4.featured.vs')}</Text>
          <View style={styles.team}>
            <Image source={CITY} style={styles.crest} contentFit="contain" />
            <Text style={styles.teamName} numberOfLines={1}>
              {t('hip4.featured.city')}
            </Text>
          </View>
        </View>

        <View style={styles.bar}>
          <View style={[styles.barFill, { flex: 52, backgroundColor: '#BBF7D0' }]} />
          <View style={[styles.barFill, { flex: 48, backgroundColor: '#DDD6FE' }]} />
          <View style={styles.barOverlay} pointerEvents="none">
            <Text style={[styles.barPct, { color: colors.accent.goldDark }]}>52%</Text>
            <Text style={styles.barAsk}>{t('hip4.featured.ask')}</Text>
            <Text style={[styles.barPct, { color: '#6D28D9' }]}>48%</Text>
          </View>
        </View>
      </CardChrome>
    </Pressable>
  );
}

export function FeaturedMatchCard({ onPress }: Props) {
  const query = useQuery({
    queryKey: ['sports', 'football', 'epl'],
    queryFn: fetchEplBoard,
    staleTime: 45_000,
    refetchInterval: (q) => (q.state.data?.featured?.live ? 45_000 : 90_000),
    retry: 1,
  });

  if (query.isPending && !query.data) {
    return <FeaturedSkeleton />;
  }

  const board = query.data;
  if (board?.configured && board.featured) {
    return <EplCard fixture={board.featured} onPress={onPress} />;
  }
  if (board?.configured) {
    return <EmptyEplCard logo={board.league.logo} onPress={onPress} />;
  }
  return <StubCard onPress={onPress} />;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.background.card,
    minHeight: 248,
  },
  banner: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fade: {
    ...StyleSheet.absoluteFillObject,
  },
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    minHeight: 248,
    justifyContent: 'flex-end',
  },
  leagueLogo: {
    alignSelf: 'center',
    width: 72,
    height: 68,
    marginBottom: 6,
  },
  kicker: {
    fontFamily: fonts.extraBold,
    fontSize: 13,
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  countdownCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginBottom: 12,
  },
  countdownLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.secondary,
  },
  countdown: {
    fontFamily: fonts.extraBold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
  },
  livePill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: `${colors.accent.gold}55`,
  },
  statusPill: {
    backgroundColor: colors.background.secondary,
    borderColor: `${colors.text.secondary}33`,
  },
  liveDotWrap: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.gold,
  },
  liveRing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent.goldLight,
  },
  liveText: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.accent.goldDark,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  statusText: {
    fontFamily: fonts.extraBold,
    fontSize: 12,
    color: colors.text.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  teams: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  team: { flex: 1, alignItems: 'center', gap: 6 },
  crest: { width: 44, height: 44 },
  crestFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background.secondary,
  },
  teamName: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text.primary,
  },
  vs: {
    fontFamily: fonts.extraBold,
    fontSize: 16,
    color: colors.text.primary,
    marginHorizontal: 8,
  },
  score: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.text.primary,
    marginHorizontal: 8,
    fontVariant: ['tabular-nums'],
  },
  events: {
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
    justifyContent: 'center',
  },
  eventLine: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.secondary,
  },
  kickoffHint: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    minHeight: 36,
    textAlignVertical: 'center',
  },
  emptyCopy: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  bar: {
    height: 36,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.background.secondary,
  },
  barFill: { height: '100%' },
  barOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  barPct: { fontFamily: fonts.extraBold, fontSize: 13 },
  barAsk: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.text.primary,
  },
  leagueBone: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 10,
  },
  countBone: {
    alignSelf: 'center',
    width: 96,
    height: 18,
    borderRadius: 8,
    marginBottom: 16,
  },
  crestBone: { width: 44, height: 44, borderRadius: 22 },
  nameBone: { width: 72, height: 12, borderRadius: 6 },
  vsBone: { width: 28, height: 16, borderRadius: 6, marginHorizontal: 8 },
});
