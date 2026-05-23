import type { ExtractedItemType, ScoringLabel } from '@/shared/types';

export interface GoldenSetItem {
  readonly id: string;
  readonly itemType: ExtractedItemType;
  readonly text: string;
  readonly expectedLabel: ScoringLabel;
  readonly acceptableLabels: readonly ScoringLabel[];
}

interface GoldenCategory {
  readonly prefix: string;
  readonly itemType: ExtractedItemType;
  readonly expectedLabel: ScoringLabel;
  readonly acceptableLabels?: readonly ScoringLabel[];
  readonly samples: readonly string[];
}

const CATEGORIES: readonly GoldenCategory[] = [
  {
    prefix: 'post-ai-certain',
    itemType: 'post',
    expectedLabel: 'almost-certainly-ai',
    samples: [
      'Comment AI and I will send you the hiring dashboard template.',
      'Like if you agree and repost for reach so more founders see this.',
      'DM me the word GUIDE and I will send the full checklist.',
      'Tag someone who needs this before their next planning meeting.',
      'Follow for more daily lessons on growing your career.',
      'Drop a yes below and I will send you the worksheet.',
      'Comment interested and I will share the private playbook.',
      'Share this with your network if you want the full template.',
    ],
  },
  {
    prefix: 'post-human-specific',
    itemType: 'post',
    expectedLabel: 'feels-human',
    samples: [
      'I shipped a billing alert change in April 2026 and reduced false positives from 18% to 4%.',
      'We migrated 14 teams last quarter and cut review time by 27% after three iterations.',
      'I built a Chrome extension prototype in Q2 and removed 31 minutes from the daily workflow.',
      'I wrote the onboarding guide in 2025 and support tickets dropped by 42%.',
      'We tested three rollout paths last quarter and picked the one with 12% fewer failures.',
      'I led the incident review in March and reduced paging noise by 33%.',
      'We shipped two API changes in Q4 and kept latency under 90ms.',
      'I measured the funnel in January and found 23% of users left at setup.',
    ],
  },
  {
    prefix: 'post-human-detailed',
    itemType: 'post',
    expectedLabel: 'feels-human',
    samples: [
      'At ExampleCo I led the rollout with LinkedIn and Chrome partners. I wrote the migration guide and shared the review notes.',
      'At Example Labs I built the API review process with Platform and Security. I learned where the handoffs failed.',
      'At ExampleCo I shipped the SDK workflow with Design and Support. I documented the tradeoffs for every team.',
      'At Example Labs I led the launch with Sales and Product. I wrote the enablement notes after customer calls.',
      'At ExampleCo I rebuilt the PM workflow with Engineering and Ops. I learned why approvals stalled.',
      'At Example Labs I guided the Chrome extension rollout with Legal and Support. I wrote the fallback plan.',
      'At ExampleCo I built the API dashboard with Data and Platform. I learned which metrics changed behavior.',
      'At Example Labs I led the onboarding system with Product and Success. I wrote the durable operating notes.',
    ],
  },
  {
    prefix: 'post-ai-likely-generic',
    itemType: 'post',
    expectedLabel: 'likely-ai',
    samples: [
      "Here's what I learned about success: most people don't realize consistency beats talent.",
      'Hard truth: the secret to success is showing up when nobody is watching.',
      'Unpopular opinion: stop doing busy work and start doing meaningful work.',
      'Most people do not realize that mindset is the real advantage.',
      'Read that again: discipline creates freedom and freedom creates opportunity.',
      'Let that sink in before your next career move.',
      'The secret to success is simple, but most people ignore it.',
      'Stop doing what everyone expects and start doing what actually matters.',
    ],
  },
  {
    prefix: 'post-ai-likely-listicle',
    itemType: 'post',
    expectedLabel: 'likely-ai',
    samples: [
      'Here are lessons nobody tells you about leadership.',
      'Here are ways to build a personal brand without burning out.',
      'Here are tips for becoming the teammate everyone trusts.',
      'Here are rules for better meetings and stronger follow-through.',
      'Here are lessons for managers who want better teams.',
      'Here are ways to improve your career narrative.',
      'Here are tips for becoming more strategic at work.',
      'Here are rules for building influence without a title.',
    ],
  },
  {
    prefix: 'post-possibly-ai',
    itemType: 'post',
    expectedLabel: 'possibly-ai',
    samples: [
      'I learned a useful lesson while helping a team untangle planning, but the details are still messy.',
      'We tried a different approach to reviews and it helped, although I need more data before sharing.',
      'I changed how I think about product work after a hard conversation with the team.',
      'We found a better path through the rollout after listening closely to support.',
      'I learned that alignment is fragile when people skip the uncomfortable context.',
      'We improved the handoff by writing down assumptions before the meeting.',
      'I saw the team move faster once the goals became easier to explain.',
      'We had a better launch after slowing down and naming the risks.',
    ],
  },
  {
    prefix: 'post-cant-tell',
    itemType: 'post',
    expectedLabel: 'cant-tell',
    samples: [
      'Big week ahead.',
      'More soon.',
      'This matters.',
      'New chapter.',
      'Stay tuned.',
      'Important reminder.',
      'Keep going.',
      'Small wins.',
    ],
  },
  {
    prefix: 'comment-ai-certain',
    itemType: 'comment',
    expectedLabel: 'almost-certainly-ai',
    samples: [
      'Great insights',
      'Well said',
      'This is gold',
      'Love this',
      'So true',
      'Spot on',
      'Needed to hear this',
      'Thanks for sharing',
    ],
  },
  {
    prefix: 'comment-ai-likely',
    itemType: 'comment',
    expectedLabel: 'likely-ai',
    samples: [
      'Great insights, this really resonates with the way teams should think.',
      'Well said, this is such an important reminder for everyone in leadership.',
      'Love this perspective and thanks for sharing it with the community.',
      'This is gold because it captures what so many people miss.',
      'Spot on, this is exactly the kind of mindset shift people need.',
      'So true, this message applies to almost every career conversation.',
      'Needed to hear this, especially during a season of change.',
      'Inspiring post and a very timely reminder for all of us.',
    ],
  },
  {
    prefix: 'comment-human-question',
    itemType: 'comment',
    expectedLabel: 'feels-human',
    samples: [
      'How did you decide which tradeoffs mattered first?',
      'What changed in the review process after the first rollout?',
      'How would you adapt this for a team without dedicated ops support?',
      'What signal told you the first version was not working?',
      'How did the team respond when the timeline changed?',
      'What would you measure before repeating this approach?',
      'How did you keep the migration from blocking product work?',
      'What did you remove from the process to make it lighter?',
    ],
  },
  {
    prefix: 'comment-human-specific',
    itemType: 'comment',
    expectedLabel: 'feels-human',
    samples: [
      'We saw a 19% drop after changing the onboarding checklist.',
      'At ExampleCo, this worked best when Platform owned the rollout notes.',
      'Our team needed 3 cycles before the new review habit stuck.',
      'Chrome extension teams hit a similar issue with permission prompts.',
      'The API review improved after we added 2 explicit rollback checks.',
      'LinkedIn posts with examples tend to drive better internal discussion.',
      'We had 11 support tickets tied to the old handoff.',
      'Example Labs solved this by pairing Product and Support for one sprint.',
    ],
  },
  {
    prefix: 'comment-human-thoughtful',
    itemType: 'comment',
    expectedLabel: 'feels-human',
    samples: [
      'The useful part here is the sequencing. Teams often jump to process before they agree on what pain they are solving, and that makes every later decision feel heavier than it needs to be.',
      'I appreciate the focus on writing things down before the meeting. It gives quieter people a better way to contribute and keeps the conversation from rewarding only the fastest speaker.',
      'This framing is helpful because it separates the workflow problem from the trust problem. Those often look similar in the moment, but they need different fixes.',
      'The part that resonates is making the fallback explicit. A plan gets much easier to support when people know what happens if the first path fails.',
      'There is a subtle lesson here about reducing coordination cost. The best process change is usually the one that makes the next decision easier.',
      'I like that this does not treat alignment as a one-time meeting. It is more durable when the context stays visible after people leave the room.',
      'The practical takeaway for me is to make assumptions reviewable. That gives the team a way to challenge the plan without turning it into a personal debate.',
      'This is a strong reminder that rollout quality depends on recovery paths as much as launch paths. That is easy to forget when the first milestone is urgent.',
    ],
  },
  {
    prefix: 'comment-cant-tell',
    itemType: 'comment',
    expectedLabel: 'cant-tell',
    samples: [
      'Interesting angle.',
      'Useful framing.',
      'Makes sense.',
      'Worth considering.',
      'Good reminder.',
      'Fair point.',
      'I can see that.',
      'Helpful thought.',
    ],
  },
];

export const GOLDEN_SET: readonly GoldenSetItem[] = CATEGORIES.flatMap(
  (category: GoldenCategory): readonly GoldenSetItem[] => {
    return category.samples.map((sample: string, index: number): GoldenSetItem => ({
      id: `${category.prefix}-${index + 1}`,
      itemType: category.itemType,
      text: sample,
      expectedLabel: category.expectedLabel,
      acceptableLabels: category.acceptableLabels ?? [category.expectedLabel],
    }));
  },
);
