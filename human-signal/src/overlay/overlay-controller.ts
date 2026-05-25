import { LinkedInAdapter } from '@/linkedin-adapter';
import { DebugPill } from '@/overlay/debug-pill';
import { DebugPopover } from '@/overlay/debug-popover';
import { ExplanationPopover } from '@/overlay/explanation-popover';
import { ItemRegistry, type RegistryEntry } from '@/overlay/item-registry';
import { OverlayRoot } from '@/overlay/overlay-root';
import { PositionSync } from '@/overlay/position-sync';
import { getLabelText, getStickerColor } from '@/overlay/score-display';
import { SignalSticker } from '@/overlay/signal-sticker';
import { StickerContextMenu } from '@/overlay/sticker-context-menu';
import { applyTraceEvents } from '@/overlay/trace-event-emitter';
import { EventTraceStore, type TraceEventType } from '@/shared/event-trace';
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
  private readonly traceStore: EventTraceStore = new EventTraceStore();
  private readonly debugPills: Map<string, DebugPill> = new Map();
  private popover: ExplanationPopover | null = null;
  private debugPopover: DebugPopover | null = null;
  private contextMenu: StickerContextMenu | null = null;
  private mutationObserver: MutationObserver | null = null;
  private discoveryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private settings: UserSettings | null = null;
  private geminiAvailable: boolean = false;

  public async start(): Promise<void> {
    this.settings = await getUserSettings();
    logger.info('overlay.start', 'Overlay starting with settings', {
      visibility: this.settings.stickerVisibility,
      isEnabled: this.settings.isEnabled,
    });
    const root: HTMLDivElement = this.overlayRoot.create();
    this.popover = new ExplanationPopover(root);
    this.debugPopover = new DebugPopover(root);
    this.contextMenu = new StickerContextMenu(root);
    this.positionSync.setOnPosition((itemId: string, x: number, y: number, stickerWidth: number, isVisible: boolean): void => {
      const pill: DebugPill | undefined = this.debugPills.get(itemId);
      if (pill === undefined) return;

      if (!isVisible) {
        pill.hide();
        return;
      }

      const entry: RegistryEntry | null = this.registry.get(itemId);
      const stickerHidden: boolean = entry !== null && entry.sticker.isMinimized();
      const effectiveWidth: number = stickerHidden ? 12 : Math.max(stickerWidth, 20);

      pill.setPosition(x, y, effectiveWidth);
      pill.show();
    });
    this.positionSync.startLoop();
    await this.discoverAndScore();
    this.observeMutations();

    this.syncDevModePills();
  }

  public stop(): void {
    if (this.discoveryTimeoutId !== null) {
      clearTimeout(this.discoveryTimeoutId);
      this.discoveryTimeoutId = null;
    }
    this.mutationObserver?.disconnect();
    this.positionSync.stopLoop();
    this.popover?.destroy();
    this.popover = null;
    this.debugPopover?.destroy();
    this.debugPopover = null;
    this.contextMenu?.destroy();
    this.contextMenu = null;
    for (const pill of this.debugPills.values()) {
      pill.destroy();
    }
    this.debugPills.clear();
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

    this.syncDevModePills();
  }

  private syncDevModePills(): void {
    const devMode: boolean = this.settings?.isDeveloperMode === true;

    if (devMode) {
      for (const entry of this.registry.getAll()) {
        if (!this.debugPills.has(entry.itemId)) {
          this.createDebugPill(entry.itemId, entry.sticker);
          this.updateDebugPill(entry.itemId);
        }
      }
    } else {
      for (const pill of this.debugPills.values()) {
        pill.destroy();
      }
      this.debugPills.clear();
      this.debugPopover?.close();
    }
  }

  public handleScoreResults(results: readonly ScoringResult[]): void {
    for (const result of results) {
      const entry: RegistryEntry | null = this.registry.get(result.itemId);
      if (entry === null) {
        continue;
      }

      if (result.source === 'gemini' && !this.geminiAvailable) {
        this.geminiAvailable = true;
        this.popover?.setGeminiAvailable(true);
      }

      const isAiUpgrade: boolean = entry.score !== null &&
        (result.source === 'gemini' || result.source === 'combined');
      const previousLabel: string | null = entry.score?.label ?? null;
      const previousScoredAt: number | null = entry.score?.scoredAt ?? null;
      this.registry.updateScore(result.itemId, result);

      if (result.traceEvents !== undefined && result.traceEvents.length > 0) {
        for (const te of result.traceEvents) {
          this.traceStore.addEvent(result.itemId, te.event as TraceEventType, te.detail);
        }
      }

      this.emitTraceEvents(result, isAiUpgrade, previousLabel, previousScoredAt);
      this.updateDebugPill(result.itemId);

      const showInfoIcon: boolean = !this.geminiAvailable && result.source !== 'gemini';
      const labelText: string = getLabelText(result.label);
      const color = getStickerColor(result.label);
      const state = result.label === 'unavailable' ? 'unavailable' as const : 'labeled' as const;

      if (isAiUpgrade) {
        entry.sticker.update({ state: 'ai-enhancing' });
        setTimeout((): void => {
          if (!entry.sticker.isMinimized()) {
            entry.sticker.update({ label: labelText, color, state, showInfoIcon: false });
          }
          this.updateDebugPill(result.itemId);
        }, 400);
      } else {
        entry.sticker.update({ label: labelText, color, state, showInfoIcon });
      }

      if (this.popover?.isOpen()) {
        this.popover.updateScore(result);
      }
    }
  }

  public setGeminiAvailable(available: boolean): void {
    this.geminiAvailable = available;
    this.popover?.setGeminiAvailable(available);
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

  public async rescoreAll(): Promise<void> {
    const allItems: readonly ExtractedItem[] = this.registry
      .getAll()
      .map((entry: RegistryEntry): ExtractedItem => entry.item);

    if (allItems.length === 0) {
      return;
    }

    logger.info('overlay.rescore', 'Re-scoring all items for TMR upgrade', {
      itemCount: allItems.length,
    });
    await this.scoreItems(allItems);
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

      for (const queuedId of response.payload.queued) {
        this.traceStore.addEvent(queuedId, 'AI_QUEUED', 'Priority: 1 (in viewport)');
      }

      logger.info('overlay.scoring', 'Score batch completed', {
        requested: items.length,
        immediate: response.payload.results.length,
        queued: response.payload.queued.length,
      });
      return;
    }

    const errorCode: string = response.ok ? 'unexpected-response' : response.error.code;
    for (const item of items) {
      this.traceStore.addEvent(item.itemId, 'ERROR', errorCode);
    }

    this.handleScoreFailure(
      items.map((item: ExtractedItem): string => item.itemId),
      errorCode,
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
        postAgeText: post.postAgeText,
        activityUrn: extractActivityUrnFromContext(post.postId, window.location.href),
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
        postAgeText: null,
        activityUrn: null,
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
      onClick: (): void => {
        if (sticker.isMinimized()) {
          sticker.restore();
        } else {
          this.openPopover(item.itemId);
        }
      },
      onContextMenu: (): void => this.openContextMenu(item.itemId, element),
      onInfoClick: (): void => {
        void sendToBackground({ type: 'OPEN_POPUP', source: 'content-script' }).catch((): void => {});
      },
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

    this.traceStore.startTrace(
      item.itemId, item.itemType, item.metadata.contentHash, item.text.length, item.isTruncated,
    );
    this.traceStore.addEvent(item.itemId, 'DISCOVERED', `DOM adapter found ${item.itemType} element`);
    this.traceStore.addEvent(item.itemId, 'EXTRACTED', `${item.text.length} chars, hash ${item.metadata.contentHash.slice(0, 12)}`);

    if (this.settings?.isDeveloperMode === true) {
      this.createDebugPill(item.itemId, sticker);
    }

    return true;
  }

  private emitTraceEvents(
    result: ScoringResult,
    isAiUpgrade: boolean,
    previousLabel: string | null,
    previousScoredAt: number | null,
  ): void {
    const trace = this.traceStore.getTrace(result.itemId);
    if (trace === null) return;

    applyTraceEvents(this.traceStore, result.itemId, trace, {
      result,
      isAiUpgrade,
      previousLabel,
      previousScoredAt,
      now: Date.now(),
    });
  }

  private createDebugPill(itemId: string, sticker: SignalSticker): void {
    const pill: DebugPill = new DebugPill(itemId, (): void => {
      this.popover?.close();
      this.openDebugPopover(itemId);
    });
    pill.show();
    this.overlayRoot.getRoot().append(pill.getElement());
    this.debugPills.set(itemId, pill);
  }

  private updateDebugPill(itemId: string): void {
    const pill: DebugPill | undefined = this.debugPills.get(itemId);
    if (pill === undefined) return;
    pill.updateText(this.traceStore.getDebugPillText(itemId));
  }

  private openDebugPopover(itemId: string): void {
    const entry: RegistryEntry | null = this.registry.get(itemId);
    if (entry === null || this.debugPopover === null) return;

    this.debugPopover.open(
      entry.sticker.getElement(),
      this.traceStore,
      itemId,
      entry.score,
      this.geminiAvailable,
    );
  }

  private openContextMenu(itemId: string, postElement: HTMLElement): void {
    const entry: RegistryEntry | null = this.registry.get(itemId);

    if (entry === null || this.contextMenu === null) {
      return;
    }

    const rect: DOMRect = entry.sticker.getElement().getBoundingClientRect();
    this.contextMenu.show(rect.right + 4, rect.top, {
      onHideThis: (): void => {
        entry.sticker.minimize();
      },
      onHideAllOnPost: (): void => {
        for (const other of this.registry.getAll()) {
          if (other.element === postElement || postElement.contains(other.element)) {
            other.sticker.minimize();
          }
        }
      },
    });
  }

  private openPopover(itemId: string): void {
    const entry: RegistryEntry | null = this.registry.get(itemId);

    if (entry === null || entry.score === null || this.popover === null) {
      return;
    }

    this.debugPopover?.close();
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
      if (entry.state === 'loading') {
        this.traceStore.addEvent(entry.itemId, 'CANCELLED', 'Item scrolled out of viewport');
      }
      this.traceStore.removeTrace(entry.itemId);
      const pill: DebugPill | undefined = this.debugPills.get(entry.itemId);
      if (pill !== undefined) {
        pill.destroy();
        this.debugPills.delete(entry.itemId);
      }
      this.registry.remove(entry.itemId);
      this.popover?.close();
      this.debugPopover?.close();
    }
  }

  private shouldShowType(itemType: ExtractedItem['itemType']): boolean {
    const visibility = this.settings?.stickerVisibility ?? 'all';
    return visibility === 'all' || visibility === `${itemType}s`;
  }
}

/**
 * Extract an activity URN from either the post ID itself (if it's already a
 * URN) or from the page URL (for post detail pages like
 * /feed/update/urn:li:activity:NNN).
 */
function extractActivityUrnFromContext(postId: string, pageUrl: string): string | null {
  const urnPattern: RegExp = /urn:li:activity:\d+/;
  const fromId: RegExpMatchArray | null = postId.match(urnPattern);
  if (fromId !== null) return fromId[0];
  const fromUrl: RegExpMatchArray | null = pageUrl.match(urnPattern);
  if (fromUrl !== null) return fromUrl[0];
  return null;
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
