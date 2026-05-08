import { LinkedInAdapter } from '@/linkedin-adapter';
import { ExplanationPopover } from '@/overlay/explanation-popover';
import { ItemRegistry, type RegistryEntry } from '@/overlay/item-registry';
import { OverlayRoot } from '@/overlay/overlay-root';
import { PositionSync } from '@/overlay/position-sync';
import { getLabelText, getStickerColor } from '@/overlay/score-display';
import { SignalSticker } from '@/overlay/signal-sticker';
import { createContentHash } from '@/shared/hash';
import { sendToBackground } from '@/shared/messaging';
import { logger } from '@/shared/logger';
import { getUserSettings } from '@/shared/storage';

import type { DetectedComment, DetectedPost } from '@/linkedin-adapter';
import type {
  ContentHash,
  ExtractedItem,
  IdStability,
  ItemId,
  ScoringResult,
  UserSettings,
} from '@/shared/types';

export class OverlayController {
  private readonly adapter: LinkedInAdapter = new LinkedInAdapter(document);
  private readonly overlayRoot: OverlayRoot = new OverlayRoot();
  private readonly positionSync: PositionSync = new PositionSync();
  private readonly registry: ItemRegistry = new ItemRegistry(50, (itemId: string): void => {
    this.positionSync.removeItem(itemId);
  });
  private popover: ExplanationPopover | null = null;
  private mutationObserver: MutationObserver | null = null;
  private discoveryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private settings: UserSettings | null = null;

  public async start(): Promise<void> {
    this.settings = await getUserSettings();
    logger.info('overlay.start', 'Overlay starting with settings', {
      visibility: this.settings.stickerVisibility,
      isEnabled: this.settings.isEnabled,
    });
    const root: HTMLDivElement = this.overlayRoot.create();
    this.popover = new ExplanationPopover(root);
    this.positionSync.startLoop();
    await this.discoverAndScore();
    this.observeMutations();
  }

  public stop(): void {
    this.mutationObserver?.disconnect();
    this.positionSync.stopLoop();
    this.popover?.destroy();
    this.popover = null;
    this.registry.clear();
    this.overlayRoot.destroy();
  }

  public async applySettings(settings: Partial<UserSettings>): Promise<void> {
    this.settings = {
      ...(this.settings ?? (await getUserSettings())),
      ...settings,
    };

    for (const entry of this.registry.getAll()) {
      if (this.shouldShowType(entry.itemType)) {
        entry.sticker.show();
      } else {
        entry.sticker.hide();
      }
    }
  }

  public handleScoreResults(results: readonly ScoringResult[]): void {
    for (const result of results) {
      const entry: RegistryEntry | null = this.registry.get(result.itemId);

      if (entry === null) {
        continue;
      }

      this.registry.updateScore(result.itemId, result);
      entry.sticker.update({
        label: getLabelText(result.label),
        color: getStickerColor(result.label),
        state: result.label === 'unavailable' ? 'unavailable' : 'labeled',
      });

      if (this.popover?.isOpen()) {
        this.popover.updateScore(result);
      }
    }
  }

  public handleScoreFailure(itemIds: readonly string[], reason: string): void {
    for (const itemId of itemIds) {
      const entry: RegistryEntry | null = this.registry.get(itemId);

      if (entry === null) {
        continue;
      }

      entry.state = 'failed';
      entry.sticker.update({
        label: 'Unavailable',
        color: 'gray',
        state: 'unavailable',
      });
    }

    logger.warn('overlay.scoring', 'Score request failed; stickers marked unavailable', {
      itemCount: itemIds.length,
      reason,
    });
  }

  public getTrackedItemCount(): number {
    return this.registry.getAll().length;
  }

  public async resendPendingScores(reason: string): Promise<void> {
    const pendingItems: readonly ExtractedItem[] = this.registry
      .getAll()
      .filter((entry: RegistryEntry): boolean => entry.state === 'loading' || entry.state === 'failed')
      .map((entry: RegistryEntry): ExtractedItem => entry.item);

    if (pendingItems.length === 0) {
      return;
    }

    logger.info('overlay.reconnect', 'Resending pending score requests', {
      reason,
      itemCount: pendingItems.length,
    });
    await this.scoreItems(pendingItems);
  }

  public async rediscoverForTest(): Promise<void> {
    this.removeDetachedEntries();
    await this.discoverAndScore();
  }

  private async discoverAndScore(): Promise<void> {
    if (this.settings?.isEnabled === false || this.settings?.stickerVisibility === 'off') {
      return;
    }

    const detectedPosts: readonly DetectedPost[] = this.adapter.detectPosts();
    const detectedComments: readonly DetectedComment[] = this.adapter.detectComments();

    logger.info('overlay.discover', 'Discovery scan completed', {
      detectedPosts: detectedPosts.length,
      detectedComments: detectedComments.length,
      registrySize: this.registry.getAll().length,
      visibility: this.settings?.stickerVisibility ?? 'null',
    });

    const items: readonly ExtractedItem[] = [
      ...detectedPosts.map((post: DetectedPost): ExtractedItem | null => this.addPost(post)),
      ...detectedComments.map(
        (comment: DetectedComment): ExtractedItem | null => this.addComment(comment),
      ),
    ].filter((item: ExtractedItem | null): item is ExtractedItem => item !== null);

    if (items.length === 0) {
      return;
    }

    await this.scoreItems(items);
  }

