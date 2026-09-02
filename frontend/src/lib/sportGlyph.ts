import { Ionicons } from '@expo/vector-icons';
import type { ListedMarket } from './hip4';
import { catalogChipForMarket } from './marketCatalog';

export function sportGlyph(market: ListedMarket): keyof typeof Ionicons.glyphMap {
  switch (catalogChipForMarket(market)) {
    case 'nba':
      return 'basketball';
    case 'tennis':
      return 'tennisball';
    case 'mlb':
      return 'baseball';
    case 'mma':
      return 'fitness';
    case 'esports':
      return 'game-controller';
    case 'crypto':
      return 'logo-bitcoin';
    case 'stocks':
      return 'briefcase';
    case 'economics':
      return 'stats-chart';
    case 'football':
      return 'football';
    default:
      return 'trending-up';
  }
}
