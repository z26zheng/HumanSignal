/**
 * Gemini Nano Benchmark Runner
 *
 * Opens system Chrome (not Playwright's bundled Chromium — Gemini Nano is only
 * in production Chrome with the model downloaded), serves the benchmark page
 * via a local HTTP server, runs the benchmark, and saves results.
 *
 * Usage:
 *   npx tsx spike/gemini-accuracy/run-benchmark.ts [configName]
 *
 * Default config: "baseline"
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configName: string = process.argv[2] ?? 'baseline';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

function startServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve_promise) => {
    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url: string = req.url ?? '/';
      const filePath: string = url === '/' ? 'evaluate.html' : url.slice(1);
      const fullPath: string = resolve(__dirname, filePath);

      try {
        const content: string = readFileSync(fullPath, 'utf-8');
        const ext: string = extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'text/plain' });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr !== null && typeof addr === 'object') {
        resolve_promise({ server, port: addr.port });
      }
    });
  });
}

async function main(): Promise<void> {
  console.log(`\n🔬 Gemini Nano Benchmark Runner`);
  console.log(`   Config: ${configName}`);
  console.log('');

  const { server, port } = await startServer();
  console.log(`   Server: http://127.0.0.1:${port}`);

  const defaultProfileDir: string = resolve(
    process.env.HOME ?? '~',
    'Library/Application Support/Google/Chrome',
  );
  const useExistingProfile: boolean = process.argv.includes('--use-profile');
  const userDataDir: string = useExistingProfile
    ? defaultProfileDir
    : mkdtempSync(resolve(tmpdir(), 'gemini-bench-'));

  console.log(`   Launching Chrome (${useExistingProfile ? 'existing profile' : 'temp profile'})...`);
  if (!useExistingProfile) {
    console.log('   TIP: If Gemini Nano is not available, re-run with --use-profile');
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
    viewport: { width: 1024, height: 800 },
    timeout: 60_000,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(120_000);
  await page.goto(`http://127.0.0.1:${port}/`);

  console.log('   Waiting for evaluation set to load...');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => {
    const status = document.getElementById('status');
    return status?.textContent?.includes('Loaded') || status?.textContent?.includes('ERROR');
  }, { timeout: 60_000 });

  const loadStatus: string = await page.evaluate(() => document.getElementById('status')?.textContent ?? '');
  console.log(`   Status: ${loadStatus}`);
  if (loadStatus.includes('ERROR')) {
    throw new Error(`Load failed: ${loadStatus}`);
  }

  console.log(`   Setting config to "${configName}" and starting benchmark...`);
  await page.fill('#promptConfigName', configName);
  await page.click('#runBtn');

  console.log('   Benchmark running (this may take 10-60 minutes for 210 items)...');
  console.log('   Watch progress in the Chrome window.\n');

  await page.waitForFunction(
    () => document.body.dataset.benchmarkComplete === 'true',
    { timeout: 90 * 60 * 1000 },
  );

  const resultsJson: string = await page.evaluate(
    () => document.body.dataset.benchmarkResults ?? '{}',
  );

  const results = JSON.parse(resultsJson);

  const outFile: string = resolve(__dirname, `results-${configName}-${Date.now()}.json`);
  writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log('═'.repeat(60));
  console.log(`BENCHMARK COMPLETE: ${configName}`);
  console.log('═'.repeat(60));
  console.log(`Items:              ${results.itemCount}`);
  console.log(`Exact accuracy:     ${(results.exactAccuracy * 100).toFixed(1)}%`);
  console.log(`Acceptable accuracy: ${(results.acceptableAccuracy * 100).toFixed(1)}%`);
  console.log(`Invalid JSON:       ${results.invalidJsonCount}`);
  console.log(`Avg latency:        ${results.avgLatencyMs}ms`);
  console.log(`P95 latency:        ${results.p95LatencyMs}ms`);
  console.log(`Total time:         ${(results.totalTimeMs / 1000).toFixed(1)}s`);
  console.log(`\nResults saved to: ${outFile}`);
  console.log('');

  if (results.categoryResults) {
    console.log('Per-category accuracy:');
    for (const [cat, data] of Object.entries(results.categoryResults).sort() as [string, { acceptable: number; total: number }][]) {
      const pct: string = ((data.acceptable / data.total) * 100).toFixed(0);
      const icon: string = data.acceptable / data.total >= 0.8 ? '✓' : data.acceptable / data.total >= 0.6 ? '~' : '✗';
      console.log(`  ${icon} ${cat.padEnd(35)} ${data.acceptable}/${data.total} (${pct}%)`);
    }
  }

  await context.close();
  server.close();
}

main().catch((err: unknown) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
