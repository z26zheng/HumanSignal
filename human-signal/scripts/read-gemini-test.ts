import { chromium } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const bundleDir: string = path.resolve(import.meta.dirname ?? '.', '..', '.output/chrome-mv3');

if (!existsSync(path.join(bundleDir, 'manifest.json'))) {
  console.error(`Bundle not found at ${bundleDir}. Run "pnpm build" first.`);
  process.exit(1);
}

console.log('Launching Chrome with extension to read Gemini integration test results...');
console.log('(The test runs on background startup and writes to storage)');
console.log('');

const userDataDir: string = mkdtempSync(path.join(tmpdir(), 'hs-gemini-test-'));
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
console.log(`Extension ID: ${extensionId}`);

console.log('Waiting 45 seconds for Gemini integration test to complete...');
await new Promise((resolve) => setTimeout(resolve, 45000));

const popupPage = await context.newPage();
await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

const testResult = await popupPage.evaluate(async () => {
  const chromeApi = (globalThis as unknown as Record<string, unknown>)['chrome'] as {
    readonly storage: {
      readonly local: {
        readonly get: (keys: string[]) => Promise<Record<string, unknown>>;
      };
    };
  };
  const r = await chromeApi.storage.local.get(['geminiIntegrationTest', 'geminiStatus']);
  return r;
});

console.log('');
console.log('=== Gemini Integration Test Results ===');
console.log(JSON.stringify(testResult, null, 2));

const test = testResult.geminiIntegrationTest as Record<string, unknown> | undefined;
if (test) {
  console.log('');
  console.log('Summary:');
  console.log(`  Availability: ${test.availability ?? 'unknown'}`);
  console.log(`  Mode: ${test.mode ?? 'unknown'}`);
  console.log(`  Elapsed: ${test.elapsedMs ?? '?'}ms`);
  
  const prompt = test.promptResponse as Record<string, unknown> | undefined;
  if (prompt) {
    console.log(`  Prompt OK: ${prompt.ok}`);
    console.log(`  Has result: ${prompt.hasResult}`);
    console.log(`  Label: ${prompt.label ?? 'null'}`);
    console.log(`  Source: ${prompt.source ?? 'null'}`);
    
    if (prompt.source === 'gemini') {
      console.log('');
      console.log('*** GEMINI SCORING WORKS END-TO-END ***');
    } else if (prompt.hasResult) {
      console.log('');
      console.log('*** PARTIAL: Got result but source is not gemini (rules fallback) ***');
    } else {
      console.log('');
      console.log('*** FAIL: No scoring result ***');
    }
  } else if (test.error) {
    console.log(`  Error: ${test.error}`);
    console.log('');
    console.log('*** FAIL: Test errored ***');
  } else {
    console.log('  (No prompt test ran - Gemini may not be available in Playwright Chromium)');
  }
}

await context.close();
