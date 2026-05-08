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

describe('Chrome 147 LinkedIn DOM (listitem + componentkey)', (): void => {
  it('detects posts from div[role=listitem][componentkey] containers', (): void => {
    const dom: JSDOM = new JSDOM(`<!doctype html>
      <main>
        <div role="listitem" componentkey="expandedABC123FeedType_MAIN">
          <span data-testid="expandable-text-box">I shipped a rollout and reduced failures by 27%.</span>
        </div>
        <div role="listitem" componentkey="expandedDEF456FeedType_MAIN">
          <span data-testid="expandable-text-box">Hard truth: consistency beats talent.</span>
        </div>
      </main>`, { url: 'https://www.linkedin.com/feed/' });

    const adapter: LinkedInAdapter = new LinkedInAdapter(dom.window.document);
    const posts = adapter.detectPosts();

    expect(posts.length).toBe(2);
    expect(posts[0]?.text).toContain('shipped a rollout');
    expect(posts[1]?.text).toContain('consistency beats talent');
  });

  it('detects comments from div[componentkey*=replaceableComment] containers', (): void => {
    const dom: JSDOM = new JSDOM(`<!doctype html>
      <main>
        <div role="listitem" componentkey="expandedABC123FeedType_MAIN">
          <span data-testid="expandable-text-box">Main post text here.</span>
          <div componentkey="commentsSectionContainerABC123">
            <div componentkey="replaceableComment_urn:li:comment:(urn:li:activity:123,456)">
              <span data-testid="expandable-text-box">Great insights on this topic.</span>
            </div>
            <div componentkey="replaceableComment_urn:li:comment:(urn:li:activity:123,789)">
              <span data-testid="expandable-text-box">How did you measure the improvement?</span>
            </div>
          </div>
        </div>
      </main>`, { url: 'https://www.linkedin.com/feed/' });

    const adapter: LinkedInAdapter = new LinkedInAdapter(dom.window.document);
    const comments = adapter.detectComments();

    expect(comments.length).toBe(2);
    expect(comments[0]?.text).toContain('Great insights');
    expect(comments[1]?.text).toContain('measure the improvement');
  });

  it('excludes comment text from post detection via findFirstPostText', (): void => {
    const dom: JSDOM = new JSDOM(`<!doctype html>
      <main>
        <div role="listitem" componentkey="expandedABC123FeedType_MAIN">
          <span data-testid="expandable-text-box">Post text with 27% improvement.</span>
          <div componentkey="replaceableComment_urn:li:comment:(urn:li:activity:123,456)">
            <span data-testid="expandable-text-box">Comment text here.</span>
          </div>
        </div>
      </main>`, { url: 'https://www.linkedin.com/feed/' });

    const adapter: LinkedInAdapter = new LinkedInAdapter(dom.window.document);
    const posts = adapter.detectPosts();

    expect(posts.length).toBe(1);
    expect(posts[0]?.text).toContain('27% improvement');
    expect(posts[0]?.text).not.toContain('Comment text');
  });

  it('deduplicates comment containers by componentkey', (): void => {
    const dom: JSDOM = new JSDOM(`<!doctype html>
      <main>
        <div role="listitem" componentkey="expandedABC123FeedType_MAIN">
          <span data-testid="expandable-text-box">Post text.</span>
          <div componentkey="replaceableComment_urn:li:comment:(urn:li:activity:123,456)">
            <div componentkey="replaceableComment_urn:li:comment:(urn:li:activity:123,456)">
              <span data-testid="expandable-text-box">Nested duplicate comment.</span>
            </div>
          </div>
        </div>
      </main>`, { url: 'https://www.linkedin.com/feed/' });

    const adapter: LinkedInAdapter = new LinkedInAdapter(dom.window.document);
    const comments = adapter.detectComments();

    expect(comments.length).toBe(1);
  });

  it('resolves post ID from componentkey attribute', (): void => {
    const dom: JSDOM = new JSDOM(`<!doctype html>
      <main>
        <div role="listitem" componentkey="expandedUniqueKey123FeedType_MAIN">
          <span data-testid="expandable-text-box">Post content here.</span>
        </div>
      </main>`, { url: 'https://www.linkedin.com/feed/' });

    const adapter: LinkedInAdapter = new LinkedInAdapter(dom.window.document);
    const posts = adapter.detectPosts();

    expect(posts.length).toBe(1);
    expect(posts[0]?.postId).toContain('ck_');
  });

  it('resolves comment ID from componentkey URN', (): void => {
    const dom: JSDOM = new JSDOM(`<!doctype html>
      <main>
        <div role="listitem" componentkey="expandedABCFeedType_MAIN">
          <span data-testid="expandable-text-box">Post.</span>
          <div componentkey="replaceableComment_urn:li:comment:(urn:li:activity:7456684137597526017,7458224735)">
            <span data-testid="expandable-text-box">Comment content.</span>
          </div>
        </div>
      </main>`, { url: 'https://www.linkedin.com/feed/' });

    const adapter: LinkedInAdapter = new LinkedInAdapter(dom.window.document);
    const comments = adapter.detectComments();

    expect(comments.length).toBe(1);
    expect(comments[0]?.commentId).toContain('urn:li:comment');
  });

  it('still detects posts from legacy article[data-urn] selectors', (): void => {
    const dom: JSDOM = new JSDOM(`<!doctype html>
      <main>
        <article data-urn="urn:li:activity:1001">
          <div data-test-id="main-feed-activity-card__commentary">
            <p>Legacy post with 42% metric.</p>
          </div>
        </article>
      </main>`, { url: 'https://www.linkedin.com/feed/' });

    const adapter: LinkedInAdapter = new LinkedInAdapter(dom.window.document);
    const posts = adapter.detectPosts();

    expect(posts.length).toBe(1);
    expect(posts[0]?.text).toContain('42%');
  });
});
