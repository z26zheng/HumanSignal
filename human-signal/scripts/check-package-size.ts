import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot: string = fileURLToPath(new URL('..', import.meta.url));
const packagePath: string = path.join(repoRoot, '.output/human-signal-0.0.0-chrome.zip');
const maxBytes: number = Number.parseInt(process.env.HUMAN_SIGNAL_MAX_ZIP_BYTES ?? '1048576', 10);
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
