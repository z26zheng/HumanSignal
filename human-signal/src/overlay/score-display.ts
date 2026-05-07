import type { ScoringLabel } from '@/shared/types';

export type StickerColor = 'green' | 'yellow' | 'orange' | 'red' | 'gray';

export function getLabelText(label: ScoringLabel): string {
  const labels: Record<ScoringLabel, string> = {
    'high-signal': 'High Signal',
    specific: 'Specific',
    thoughtful: 'Thoughtful',
    question: 'Question',
    mixed: 'Mixed',
    generic: 'Generic',
    'low-effort': 'Low Effort',
    'low-signal': 'Low Signal',
    'engagement-bait': 'Engagement Bait',
    repeated: 'Repeated',
    unclear: 'Unclear',
    unavailable: 'Unavailable',
  };

  return labels[label];
}

export function getStickerColor(label: ScoringLabel): StickerColor {
  switch (label) {
    case 'high-signal':
    case 'specific':
    case 'thoughtful':
    case 'question':
      return 'green';
    case 'mixed':
      return 'yellow';
    case 'generic':
    case 'low-effort':
    case 'low-signal':
    case 'repeated':
      return 'orange';
    case 'engagement-bait':
      return 'red';
    case 'unclear':
    case 'unavailable':
      return 'gray';
  }
}
