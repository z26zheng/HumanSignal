import type { SignalSticker } from '@/overlay/signal-sticker';
import type { ScoringResult } from '@/shared/types';

export type RegistryState = 'loading' | 'scored' | 'hidden' | 'failed';

export interface RegistryEntry {
  readonly itemId: string;
  readonly itemType: 'post' | 'comment';
  readonly element: HTMLElement;
  readonly sticker: SignalSticker;
  readonly createdAt: number;
  state: RegistryState;
  score: ScoringResult | null;
  inViewport: boolean;
}

export class ItemRegistry {
  private readonly entries: Map<string, RegistryEntry> = new Map();

  public constructor(private readonly maxEntries: number = 50) {}

  public add(entry: RegistryEntry): void {
    this.entries.set(entry.itemId, entry);
    this.evictOverflow();
  }

  public get(itemId: string): RegistryEntry | null {
    return this.entries.get(itemId) ?? null;
  }

  public getAll(): readonly RegistryEntry[] {
    return Array.from(this.entries.values());
  }

  public updateScore(itemId: string, score: ScoringResult): void {
    const entry: RegistryEntry | undefined = this.entries.get(itemId);

    if (entry === undefined) {
      return;
    }

    entry.score = score;
    entry.state = 'scored';
  }

  public remove(itemId: string): void {
    const entry: RegistryEntry | undefined = this.entries.get(itemId);
    entry?.sticker.destroy();
    this.entries.delete(itemId);
  }

  public clear(): void {
    for (const entry of this.entries.values()) {
      entry.sticker.destroy();
    }

    this.entries.clear();
  }

  private evictOverflow(): void {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const removableEntries: readonly RegistryEntry[] = Array.from(this.entries.values())
      .filter((entry: RegistryEntry): boolean => !entry.inViewport)
      .sort((left: RegistryEntry, right: RegistryEntry): number => left.createdAt - right.createdAt);

    for (const entry of removableEntries) {
      if (this.entries.size <= this.maxEntries) {
        break;
      }

      this.remove(entry.itemId);
    }
  }
}
