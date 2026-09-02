// HIP-4 Sports — bright, gamified light theme
export const colors = {
  background: {
    primary: '#F5F7F6',
    secondary: '#EEF2F0',
    tertiary: '#E6EBE8',
    card: '#FFFFFF',
    elevated: '#FFFFFF',
    skeleton: '#E2E8E4',
  },

  border: {
    primary: '#E4EAE6',
    secondary: '#D5DDD8',
    accent: '#B7C4BC',
  },

  text: {
    primary: '#0F172A',
    secondary: '#5B6770',
    tertiary: '#8A9590',
    muted: '#A8B2AD',
  },

  accent: {
    gold: '#22C55E',
    goldLight: '#4ADE80',
    goldDark: '#16A34A',
    purple: '#A78BFA',
    purpleLight: '#C4B5FD',
    blue: '#38BDF8',
    blueLight: '#7DD3FC',
  },

  status: {
    success: '#22C55E',
    successLight: '#4ADE80',
    successDark: '#15803D',
    error: '#F43F5E',
    errorLight: '#FB7185',
    errorDark: '#E11D48',
    warning: '#F59E0B',
    warningLight: '#FBBF24',
    info: '#0EA5E9',
  },

  chart: {
    green: '#22C55E',
    red: '#F43F5E',
    volume: '#38BDF8',
    grid: '#E4EAE6',
    crosshair: '#8A9590',
  },

  glass: {
    background: 'rgba(255, 255, 255, 0.86)',
    border: 'rgba(15, 23, 42, 0.08)',
    highlight: 'rgba(255, 255, 255, 0.55)',
  },

  leverage: {
    high: '#A855F7',
    medium: '#22C55E',
    low: '#FACC15',
    default: '#8A9590',
  },
};

export const getLeverageColor = (leverage: number): string => {
  if (leverage >= 20) return colors.leverage.high;
  if (leverage >= 10) return colors.leverage.medium;
  if (leverage >= 3) return colors.leverage.low;
  return colors.leverage.default;
};

export const getPriceChangeColor = (change: number | null): string => {
  if (change === null) return colors.text.tertiary;
  if (change > 0) return colors.status.success;
  if (change < 0) return colors.status.error;
  return colors.text.tertiary;
};
