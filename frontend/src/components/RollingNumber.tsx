import React, { memo, useEffect, useMemo, useState } from 'react';
import {
  InteractionManager,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type TextStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type RollingNumberProps = {
  /** Numeric value to display; `null` shows `emptyText` with no roll. */
  value: number | null;
  /** Your own formatter — the string it returns is what gets rolled, untouched. */
  format: (n: number) => string;
  /** Digit text styling (fontSize, color, weight, etc.). */
  style?: TextStyle | TextStyle[];
  /** Shown when `value` is null / non-finite. */
  emptyText?: string;
  /** Hard override for roll duration. When omitted, scales with the number's magnitude. */
  durationMs?: number;
  /** Horizontal anchor used when the row is scaled to fit its slot. */
  align?: 'left' | 'center' | 'right';
};

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Magnitude-scaled roll timing: more integer digits → longer, more deliberate roll. */
const BASE_DURATION_MS = 520;
const PER_INT_DIGIT_MS = 150;
const MAX_DURATION_MS = 1250;

/** Count digits before the decimal point (grouping separators don't count). */
function countIntegerDigits(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 48 && c <= 57) count++;
    else if (text[i] === '.') break;
  }
  return Math.max(1, count);
}

function magnitudeDuration(text: string): number {
  const d = BASE_DURATION_MS + PER_INT_DIGIT_MS * (countIntegerDigits(text) - 1);
  return Math.min(MAX_DURATION_MS, d);
}

/** Typographic props only — strips margins/padding/positioning so stacked digits
 *  inside a wheel stay exactly `lineHeight` apart (otherwise the roll mis-lands). */
const GLYPH_KEYS = [
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'letterSpacing',
  'textTransform',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius',
] as const;

function flatten(style?: TextStyle | TextStyle[]): TextStyle {
  return StyleSheet.flatten(style) ?? {};
}

function pickGlyphStyle(flat: TextStyle): TextStyle {
  const out: Record<string, unknown> = {};
  for (const k of GLYPH_KEYS) {
    if (flat[k] != null) out[k] = flat[k];
  }
  return out as TextStyle;
}

/** A single vertical 0–9 wheel that translates to the target digit on the UI thread. */
const DigitWheel = memo(function DigitWheel({
  digit,
  lineHeight,
  durationMs,
  textStyle,
  play,
}: {
  digit: number;
  lineHeight: number;
  durationMs: number;
  textStyle: TextStyle;
  play: boolean;
}) {
  const ty = useSharedValue(0);

  useEffect(() => {
    if (!play) {
      ty.value = 0;
      return;
    }
    ty.value = withTiming(-digit * lineHeight, {
      duration: durationMs,
      easing: Easing.out(Easing.cubic),
    });
  }, [digit, lineHeight, durationMs, play, ty]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ty.value }],
  }));

  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={animStyle}>
        {DIGITS.map((d) => (
          <Text
            key={d}
            allowFontScaling={false}
            style={[textStyle, { height: lineHeight, lineHeight, textAlign: 'center', includeFontPadding: false }]}
          >
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
});

/**
 * NumberFlow-style rolling number. Consumes a *pre-formatted* string from your
 * own `format` fn (so currency/locale/compact stay exactly yours) and rolls each
 * digit on its own wheel via Reanimated (UI thread, no per-frame React renders,
 * no layout reflow). The row is measured once and uniformly scaled to fit its
 * slot — mimicking `adjustsFontSizeToFit` without re-measuring per digit.
 */
export function RollingNumber({
  value,
  format,
  style,
  emptyText = '--',
  durationMs,
  align = 'center',
}: RollingNumberProps) {
  const flat = useMemo(() => flatten(style), [style]);
  const glyphStyle = useMemo(() => pickGlyphStyle(flat), [flat]);
  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 16;
  const lineHeight =
    typeof flat.lineHeight === 'number' ? flat.lineHeight : Math.ceil(fontSize * 1.18);

  const text = value != null && Number.isFinite(value) ? format(value) : emptyText;
  const isEmpty = value == null || !Number.isFinite(value);
  const rollDuration = durationMs ?? magnitudeDuration(text);

  const [availW, setAvailW] = useState(0);
  const [naturalW, setNaturalW] = useState(0);
  // Hold the roll until the screen-open transition finishes so it doesn't
  // compete with the modal slide-in / card art on mount (the dev-FPS killer).
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setPlayed(true));
    return () => handle.cancel();
  }, []);

  const scale = availW > 0 && naturalW > availW ? availW / naturalW : 1;
  const measured = availW > 0 && naturalW > 0;
  const reveal = measured && played;

  // Keep wheel identity stable across length changes by indexing from the right.
  const chars = useMemo(() => text.split(''), [text]);

  const transformOrigin =
    align === 'left' ? 'left center' : align === 'right' ? 'right center' : 'center';

  const onHostLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - availW) > 0.5) setAvailW(w);
  };
  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - naturalW) > 0.5) setNaturalW(w);
  };

  const justify =
    align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

  if (isEmpty) {
    return (
      <View style={[styles.host, { height: lineHeight, justifyContent: justify }]}>
        <Text
          allowFontScaling={false}
          style={[glyphStyle, { height: lineHeight, lineHeight, includeFontPadding: false }]}
        >
          {emptyText}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.host, { height: lineHeight, justifyContent: justify }]} onLayout={onHostLayout}>
      <View
        style={[
          styles.row,
          { height: lineHeight, transformOrigin, transform: [{ scale }], opacity: reveal ? 1 : 0 },
        ]}
        onLayout={onRowLayout}
      >
        {chars.map((ch, i) => {
          const code = ch.charCodeAt(0);
          const isDigit = code >= 48 && code <= 57;
          if (isDigit) {
            return (
              <DigitWheel
                key={`d-${chars.length - i}`}
                digit={code - 48}
                lineHeight={lineHeight}
                durationMs={rollDuration}
                textStyle={glyphStyle}
                play={played}
              />
            );
          }
          return (
            <Text
              key={`s-${chars.length - i}`}
              allowFontScaling={false}
              style={[glyphStyle, { height: lineHeight, lineHeight, includeFontPadding: false }]}
            >
              {ch}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
  },
});
