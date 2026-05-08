#!/usr/bin/env bash
# Test: Can Gemini Nano handle concurrent prompts? Measures sequential vs parallel timing.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_DIR="$PROJECT_DIR/.output/chrome-mv3"
EXT_ID="hoagjhaadmbfbgceiipccdgkjfghflnj"

cd "$PROJECT_DIR"
echo "=== Gemini Nano Concurrency Test ==="
echo ""

corepack pnpm build 2>&1 | tail -1
pkill -f "Google Chrome" 2>/dev/null || true; sleep 3

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --profile-directory="Default" \
  --load-extension="$BUNDLE_DIR" \
  --no-first-run --no-default-browser-check \
  "chrome-extension://$EXT_ID/offscreen.html" \
  2>/dev/null &
sleep 8

RESULT=$(osascript << 'APPLESCRIPT'
tell application "Google Chrome"
  execute active tab of front window javascript "
    (async () => {
      const el = document.createElement('pre');
      el.id = 'concurrency-test';
      el.style.cssText = 'font:11px monospace;padding:10px;background:#111;color:#0f0;white-space:pre-wrap;';
      document.body.prepend(el);
      function log(m) { el.textContent += m + '\\n'; }
      
      if (typeof LanguageModel === 'undefined') {
        log('FAIL: LanguageModel not available');
        return;
      }
      
      const schema = {
        type: 'object',
        properties: {
          primaryLabel: { type: 'string', enum: ['High Signal','Specific','Mixed','Generic','Engagement Bait','Low Signal','Unclear'] },
          color: { type: 'string', enum: ['green','yellow','orange','red','gray'] },
          confidence: { type: 'string', enum: ['low','medium','high'] },
          reasons: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
        },
        required: ['primaryLabel','color','confidence','reasons'],
      };
      
      const items = [
        'I shipped a billing change in April and reduced false positives from 18% to 4%.',
        'Hard truth: consistency beats talent. Read that again.',
        'We tested three rollout paths last quarter and picked the one with 12% fewer failures.',
        'Comment AI and I will send you the full template.',
      ];
      
      // --- Test 1: Sequential with one session ---
      log('--- Sequential (1 session, 4 prompts) ---');
      const session1 = await LanguageModel.create({ systemPrompt: 'You classify LinkedIn content.' });
      // Warm up
      await session1.prompt('Say OK');
      
      const seqStart = Date.now();
      for (const text of items) {
        const t0 = Date.now();
        await session1.prompt('Classify: ' + text, { responseConstraint: schema });
        log('  Item: ' + (Date.now() - t0) + 'ms');
      }
      const seqTotal = Date.now() - seqStart;
      log('  Total sequential: ' + seqTotal + 'ms');
      session1.destroy?.();
      
      // --- Test 2: Parallel with one session ---
      log('');
      log('--- Parallel (1 session, 4 concurrent prompts) ---');
      const session2 = await LanguageModel.create({ systemPrompt: 'You classify LinkedIn content.' });
      await session2.prompt('Say OK');
      
      const parStart = Date.now();
      const promises = items.map(async (text, i) => {
        const t0 = Date.now();
        try {
          await session2.prompt('Classify: ' + text, { responseConstraint: schema });
          return { i, elapsed: Date.now() - t0, ok: true };
        } catch(e) {
          return { i, elapsed: Date.now() - t0, ok: false, error: e.message };
        }
      });
      const parResults = await Promise.all(promises);
      const parTotal = Date.now() - parStart;
      for (const r of parResults) {
        log('  Item ' + r.i + ': ' + r.elapsed + 'ms ' + (r.ok ? 'OK' : 'FAIL: ' + r.error));
      }
      log('  Total parallel (1 session): ' + parTotal + 'ms');
      session2.destroy?.();
      
      // --- Test 3: Parallel with multiple sessions ---
      log('');
      log('--- Parallel (4 separate sessions) ---');
      const multiStart = Date.now();
      const multiPromises = items.map(async (text, i) => {
        const t0 = Date.now();
        try {
          const s = await LanguageModel.create({ systemPrompt: 'You classify LinkedIn content.' });
          await s.prompt('Classify: ' + text, { responseConstraint: schema });
          s.destroy?.();
          return { i, elapsed: Date.now() - t0, ok: true };
        } catch(e) {
          return { i, elapsed: Date.now() - t0, ok: false, error: e.message };
        }
      });
      const multiResults = await Promise.all(multiPromises);
      const multiTotal = Date.now() - multiStart;
      for (const r of multiResults) {
        log('  Item ' + r.i + ': ' + r.elapsed + 'ms ' + (r.ok ? 'OK' : 'FAIL: ' + r.error));
      }
      log('  Total parallel (4 sessions): ' + multiTotal + 'ms');
      
      log('');
      log('--- Summary ---');
      log('Sequential:          ' + seqTotal + 'ms');
      log('Parallel (1 session): ' + parTotal + 'ms');
      log('Parallel (4 sessions): ' + multiTotal + 'ms');
      log('Speedup (1 session):  ' + (seqTotal / parTotal).toFixed(1) + 'x');
      log('Speedup (4 sessions): ' + (seqTotal / multiTotal).toFixed(1) + 'x');
    })();
  "
  delay 180
  set result to execute active tab of front window javascript "document.getElementById('concurrency-test')?.textContent || 'NO_OUTPUT'"
  return result
end tell
APPLESCRIPT
)

echo "$RESULT"
echo ""