  private async scoreItems(items: readonly ExtractedItem[]): Promise<void> {
    const response = await sendToBackground({
      type: 'SCORE_BATCH',
      source: 'content-script',
      items,
    });

    if (response.ok && response.payload.type === 'SCORE_RESULT') {
      this.handleScoreResults(response.payload.results);
      logger.info('overlay.scoring', 'Score batch completed', {
        requested: items.length,
        immediate: response.payload.results.length,
        queued: response.payload.queued.length,
      });
      return;
    }

    this.handleScoreFailure(
      items.map((item: ExtractedItem): string => item.itemId),
      response.ok ? 'unexpected-response' : response.error.code,
    );
  }

  private addPost(post: DetectedPost): ExtractedItem | null {
    const item: ExtractedItem = {
      itemId: post.postId as ItemId,
      itemType: 'post',
      text: post.text,
      metadata: {
        contentHash: createContentHash(post.text),
        sourceUrl: window.location.href,
        detectedAt: Date.now(),
        idStability: mapIdStability(post.postIdMethod),
      },
      isTruncated: post.isTruncated,
    };

    return this.addRegistryEntry(item, post.element) ? item : null;
  }

  private addComment(comment: DetectedComment): ExtractedItem | null {
    const item: ExtractedItem = {
      itemId: comment.commentId as ItemId,
      itemType: 'comment',
      text: comment.text,
      metadata: {
        contentHash: createContentHash(comment.text),
        sourceUrl: window.location.href,
        detectedAt: Date.now(),
        idStability: 'content-hash',
      },
      isTruncated: false,
    };

    return this.addRegistryEntry(item, comment.element) ? item : null;
  }

  private addRegistryEntry(item: ExtractedItem, element: HTMLElement): boolean {
    const alreadyExists: boolean = this.registry.get(item.itemId) !== null;
    const shouldShow: boolean = this.shouldShowType(item.itemType);

    if (alreadyExists || !shouldShow) {
      logger.info('overlay.addEntry.skip', 'Skipping registry entry', {
        itemType: item.itemType,
        itemId: item.itemId.slice(0, 40),
        alreadyExists,
        shouldShow,
        visibility: this.settings?.stickerVisibility ?? 'null',
      });
      return false;
    }

    const sticker: SignalSticker = new SignalSticker({
      label: 'Scoring...',
      color: 'gray',
      state: 'loading',
      itemId: item.itemId,
      onClick: (): void => this.openPopover(item.itemId),
    });
    this.overlayRoot.getRoot().append(sticker.getElement());
    this.registry.add({
      itemId: item.itemId,
      itemType: item.itemType,
      element,
      item,
      sticker,
      createdAt: Date.now(),
      state: 'loading',
      score: null,
      inViewport: true,
    });
    this.positionSync.addItem(item.itemId, item.itemType, element, sticker);
    return true;
  }

  private openPopover(itemId: string): void {
    const entry: RegistryEntry | null = this.registry.get(itemId);

    if (entry === null || entry.score === null || this.popover === null) {
      return;
    }

    this.popover.open(entry.sticker, entry.score);
  }

  private observeMutations(): void {
    const config = this.adapter.getObserverConfig();
    const target: Element = document.querySelector(config.feedContainerSelector) ?? document.body;
    this.mutationObserver = new MutationObserver((): void => this.scheduleDiscovery());
    this.mutationObserver.observe(target, config.observerOptions);
  }

  private scheduleDiscovery(): void {
    if (this.discoveryTimeoutId !== null) {
      clearTimeout(this.discoveryTimeoutId);
    }

    this.discoveryTimeoutId = setTimeout((): void => {
      this.removeDetachedEntries();
      void this.discoverAndScore().catch((error: unknown): void => {
        logger.error('overlay.discovery', error);
      });
    }, 150);
  }

  private removeDetachedEntries(): void {
    for (const entry of this.registry.getAll()) {
      if (document.body.contains(entry.element)) {
        continue;
      }

      this.positionSync.removeItem(entry.itemId);
      this.registry.remove(entry.itemId);
      this.popover?.close();
    }
  }

  private shouldShowType(itemType: ExtractedItem['itemType']): boolean {
    const visibility = this.settings?.stickerVisibility ?? 'all';
    return visibility === 'all' || visibility === `${itemType}s`;
  }
}

function mapIdStability(method: DetectedPost['postIdMethod']): IdStability {
  switch (method) {
    case 'urn':
      return 'stable';
    case 'permalink':
      return 'permalink';
    case 'contentHash':
      return 'content-hash';
  }
}

async function cleanupStaleE2ETestData(): Promise<void> {
  try {
    await browser.storage.local.remove([
      'e2eGeminiMock',
      'e2eFailNextScoreBatch',
      'diagnosticDump',
      'debugCommentDetection',
      'geminiIntegrationTest',
    ]);
  } catch {
    // Non-critical; continue normally
  }
}
