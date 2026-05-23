/**
 * scripts/fetch-assets.ts
 *
 * Developer setup script: populates `public/models/` and `public/ort/`
 * which are gitignored because they are too large for GitHub (202 MB + 22 MB).
 *
 * Run once after a fresh clone:
 *   pnpm fetch-assets
 *
 * It is also wired into `postinstall` so `pnpm install` handles it
 * automatically. The script is idempotent — already-present files are
 * skipped (no re-download).
 *
 * Sources:
 *   - Model: https://huggingface.co/onnx-community/tmr-ai-text-detector-ONNX
 *   - ORT wasm: node_modules/onnxruntime-web/dist/ (already on disk after install)
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { copyFile, readdir } from 'node:fs/promises';
import { get as httpsGet } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC: string = path.join(__dirname, '..', 'public');
const MODELS_DIR: string = path.join(PUBLIC, 'models', 'tmr-ai-text-detector');
const ONNX_DIR: string = path.join(MODELS_DIR, 'onnx');
const ORT_DIR: string = path.join(PUBLIC, 'ort');

// Files to download from HuggingFace (relative to the model repo root).
const HF_BASE: string =
  'https://huggingface.co/onnx-community/tmr-ai-text-detector-ONNX/resolve/main';

const MODEL_FILES: ReadonlyArray<{ url: string; dest: string }> = [
  { url: `${HF_BASE}/config.json`, dest: path.join(MODELS_DIR, 'config.json') },
  { url: `${HF_BASE}/tokenizer.json`, dest: path.join(MODELS_DIR, 'tokenizer.json') },
  { url: `${HF_BASE}/tokenizer_config.json`, dest: path.join(MODELS_DIR, 'tokenizer_config.json') },
  { url: `${HF_BASE}/special_tokens_map.json`, dest: path.join(MODELS_DIR, 'special_tokens_map.json') },
  { url: `${HF_BASE}/onnx/model_q4.onnx`, dest: path.join(ONNX_DIR, 'model_q4.onnx') },
];

// Files to copy from node_modules (onnxruntime-web ships them after pnpm install).
const ORT_GLOB: string = 'ort-wasm-simd-threaded.asyncify';

async function main(): Promise<void> {
  ensureDir(MODELS_DIR);
  ensureDir(ONNX_DIR);
  ensureDir(ORT_DIR);

  let anyWork: boolean = false;

  // 1. Download model files from HuggingFace.
  for (const { url, dest } of MODEL_FILES) {
    if (existsSync(dest)) {
      continue;
    }
    anyWork = true;
    const label: string = path.relative(PUBLIC, dest);
    process.stdout.write(`⬇  ${label} … `);
    await download(url, dest);
    process.stdout.write('done\n');
  }

  // 2. Copy ORT WASM files from node_modules (already on disk).
  const ortSource: string | null = findOrtSource();
  if (ortSource === null) {
    console.error(
      '\n❌  Could not find onnxruntime-web in node_modules.\n' +
      '    Run `pnpm install` first.',
    );
    process.exitCode = 1;
    return;
  }

  const ortFiles: string[] = await readdir(ortSource);
  for (const file of ortFiles) {
    if (!file.startsWith(ORT_GLOB)) continue;
    const dest: string = path.join(ORT_DIR, file);
    if (existsSync(dest)) continue;
    anyWork = true;
    process.stdout.write(`📋  ort/${file} … `);
    await copyFile(path.join(ortSource, file), dest);
    process.stdout.write('done\n');
  }

  if (!anyWork) {
    console.log('✅  All assets already present — nothing to do.');
  } else {
    console.log('\n✅  Assets ready. You can now run `pnpm build`.');
  }
}

/**
 * Locate onnxruntime-web dist directory somewhere under node_modules.
 * pnpm may hoist it or nest it inside .pnpm/…/node_modules/onnxruntime-web.
 */
function findOrtSource(): string | null {
  const nodeModules: string = path.join(__dirname, '..', 'node_modules');

  // 1. Hoisted layout (npm or pnpm with shamefully-hoist)
  const hoisted: string = path.join(nodeModules, 'onnxruntime-web', 'dist');
  if (existsSync(hoisted)) return hoisted;

  // 2. pnpm virtual-store layout: node_modules/.pnpm/onnxruntime-web@x.y.z/…
  const pnpmStore: string = path.join(nodeModules, '.pnpm');
  if (!existsSync(pnpmStore)) return null;

  try {
    for (const entry of readdirSync(pnpmStore)) {
      if (!entry.startsWith('onnxruntime-web@')) continue;
      const dist: string = path.join(pnpmStore, entry, 'node_modules', 'onnxruntime-web', 'dist');
      if (existsSync(dist)) return dist;
    }
  } catch {
    // ignore read errors
  }

  return null;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Download `url` to `dest`, following up to 5 redirects.
 * Shows a live byte counter for large files.
 */
async function download(url: string, dest: string, redirects: number = 5): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    httpsGet(url, (res) => {
      if (
        (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) &&
        res.headers.location !== undefined
      ) {
        if (redirects <= 0) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        resolve(download(res.headers.location, dest, redirects - 1));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode ?? 'unknown'} for ${url}`));
        return;
      }

      const total: number = Number.parseInt(res.headers['content-length'] ?? '0', 10);
      let received: number = 0;

      if (total > 0) {
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          const pct: number = Math.round((received / total) * 100);
          process.stdout.write(`\r⬇  ${path.basename(dest)} … ${pct}%   `);
        });
      }

      const out = createWriteStream(dest);
      pipeline(res, out).then(resolve).catch((err: unknown) => {
        reject(err);
      });
    }).on('error', reject);
  });
}

main().catch((err: unknown) => {
  console.error('fetch-assets failed:', err);
  process.exitCode = 1;
});
