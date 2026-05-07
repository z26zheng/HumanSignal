import type { ContentHash, ExtractedItem } from '@/shared/types';

export type QueuePriority = 1 | 2 | 3;

export interface QueueItem {
  readonly item: ExtractedItem;
  readonly contentHash: ContentHash;
  readonly priority: QueuePriority;
  readonly tabId: number | null;
  readonly addedAt: number;
}

export class ScoringQueue {
  private readonly queue: QueueItem[] = [];

  public constructor(private readonly maxQueueSize: number = 20) {}

  public enqueue(item: QueueItem): void {
    const existingIndex: number = this.queue.findIndex(
      (queuedItem: QueueItem): boolean => queuedItem.item.itemId === item.item.itemId,
    );

    if (existingIndex >= 0) {
      this.queue[existingIndex] = item;
    } else {
      this.queue.push(item);
    }

    this.sort();
    this.trim();
  }

  public dequeue(): QueueItem | null {
    return this.queue.shift() ?? null;
  }

  public updatePriority(itemId: string, priority: QueuePriority): void {
    const existingItem: QueueItem | undefined = this.queue.find(
      (queuedItem: QueueItem): boolean => queuedItem.item.itemId === itemId,
    );

    if (existingItem === undefined) {
      return;
    }

    this.enqueue({
      ...existingItem,
      priority,
    });
  }

  public cancel(itemId: string): void {
    const existingIndex: number = this.queue.findIndex(
      (queuedItem: QueueItem): boolean => queuedItem.item.itemId === itemId,
    );

    if (existingIndex >= 0) {
      this.queue.splice(existingIndex, 1);
    }
  }

  public getDepth(): number {
    return this.queue.length;
  }

  private sort(): void {
    this.queue.sort((left: QueueItem, right: QueueItem): number => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.addedAt - right.addedAt;
    });
  }

  private trim(): void {
    if (this.queue.length <= this.maxQueueSize) {
      return;
    }

    this.queue.splice(this.maxQueueSize);
  }
}
