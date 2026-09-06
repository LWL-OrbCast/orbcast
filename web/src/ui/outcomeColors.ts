export const YES_COLOR = '#22C55E';
export const NO_COLOR = '#A78BFA';
/** Winner-book leftover — not a primary named option. */
export const OTHER_COLOR = '#6B7280';

export const LEG_PALETTE = ['#22C55E', '#38BDF8', '#A78BFA', '#F59E0B', '#F43F5E', '#14B8A6'] as const;

/** Stamps inside a catalog card — 3-way stays a row; everything else is two-up. */
export function multiLegStampGridClass(count: number): string {
  return count === 3 ? 'grid-cols-3' : 'grid-cols-2';
}

export function multiLegStampColor(isOther: boolean, index: number): string {
  return isOther ? OTHER_COLOR : LEG_PALETTE[index % LEG_PALETTE.length];
}

/** Soft wash + ink text for catalog list chips (hero stamps stay solid). */
export function catalogLegChipStyle(isOther: boolean, index: number): {
  background: string;
  borderColor: string;
  color: string;
} {
  const hex = isOther ? OTHER_COLOR : LEG_PALETTE[index % LEG_PALETTE.length];
  return {
    background: `color-mix(in srgb, ${hex} 14%, #fff)`,
    borderColor: `color-mix(in srgb, ${hex} 30%, #fff)`,
    color: isOther ? '#4B5563' : hex,
  };
}
