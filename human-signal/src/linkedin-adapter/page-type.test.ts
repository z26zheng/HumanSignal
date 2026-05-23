import { describe, expect, it } from 'vitest';

import { getPageType } from '@/linkedin-adapter/page-type';

describe('getPageType', (): void => {
  describe('non-LinkedIn URLs', (): void => {
    it('returns "unsupported" for non-LinkedIn URLs', (): void => {
      expect(getPageType('https://example.com/feed/')).toBe('unsupported');
      expect(getPageType('https://google.com')).toBe('unsupported');
    });

    it('returns "unsupported" for invalid URLs', (): void => {
      expect(getPageType('not-a-url')).toBe('unsupported');
      expect(getPageType('')).toBe('unsupported');
    });
  });

  describe('LinkedIn feed', (): void => {
    it('matches /feed/', (): void => {
      expect(getPageType('https://www.linkedin.com/feed/')).toBe('feed');
    });

    it('matches /feed (no trailing slash)', (): void => {
      expect(getPageType('https://www.linkedin.com/feed')).toBe('feed');
    });

    it('does not match /feed/likes/', (): void => {
      expect(getPageType('https://www.linkedin.com/feed/likes/')).toBe('unsupported');
    });
  });

  describe('post detail', (): void => {
    it('matches /feed/update/...', (): void => {
      expect(getPageType('https://www.linkedin.com/feed/update/urn:li:activity:1234')).toBe('postDetail');
    });

    it('matches /posts/...', (): void => {
      expect(getPageType('https://www.linkedin.com/posts/some-author_some-slug-activity-12345')).toBe('postDetail');
    });
  });

  describe('profile activity', (): void => {
    it('matches /in/name/recent-activity/all/', (): void => {
      expect(getPageType('https://www.linkedin.com/in/some-person/recent-activity/all/')).toBe('profileActivity');
    });

    it('matches /in/name/recent-activity/posts/', (): void => {
      expect(getPageType('https://www.linkedin.com/in/some-person/recent-activity/posts/')).toBe('profileActivity');
    });
  });

  describe('other LinkedIn pages', (): void => {
    it('returns "unsupported" for /in/<name>', (): void => {
      expect(getPageType('https://www.linkedin.com/in/some-person/')).toBe('unsupported');
    });

    it('returns "unsupported" for /company/...', (): void => {
      expect(getPageType('https://www.linkedin.com/company/some-company/')).toBe('unsupported');
    });

    it('returns "unsupported" for /messaging', (): void => {
      expect(getPageType('https://www.linkedin.com/messaging/')).toBe('unsupported');
    });

    it('returns "unsupported" for /jobs/...', (): void => {
      expect(getPageType('https://www.linkedin.com/jobs/view/12345/')).toBe('unsupported');
    });
  });

  describe('subdomain handling', (): void => {
    it('accepts www.linkedin.com', (): void => {
      expect(getPageType('https://www.linkedin.com/feed/')).toBe('feed');
    });

    it('accepts linkedin.com without subdomain', (): void => {
      expect(getPageType('https://linkedin.com/feed/')).toBe('feed');
    });

    it('accepts mobile and country subdomains (anything.linkedin.com)', (): void => {
      expect(getPageType('https://m.linkedin.com/feed/')).toBe('feed');
      expect(getPageType('https://uk.linkedin.com/feed/')).toBe('feed');
    });
  });
});
