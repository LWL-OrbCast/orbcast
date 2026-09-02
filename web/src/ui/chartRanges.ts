import type { OutcomeCandleInterval } from '@hip4';

export const WEB_CHART_RANGES: {
  id: '1h' | '6h' | '1d' | '1w' | '1mo' | 'all';
  label: string;
  interval: OutcomeCandleInterval;
  spanMs: number;
}[] = [
  { id: '1h', label: '1H', interval: '1m', spanMs: 60 * 60_000 },
  { id: '6h', label: '6H', interval: '5m', spanMs: 6 * 60 * 60_000 },
  { id: '1d', label: '1D', interval: '15m', spanMs: 24 * 60 * 60_000 },
  { id: '1w', label: '1W', interval: '1h', spanMs: 7 * 24 * 60 * 60_000 },
  { id: '1mo', label: '1M', interval: '4h', spanMs: 30 * 24 * 60 * 60_000 },
  { id: 'all', label: 'ALL', interval: '1d', spanMs: 400 * 24 * 60 * 60_000 },
];

export type WebChartRangeId = (typeof WEB_CHART_RANGES)[number]['id'];
