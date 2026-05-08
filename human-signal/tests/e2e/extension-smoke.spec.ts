import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundleDir = path.join(repoRoot, '.output/chrome-mv3');
const feedFixture = readFileSync(
  path.join(repoRoot, 'src/linkedin-adapter/__fixtures__/feed.html'),
  'utf8',
);

function extensionLoads(): boolean {
  return existsSync(path.join(bundleDir, 'manifest.json'));
}

test.beforeAll(() => {
  if (!extensionLoads()) {
    throw new Error(
      `Chrome MV3 bundle missing under ${bundleDir}. Run \`pnpm build\`, then retry \`pnpm test:e2e\`.`,
    );
  }
});

test.describe('extension smoke', () => {
  test('service worker registers after load', async () => {
    const context = await launchExtensionContext();

    try {
      await waitForExtensionServiceWorker(context);

      const ours = context
        .serviceWorkers()
        .filter((sw) => sw.url().startsWith('chrome-extension://'));
      expect(ours.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });

  test('scores fixture LinkedIn posts with overlay stickers', async () => {
    const context = await launchExtensionContext();

    try {
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);

      await expect(page.locator('#human-signal-overlay-root')).toBeAttached();
      await expect(page.locator('main > article')).toHaveCount(2);
      await expect(page.locator('main #human-signal-overlay-root')).toHaveCount(0);
      await expect(page.locator('main .human-signal-sticker')).toHaveCount(0);
      await expect(page.locator('.human-signal-sticker')).toHaveCount(3);
      await expect(page.locator('.human-signal-sticker--loading')).toHaveCount(0);

      const stickerLabels = await page
        .locator('.human-signal-sticker')
        .evaluateAll((stickers) => stickers.map((sticker) => sticker.textContent ?? ''));
      expect(stickerLabels).toContain('Specific');
      expect(stickerLabels).toContain('Engagement Bait');
      expect(stickerLabels).toContain('Low Effort');

      await page.locator('.human-signal-sticker', { hasText: 'Specific' }).click();
      await expect(page.locator('.human-signal-popover[role="dialog"] h2')).toContainText('Specific');
      await expect(page.locator('.human-signal-popover')).toContainText('Source: Rules-based');

      await page.keyboard.press('Escape');
      await expect(page.locator('.human-signal-popover')).toBeEmpty();
      await expect(page.locator('.human-signal-sticker', { hasText: 'Specific' })).toBeFocused();
    } finally {
      await context.close();
    }
  });

  test('popup sticker setting hides active LinkedIn overlays', async () => {
    const context = await launchExtensionContext();

    try {
      const extensionId = await getExtensionId(context);
      await setupLinkedInFixtureRoute(context);
      const linkedInPage = await openLinkedInFixturePage(context);

      await expect(linkedInPage.locator('.human-signal-sticker')).toHaveCount(3);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect(popupPage.getByText('Connected')).toBeVisible();
      await expect(popupPage.getByLabel('Signal Stickers')).toHaveValue('all');
      await expect(popupPage.getByText('Items scored')).toBeVisible();
      await expect(popupPage.getByText('Cache', { exact: true })).toBeVisible();
      await expect(popupPage.getByText('Queue')).toBeVisible();

      await linkedInPage.bringToFront();
      await changePopupStickerVisibility(popupPage, 'off');

      await expect(linkedInPage.locator('.human-signal-sticker--hidden')).toHaveCount(3);
      await linkedInPage.waitForTimeout(100);
      await expect(linkedInPage.locator('.human-signal-sticker--hidden')).toHaveCount(3);

      await changePopupStickerVisibility(popupPage, 'all');
      await expect(linkedInPage.locator('.human-signal-sticker--hidden')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('repositions stickers when post layout and viewport size change', async () => {
    const context = await launchExtensionContext();

    try {
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);
      await page.setViewportSize({ width: 900, height: 720 });
      await page.addStyleTag({
        content: `
          main { width: 840px; }
          main > article { box-sizing: border-box; width: 420px; padding: 16px; margin: 24px 0; }
        `,
      });
      await expect(page.locator('.human-signal-sticker')).toHaveCount(3);

      const beforeLayoutChange = await getStickerPosition(page, 'Specific');
      await page.evaluate(() => {
        const firstPost = document.querySelector<HTMLElement>('article[data-urn="urn:li:activity:1001"]');

        if (firstPost === null) {
          throw new Error('First fixture post was not found.');
        }

        firstPost.style.width = '720px';
      });
      await expect.poll(async () => (await getStickerPosition(page, 'Specific')).x).not.toBe(beforeLayoutChange.x);

      const beforeViewportChange = await getStickerPosition(page, 'Specific');
      await page.setViewportSize({ width: 700, height: 720 });
      await page.evaluate(() => {
        const firstPost = document.querySelector<HTMLElement>('article[data-urn="urn:li:activity:1001"]');

        if (firstPost === null) {
          throw new Error('First fixture post was not found.');
        }

        firstPost.style.width = '520px';
      });
      await expect.poll(async () => (await getStickerPosition(page, 'Specific')).x).not.toBe(beforeViewportChange.x);
    } finally {
      await context.close();
    }
  });

  test('repositions downstream stickers when page font size changes layout', async () => {
    const context = await launchExtensionContext();

    try {
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);
      await page.addStyleTag({
        content: `
          main { width: 360px; }
          main > article { box-sizing: border-box; width: 320px; padding: 8px; margin: 12px 0; font-size: 12px; line-height: 1.2; }
        `,
      });
      await expect(page.locator('.human-signal-sticker')).toHaveCount(3);

      const beforeFontChange = await getStickerPosition(page, 'Engagement Bait');
      await page.evaluate(() => {
        for (const article of document.querySelectorAll<HTMLElement>('main > article')) {
          article.style.fontSize = '32px';
        }
      });

      await expect.poll(async () => (await getStickerPosition(page, 'Engagement Bait')).y).not.toBe(beforeFontChange.y);
    } finally {
      await context.close();
    }
  });

  test('scores posts added after initial feed load', async () => {
    const context = await launchExtensionContext();

    try {
      const extensionId = await getExtensionId(context);
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);

      await expect(page.locator('.human-signal-sticker')).toHaveCount(3);

      await page.evaluate(() => {
        const post = document.createElement('article');
        post.setAttribute('data-urn', 'urn:li:activity:1003');
        post.innerHTML = `
          <div data-test-id="main-feed-activity-card__commentary">
            <p>We reduced cold start time by 41% after profiling service worker startup.</p>
          </div>
        `;
        document.querySelector('main')?.append(post);
      });
      await sendContentScriptMessageFromExtensionPage(context, extensionId, {
        type: 'REDISCOVER_CONTENT',
        requestId: crypto.randomUUID(),
        source: 'background',
        target: 'content-script',
      });

      await expect(page.locator('.human-signal-sticker')).toHaveCount(4);
      await expect(page.locator('.human-signal-sticker--loading')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('popover feedback is persisted locally without raw LinkedIn text', async () => {
    const context = await launchExtensionContext();

    try {
      const extensionId = await getExtensionId(context);
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);

      await page.locator('.human-signal-sticker', { hasText: 'Specific' }).click();
      const agreeButton = page.locator('.human-signal-popover').getByRole('button', {
        name: 'agree',
        exact: true,
      });
      await agreeButton.click();
      await expect(agreeButton).toBeDisabled();

      const extensionPage = await context.newPage();
      await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`);
      const feedbackEntries = await extensionPage.evaluate(async (): Promise<unknown[]> => {
        const chromeApi = (globalThis as unknown as Record<string, unknown>)['chrome'] as {
          readonly storage: {
            readonly local: {
              readonly get: (key: string) => Promise<Record<string, unknown>>;
            };
          };
        };
        const result = await chromeApi.storage.local.get('feedbackEntries');
        return Array.isArray(result.feedbackEntries) ? result.feedbackEntries : [];
      });

      expect(feedbackEntries).toHaveLength(1);
      expect(feedbackEntries[0]).toMatchObject({
        feedback: 'agree',
        label: 'specific',
        source: 'rules',
      });
      expect(JSON.stringify(feedbackEntries)).not.toContain('hiring dashboard');
    } finally {
      await context.close();
    }
  });

  test('switches from rules to Gemini mock for newly discovered posts', async () => {
    const context = await launchExtensionContext();

    try {
      const extensionId = await getExtensionId(context);
      await configureGeminiMock(context, extensionId, {
        isEnabled: true,
        availability: 'unavailable',
        promptMode: 'valid',
        downloadMode: 'success',
        downloadProgress: null,
      });
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);

      await expect(page.locator('.human-signal-sticker', { hasText: 'Specific' })).toHaveCount(1);

      await configureGeminiMock(context, extensionId, {
        isEnabled: true,
        availability: 'available',
        promptMode: 'valid',
        downloadMode: 'success',
        downloadProgress: 100,
      });
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
      const downloadResponse = await sendRuntimeMessageFromExtensionPage(popupPage, {
        type: 'TRIGGER_DOWNLOAD',
        requestId: crypto.randomUUID(),
        source: 'popup',
        target: 'background',
      });
      expect(downloadResponse).toMatchObject({
        ok: true,
        payload: {
          type: 'MODEL_STATUS',
          status: {
            availability: 'available',
          },
        },
      });

      await page.bringToFront();
      await page.evaluate(() => {
        const post = document.createElement('article');
        post.setAttribute('data-urn', 'urn:li:activity:2001');
        post.innerHTML = `
          <div data-test-id="main-feed-activity-card__commentary">
            <p>This newly visible post should receive a Gemini mock score.</p>
          </div>
        `;
        document.querySelector('main')?.append(post);
      });
      await sendContentScriptMessageFromExtensionPage(context, extensionId, {
        type: 'REDISCOVER_CONTENT',
        requestId: crypto.randomUUID(),
        source: 'background',
        target: 'content-script',
      });

      await expect(page.locator('.human-signal-sticker')).toHaveCount(4);
      await expect(page.locator('.human-signal-sticker', { hasText: 'High Signal' })).toHaveCount(1);
      await page.locator('.human-signal-sticker', { hasText: 'High Signal' }).click();
      await expect(page.locator('.human-signal-popover')).toContainText('Source: AI-enhanced');
    } finally {
      await context.close();
    }
  });

  test('falls back to rules when Gemini mock returns null for a new item', async () => {
    const context = await launchExtensionContext();

    try {
      const extensionId = await getExtensionId(context);
      await configureGeminiMock(context, extensionId, {
        isEnabled: true,
        availability: 'available',
        promptMode: 'mixed',
        downloadMode: 'success',
        downloadProgress: 100,
      });
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);

      await page.evaluate(() => {
        const post = document.createElement('article');
        post.setAttribute('data-urn', 'urn:li:activity:2002');
        post.innerHTML = `
          <div data-test-id="main-feed-activity-card__commentary">
            <p>fail gemini with a concrete 42% metric so rules can recover.</p>
          </div>
        `;
        document.querySelector('main')?.append(post);
      });
      await sendContentScriptMessageFromExtensionPage(context, extensionId, {
        type: 'REDISCOVER_CONTENT',
        requestId: crypto.randomUUID(),
        source: 'background',
        target: 'content-script',
      });

      await expect(page.locator('.human-signal-sticker--loading')).toHaveCount(0);
      await expect(page.locator('.human-signal-sticker', { hasText: 'Unavailable' })).toHaveCount(0);
      await expect(page.locator('.human-signal-sticker', { hasText: 'High Signal' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('resends pending scores when service worker alive message arrives after transient failure', async () => {
    const context = await launchExtensionContext();

    try {
      const extensionId = await getExtensionId(context);
      await setExtensionStorage(context, extensionId, {
        e2eFailNextScoreBatch: true,
      });
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);

      await expect(page.locator('.human-signal-sticker', { hasText: 'Unavailable' })).toHaveCount(3);
      await sendContentScriptMessageFromExtensionPage(context, extensionId, {
        type: 'SERVICE_WORKER_ALIVE',
        requestId: crypto.randomUUID(),
        source: 'background',
        target: 'content-script',
      });

      await expect(page.locator('.human-signal-sticker--loading')).toHaveCount(0);
      await expect(page.locator('.human-signal-sticker', { hasText: 'Unavailable' })).toHaveCount(0);
      await expect(page.locator('.human-signal-sticker', { hasText: 'Specific' })).toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test('keeps rules scoring available when Gemini mock download fails', async () => {
    const context = await launchExtensionContext();

    try {
      const extensionId = await getExtensionId(context);
      await configureGeminiMock(context, extensionId, {
        isEnabled: true,
        availability: 'downloadable',
        promptMode: 'valid',
        downloadMode: 'failure',
        downloadProgress: null,
      });
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect(popupPage.getByText('Not enabled')).toBeVisible();

      await popupPage.getByRole('button', { name: 'Enable On-Device AI' }).click();
      await expect(popupPage.getByText('E2E Gemini mock error')).toBeVisible();

      await page.bringToFront();
      await expect(page.locator('.human-signal-sticker', { hasText: 'Specific' })).toHaveCount(1);
      await expect(page.locator('.human-signal-sticker', { hasText: 'Engagement Bait' })).toHaveCount(1);
      await expect(page.locator('.human-signal-sticker', { hasText: 'High Signal' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('removes stickers and closes popover when feed items disappear', async () => {
    const context = await launchExtensionContext();

    try {
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);

      await expect(page.locator('.human-signal-sticker')).toHaveCount(3);
      await page.locator('.human-signal-sticker', { hasText: 'Specific' }).click();
      await expect(page.locator('.human-signal-popover[role="dialog"] h2')).toContainText('Specific');

      await page.evaluate(() => {
        document.querySelector('article[data-urn="urn:li:activity:1001"]')?.remove();
      });

      await expect(page.locator('.human-signal-sticker')).toHaveCount(1);
      await expect(page.locator('.human-signal-popover')).toBeEmpty();
    } finally {
      await context.close();
    }
  });

  test('closes popover on outside click and scroll', async () => {
    const context = await launchExtensionContext();

    try {
      await setupLinkedInFixtureRoute(context);
      const page = await openLinkedInFixturePage(context);

      await page.locator('.human-signal-sticker', { hasText: 'Specific' }).click();
      await expect(page.locator('.human-signal-popover[role="dialog"] h2')).toContainText('Specific');

      await page.locator('main').click({ position: { x: 4, y: 4 } });
      await expect(page.locator('.human-signal-popover')).toBeEmpty();

      await page.locator('.human-signal-sticker', { hasText: 'Specific' }).click();
      await expect(page.locator('.human-signal-popover[role="dialog"] h2')).toContainText('Specific');

      await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
      await expect(page.locator('.human-signal-popover')).toBeEmpty();
    } finally {
      await context.close();
    }
  });

  test('delete all data resets popup settings and active overlay', async () => {
    const context = await launchExtensionContext();

    try {
      const extensionId = await getExtensionId(context);
      await setupLinkedInFixtureRoute(context);
      const linkedInPage = await openLinkedInFixturePage(context);
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

      await linkedInPage.bringToFront();
      await changePopupStickerVisibility(popupPage, 'off');
      await expect(linkedInPage.locator('.human-signal-sticker--hidden')).toHaveCount(3);

      await popupPage.bringToFront();
      await popupPage.getByRole('button', { name: 'Delete all data' }).click();
      await expect(popupPage.getByLabel('Signal Stickers')).toHaveValue('all');

      await linkedInPage.bringToFront();
      await changePopupStickerVisibility(popupPage, 'all');
      await expect(linkedInPage.locator('.human-signal-sticker--hidden')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('unsupported LinkedIn page does not render stickers or console errors', async () => {
    const context = await launchExtensionContext();

    try {
      await waitForExtensionServiceWorker(context);
      await context.route('https://www.linkedin.com/jobs/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: createFixturePage('<main><section><h1>Jobs fixture</h1></section></main>'),
        });
      });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });

      await page.goto('https://www.linkedin.com/jobs/');
      await expect(page.locator('#human-signal-overlay-root')).toBeAttached();
      await expect(page.locator('.human-signal-sticker')).toHaveCount(0);
      expect(consoleErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});

async function launchExtensionContext(): Promise<BrowserContext> {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'human-signal-pw-'));
  const headless = process.env.PLAYWRIGHT_EXTENSION_HEADLESS === '1';

  return await chromium.launchPersistentContext(userDataDir, {
    channel: process.env.PLAYWRIGHT_CHROME_CHANNEL ?? 'chromium',
    headless,
    args: [
      `--disable-extensions-except=${bundleDir}`,
      `--load-extension=${bundleDir}`,
    ],
  });
}

async function waitForExtensionServiceWorker(context: BrowserContext): Promise<void> {
  if (context.serviceWorkers().some((sw) => sw.url().startsWith('chrome-extension://'))) {
    return;
  }

  await context.waitForEvent('serviceworker', {
    predicate: (sw) => sw.url().startsWith('chrome-extension://'),
  });
}

async function getExtensionId(context: BrowserContext): Promise<string> {
  await waitForExtensionServiceWorker(context);
  const serviceWorker = context
    .serviceWorkers()
    .find((sw) => sw.url().startsWith('chrome-extension://'));

  if (serviceWorker === undefined) {
    throw new Error('Extension service worker was not registered.');
  }

  return new URL(serviceWorker.url()).host;
}

async function setupLinkedInFixtureRoute(context: BrowserContext): Promise<void> {
  await waitForExtensionServiceWorker(context);
  await context.route('https://www.linkedin.com/feed/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: createFixturePage(feedFixture),
    });
  });
}

async function openLinkedInFixturePage(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/feed/');
  return page;
}

async function changePopupStickerVisibility(
  popupPage: Awaited<ReturnType<BrowserContext['newPage']>>,
  value: 'all' | 'off',
): Promise<void> {
  await popupPage.evaluate((nextValue) => {
    const stickerSelect = [...document.querySelectorAll('select')].find((select) =>
      select.closest('label')?.textContent?.includes('Signal Stickers'),
    );

    if (stickerSelect === undefined) {
      throw new Error('Signal Stickers select was not found.');
    }

    stickerSelect.value = nextValue;
    stickerSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

interface GeminiMockConfig {
  readonly isEnabled: boolean;
  readonly availability: 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'error';
  readonly promptMode: 'valid' | 'invalid' | 'mixed';
  readonly downloadMode: 'success' | 'failure';
  readonly downloadProgress: number | null;
}

async function configureGeminiMock(
  context: BrowserContext,
  extensionId: string,
  config: GeminiMockConfig,
): Promise<void> {
  await setExtensionStorage(context, extensionId, {
    e2eGeminiMock: config,
    geminiStatus: {
      availability: config.availability,
      downloadProgress: config.downloadProgress,
      lastCheckedAt: Date.now(),
      errorMessage: null,
    },
  });
}

async function setExtensionStorage(
  context: BrowserContext,
  extensionId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const extensionPage = await context.newPage();

  try {
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await extensionPage.evaluate(async (storageValues): Promise<void> => {
      const chromeApi = (globalThis as unknown as Record<string, unknown>)['chrome'] as {
        readonly storage: {
          readonly local: {
            readonly set: (items: Record<string, unknown>) => Promise<void>;
          };
        };
      };
      await chromeApi.storage.local.set(storageValues);
    }, values);
  } finally {
    await extensionPage.close();
  }
}

async function sendRuntimeMessageFromExtensionPage(
  page: Page,
  message: Record<string, unknown>,
): Promise<unknown> {
  return await page.evaluate(async (runtimeMessage): Promise<unknown> => {
    const chromeApi = (globalThis as unknown as Record<string, unknown>)['chrome'] as {
      readonly runtime: {
        readonly sendMessage: (message: Record<string, unknown>) => Promise<unknown>;
      };
    };
    return await chromeApi.runtime.sendMessage(runtimeMessage);
  }, message);
}

async function sendContentScriptMessageFromExtensionPage(
  context: BrowserContext,
  extensionId: string,
  message: Record<string, unknown>,
): Promise<unknown> {
  const extensionPage = await context.newPage();

  try {
    await extensionPage.goto(`chrome-extension://${extensionId}/popup.html`);
    return await extensionPage.evaluate(async (runtimeMessage): Promise<unknown> => {
      const chromeApi = (globalThis as unknown as Record<string, unknown>)['chrome'] as {
        readonly tabs: {
          readonly query: (queryInfo: Record<string, unknown>) => Promise<Array<{ readonly id?: number }>>;
          readonly sendMessage: (tabId: number, message: Record<string, unknown>) => Promise<unknown>;
        };
      };
      const tabs = await chromeApi.tabs.query({
        url: 'https://www.linkedin.com/*',
      });
      const tabId = tabs[0]?.id;

      if (tabId === undefined) {
        throw new Error('LinkedIn test tab was not found.');
      }

      return await chromeApi.tabs.sendMessage(tabId, runtimeMessage);
    }, message);
  } finally {
    await extensionPage.close();
  }
}

interface StickerPosition {
  readonly x: number;
  readonly y: number;
}

async function getStickerPosition(page: Page, label: string): Promise<StickerPosition> {
  const transform = await page
    .locator('.human-signal-sticker', { hasText: label })
    .evaluate((sticker) => (sticker as HTMLElement).style.transform);
  const match: RegExpMatchArray | null = transform.match(/translate\((-?\d+)px, (-?\d+)px\)/);

  if (match === null) {
    throw new Error(`Unable to parse sticker transform: ${transform}`);
  }

  return {
    x: Number.parseInt(match[1] ?? '0', 10),
    y: Number.parseInt(match[2] ?? '0', 10),
  };
}

function createFixturePage(body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <title>LinkedIn Fixture</title>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
