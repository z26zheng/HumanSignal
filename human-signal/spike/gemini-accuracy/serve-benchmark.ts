/**
 * Serves the benchmark page locally. Open the URL in Chrome (with Gemini Nano available)
 * and click "Run Benchmark" manually. Results are saved to the page's DOM and can be
 * exported via the Export button.
 *
 * Usage: npx tsx spike/gemini-accuracy/serve-benchmark.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
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

server.listen(8787, '127.0.0.1', () => {
  console.log('\n🔬 Gemini Benchmark Server');
  console.log('   http://127.0.0.1:8787');
  console.log('');
  console.log('   Open this URL in Chrome (with Gemini Nano downloaded).');
  console.log('   Select a prompt config and click "Run Benchmark".');
  console.log('   Use "Export JSON" to save results.');
  console.log('   Press Ctrl+C to stop the server.\n');
});
