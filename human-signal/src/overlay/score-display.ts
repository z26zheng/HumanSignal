import type { ScoringLabel } from '@/shared/types';

export type StickerColor = 'green' | 'yellow-green' | 'light-green' | 'yellow' | 'orange' | 'red' | 'gray';

export function getLabelText(label: ScoringLabel): string {
  const labels: Record<ScoringLabel, string> = {
    'feels-human': 'Feels Human',
    'probably-human': 'Probably Human',
    'possibly-human': 'Possibly Human',
    'possibly-ai': 'Possibly AI',
    'probably-ai': 'Probably AI',
    'almost-certainly-ai': 'Almost Certainly AI',
    unavailable: 'Unavailable',
  };

  return labels[label];
}

export function getStickerColor(label: ScoringLabel): StickerColor {
  switch (label) {
    case 'feels-human':
      return 'green';
    case 'probably-human':
      return 'yellow-green';
    case 'possibly-human':
      return 'light-green';
    case 'possibly-ai':
      return 'yellow';
    case 'probably-ai':
      return 'orange';
    case 'almost-certainly-ai':
      return 'red';
    case 'unavailable':
      return 'gray';
  }
}
