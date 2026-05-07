import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkedInAdapter } from '@/linkedin-adapter';

interface FixtureCase {
  readonly fileName: string;
  readonly url: string;
  readonly expectedPageType: string;
  readonly expectedPosts: number;
  readonly expectedComments: number;
}

const FIXTURES: readonly FixtureCase[] = [
  {
    fileName: 'feed.html',
    url: 'https://www.linkedin.com/feed/',
    expectedPageType: 'feed',
    expectedPosts: 2,
    expectedComments: 1,
  },
  {
    fileName: 'post-detail.html',
    url: 'https://www.linkedin.com/feed/update/urn:li:activity:2001/',
    expectedPageType: 'postDetail',
    expectedPosts: 1,
    expectedComments: 1,
  },
  {
    fileName: 'profile-activity.html',
    url: 'https://www.linkedin.com/in/example/recent-activity/all/',
    expectedPageType: 'profileActivity',
    expectedPosts: 1,
    expectedComments: 0,
  },
  {
    fileName: 'variant.html',
    url: 'https://www.linkedin.com/feed/',
    expectedPageType: 'feed',
    expectedPosts: 1,
    expectedComments: 1,
  },
  {
    fileName: 'unsupported.html',
    url: 'https://www.linkedin.com/jobs/',
    expectedPageType: 'unsupported',
    expectedPosts: 0,
    expectedComments: 0,
  },
];

describe('LinkedInAdapter', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it.each(FIXTURES)('detects posts and comments in $fileName', (fixture: FixtureCase): void => {
    vi.spyOn(console, 'info').mockImplementation((): void => {});

    const adapter: LinkedInAdapter = createAdapter(fixture);

    expect(adapter.getPageType()).toBe(fixture.expectedPageType);
    expect(adapter.detectPosts()).toHaveLength(fixture.expectedPosts);
    expect(adapter.detectComments()).toHaveLength(fixture.expectedComments);
  });

  it('extracts visible text without see more control text', (): void => {
    vi.spyOn(console, 'info').mockImplementation((): void => {});

    const adapter: LinkedInAdapter = createAdapter(FIXTURES[0] as FixtureCase);
    const secondPost = adapter.detectPosts()[1];

    expect(secondPost?.text).toBe('Comment AI and I will send you the template.');
    expect(secondPost?.isTruncated).toBe(true);
  });

  it('uses the stable post id priority chain', (): void => {
    vi.spyOn(console, 'info').mockImplementation((): void => {});

    const feedAdapter: LinkedInAdapter = createAdapter(FIXTURES[0] as FixtureCase);
    const detailAdapter: LinkedInAdapter = createAdapter(FIXTURES[1] as FixtureCase);
    const variantAdapter: LinkedInAdapter = createAdapter(FIXTURES[3] as FixtureCase);

    expect(feedAdapter.detectPosts()[0]?.postIdMethod).toBe('urn');
    expect(detailAdapter.detectPosts()[0]?.postIdMethod).toBe('permalink');
    expect(variantAdapter.detectPosts()[0]?.postIdMethod).toBe('contentHash');
  });

  it('detects element recycling by comparing normalized text', (): void => {
    vi.spyOn(console, 'info').mockImplementation((): void => {});

    const adapter: LinkedInAdapter = createAdapter(FIXTURES[0] as FixtureCase);
    const post = adapter.detectPosts()[0];

    expect(post).toBeDefined();

    if (post === undefined) {
      return;
    }

    expect(adapter.hasElementContentChanged(post.textElement, post.text)).toBe(false);
    post.textElement.textContent = 'This is a different recycled post.';
    expect(adapter.hasElementContentChanged(post.textElement, post.text)).toBe(true);
  });

  it('reports unhealthy only after three empty post detections', (): void => {
    vi.spyOn(console, 'info').mockImplementation((): void => {});

    const adapter: LinkedInAdapter = createAdapter(FIXTURES[4] as FixtureCase);

    adapter.detectPosts();
    adapter.detectPosts();
    expect(adapter.isAdapterHealthy()).toBe(true);

    adapter.detectPosts();
    expect(adapter.isAdapterHealthy()).toBe(false);
  });
});

function createAdapter(fixture: FixtureCase): LinkedInAdapter {
  const html: string = readFileSync(
    fileURLToPath(new URL(`./__fixtures__/${fixture.fileName}`, import.meta.url)),
    'utf8',
  );
  const dom: JSDOM = new JSDOM(html, {
    url: fixture.url,
  });

  return new LinkedInAdapter(dom.window.document);
}
