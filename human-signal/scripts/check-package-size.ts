import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot: string = fileURLToPath(new URL('..', import.meta.url));
const outputDir: string = path.join(repoRoot, '.output');

// Find the most-recently-modified chrome zip in .output/
const zipFile: string | undefined = readdirSync(outputDir)
  .filter((f: string) => f.endsWith('-chrome.zip'))
  .sort((a: string, b: string) =>
    statSync(path.join(outputDir, b)).mtimeMs - statSync(path.join(outputDir, a)).mtimeMs,
  )[0];

if (zipFile === undefined) {
  console.error('No *-chrome.zip found in .output/ — run `pnpm zip` first.');
  process.exitCode = 1;
  process.exit();
}

const packagePath: string = path.join(outputDir, zipFile);
// 250 MB — current bundle is ~208 MB; this gives headroom for tokenizer growth.
const maxBytes: number = Number.parseInt(process.env.HUMAN_SIGNAL_MAX_ZIP_BYTES ?? String(250 * 1024 * 1024), 10);
const sizeBytes: number = statSync(packagePath).size;
const passed: boolean = sizeBytes <= maxBytes;

console.log(
  JSON.stringify(
    {
      packagePath,
      sizeBytes,
      sizeKb: roundMetric(sizeBytes / 1024),
      maxBytes,
      maxKb: roundMetric(maxBytes / 1024),
      passed,
    },
    null,
    2,
  ),
);

if (!passed) {
  process.exitCode = 1;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}
