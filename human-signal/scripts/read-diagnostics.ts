import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bundleDir: string = path.resolve(import.meta.dirname ?? '.', '..', '.output/chrome-mv3');

if (!existsSync(path.join(bundleDir, 'manifest.json'))) {
  console.error(`Bundle not found at ${bundleDir}. Run "pnpm build" first.`);
  process.exit(1);
}

const userDataDir: string = mkdtempSync(path.join(tmpdir(), 'hs-diag-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: false,
  args: [
    `--disable-extensions-except=${bundleDir}`,
    `--load-extension=${bundleDir}`,
  ],
});

const sw = await context.waitForEvent('serviceworker', {
  predicate: (sw) => sw.url().startsWith('chrome-extension://'),
});
const extensionId: string = new URL(sw.url()).host;
const popupPage = await context.newPage();
await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

const dump = await popupPage.evaluate(async (): Promise<unknown> => {
  const chromeApi = (globalThis as unknown as Record<string, unknown>)['chrome'] as {
    readonly storage: {
      readonly local: {
        readonly get: (key: string) => Promise<Record<string, unknown>>;
      };
    };
  };
  const result = await chromeApi.storage.local.get('diagnosticDump');
  return result.diagnosticDump ?? null;
});

console.log(JSON.stringify(dump, null, 2));

await context.close();
