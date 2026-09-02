import React, { useEffect, useRef, useState } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

type TweenedStatTextProps = {
  /** Numeric value to display; `null` shows `--` with no animation. */
  value: number | null;
  format: (n: number) => string;
  style?: TextStyle | TextStyle[];
  /** When this changes (e.g. period tab), tween from the last shown value. */
  animationKey?: string | number;
  durationMs?: number;
  /** Shown when `value` is null or non-finite (default `--`). */
  emptyText?: string;
  /** Roll the very first finite value up from 0 instead of snapping (count-up on mount). */
  animateOnMount?: boolean;
  /** Duration of the mount count-up roll (only used with `animateOnMount`). */
  mountDurationMs?: number;
} & Pick<TextProps, 'numberOfLines' | 'adjustsFontSizeToFit' | 'minimumFontScale'>;

const DEFAULT_DURATION_MS = 420;
/** Longer, more deliberate glide for the from-zero mount roll. */
const DEFAULT_MOUNT_DURATION_MS = 1150;

/** Cubic ease-out — matches Reanimated Easing.out(Easing.cubic). Used for value changes. */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Quintic ease-out — gentler, longer-tailed settle that reads smoother on a big from-zero roll. */
function easeOutQuint(t: number): number {
  return 1 - (1 - t) ** 5;
}

/**
 * Smooth count-up / count-down when `value` changes (e.g. switching 24h / 7d perf).
 * Driven on the JS frame loop so the last frame snaps to the exact target (no bridge lag).
 */
export function TweenedStatText({
  value,
  format,
  style,
  animationKey,
  durationMs = DEFAULT_DURATION_MS,
  emptyText = '--',
  animateOnMount = false,
  mountDurationMs = DEFAULT_MOUNT_DURATION_MS,
  ...textProps
}: TweenedStatTextProps) {
  const [text, setText] = useState(() => {
    if (value != null && Number.isFinite(value)) {
      return animateOnMount ? format(0) : format(value);
    }
    return emptyText;
  });
  const skipNextTween = useRef(!animateOnMount);
  /** The first real tween (the from-zero mount roll) gets the slower, gentler curve. */
  const pendingMountRoll = useRef(animateOnMount);
  const settledValue = useRef(0);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    let rafId: number | null = null;

    const cancel = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    if (value == null || !Number.isFinite(value)) {
      cancel();
      setText(emptyText);
      return cancel;
    }

    const target = value;

    if (skipNextTween.current) {
      skipNextTween.current = false;
      settledValue.current = target;
      setText(formatRef.current(target));
      return cancel;
    }

    const from = settledValue.current;
    const isMountRoll = pendingMountRoll.current;
    pendingMountRoll.current = false;
    const ease = isMountRoll ? easeOutQuint : easeOutCubic;
    const tweenDuration = isMountRoll ? mountDurationMs : durationMs;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / tweenDuration);
      if (progress >= 1) {
        settledValue.current = target;
        setText(formatRef.current(target));
        rafId = null;
        return;
      }
      const current = from + (target - from) * ease(progress);
      setText(formatRef.current(current));
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return cancel;
  }, [value, animationKey, durationMs, mountDurationMs, emptyText]);

  return (
    <Text style={style} {...textProps}>
      {text}
    </Text>
  );
}
