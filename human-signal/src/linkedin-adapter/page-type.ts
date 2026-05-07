import type { LinkedInPageType } from '@/linkedin-adapter/types';

export function getPageType(url: string = globalThis.location?.href ?? ''): LinkedInPageType {
  const parsedUrl: URL | null = parseUrl(url);

  if (parsedUrl === null || !parsedUrl.hostname.endsWith('linkedin.com')) {
    return 'unsupported';
  }

  const path: string = parsedUrl.pathname;

  if (path === '/feed/' || path === '/feed') {
    return 'feed';
  }

  if (path.startsWith('/feed/update/') || path.startsWith('/posts/')) {
    return 'postDetail';
  }

  if (path.includes('/recent-activity/')) {
    return 'profileActivity';
  }

  return 'unsupported';
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
