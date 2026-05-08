import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = path.dirname(fileURLToPath(new URL('.', import.meta.url)));

/**
 * E2E tests load the built Chrome MV3 bundle from `.output/chrome-mv3`.
 * Run `pnpm build` before `pnpm test:e2e`.
 */
export const extensionPath = path.join(repoRoot, '.output/chrome-mv3');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
