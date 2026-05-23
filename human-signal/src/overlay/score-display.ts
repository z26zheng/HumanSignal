import type { ScoringLabel } from '@/shared/types';

export type StickerColor = 'green' | 'yellow' | 'orange' | 'red' | 'gray';

export function getLabelText(label: ScoringLabel): string {
  const labels: Record<ScoringLabel, string> = {
    'feels-human': 'Feels Human',
    'possibly-ai': 'Possibly AI',
    'likely-ai': 'Likely AI',
    'almost-certainly-ai': 'Almost Certainly AI',
    'cant-tell': "Can't Tell",
    unavailable: 'Unavailable',
  };

  return labels[label];
}

export function getStickerColor(label: ScoringLabel): StickerColor {
  switch (label) {
    case 'feels-human':
      return 'green';
    case 'possibly-ai':
      return 'yellow';
    case 'likely-ai':
      return 'orange';
    case 'almost-certainly-ai':
      return 'red';
    case 'cant-tell':
    case 'unavailable':
      return 'gray';
  }
}
