import type { ContentHash } from '@/shared/types';

export function normalizeHashInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function createContentHash(value: string): ContentHash {
  let hash: number = 0x811c9dc5;
  const normalizedValue: string = normalizeHashInput(value);

  for (let index: number = 0; index < normalizedValue.length; index += 1) {
    hash ^= normalizedValue.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `hash_${(hash >>> 0).toString(16)}` as ContentHash;
}
