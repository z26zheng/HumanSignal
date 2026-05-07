export type LinkedInPageType = 'feed' | 'postDetail' | 'profileActivity' | 'unsupported';

export type PostIdMethod = 'urn' | 'permalink' | 'contentHash';

export interface DetectedPost {
  readonly element: HTMLElement;
  readonly textElement: HTMLElement;
  readonly text: string;
  readonly postId: string;
  readonly postIdMethod: PostIdMethod;
  readonly isTruncated: boolean;
}

export interface DetectedComment {
  readonly element: HTMLElement;
  readonly textElement: HTMLElement;
  readonly text: string;
  readonly commentId: string;
  readonly parentPostId: string;
}

export interface AdapterObserverConfig {
  readonly feedContainerSelector: string;
  readonly observerOptions: MutationObserverInit;
}

export interface SelectorStrategy {
  readonly name: string;
  readonly selectors: readonly string[];
}
