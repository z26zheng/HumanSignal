import { getGeminiStatus } from '@/shared/storage';

import type { GeminiStatus, ScoringMode } from '@/shared/types';

export class ModeManager {
  private mode: ScoringMode = 'rules';

  public async initialize(): Promise<void> {
    const status: GeminiStatus = await getGeminiStatus();
    this.mode = status.availability === 'available' ? 'gemini' : 'rules';
  }

  public getMode(): ScoringMode {
    return this.mode;
  }

  public onGeminiStatus(status: GeminiStatus): void {
    if (status.availability === 'available') {
      this.mode = 'gemini';
      return;
    }

    if (status.availability === 'error' || status.availability === 'unavailable') {
      this.mode = 'rules';
    }
  }
}
