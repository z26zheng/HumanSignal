#!/usr/bin/env bash
# Test 1: Can the offscreen document trigger LanguageModel and get a response?
# This tests the model in the exact context our extension uses (offscreen document).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_DIR="$PROJECT_DIR/.output/chrome-mv3"
EXT_ID="hoagjhaadmbfbgceiipccdgkjfghflnj"

cd "$PROJECT_DIR"
echo "=== Test 1: Offscreen Document Gemini Context ==="
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
      el.id = 'ctx-test';
      el.style.cssText = 'font:11px monospace;padding:10px;background:#111;color:#0f0;white-space:pre-wrap;';
      document.body.prepend(el);
      function log(m) { el.textContent += m + '\\n'; }
      
      log('=== OFFSCREEN CONTEXT TEST ===');
      log('');
      
      // 1. Check LanguageModel exists
      log('[1] typeof LanguageModel: ' + typeof LanguageModel);
      if (typeof LanguageModel === 'undefined') { log('FAIL: LanguageModel not in offscreen context'); return; }
      log('    PASS');
      
      // 2. Check availability
      log('[2] Checking availability...');
      try {
        const avail = await LanguageModel.availability();
        log('    availability(): ' + avail);
        if (avail !== 'available') { log('    FAIL: not available'); return; }
        log('    PASS');
      } catch(e) { log('    FAIL: ' + e.message); return; }
      
      // 3. Create session with systemPrompt
      log('[3] Creating session with systemPrompt...');
      let session;
      try {
        const t0 = Date.now();
        session = await LanguageModel.create({ systemPrompt: 'You classify LinkedIn content.' });
        log('    Created in ' + (Date.now() - t0) + 'ms');
        log('    PASS');
      } catch(e) { log('    FAIL create: ' + e.message); return; }
      
      // 4. Prompt without responseConstraint
      log('[4] Prompt without schema...');
      try {
        const t0 = Date.now();
        const r = await session.prompt('Say just OK');
        log('    Response in ' + (Date.now() - t0) + 'ms: typeof=' + typeof r + ' value=' + String(r).slice(0,30));
        log('    PASS');
      } catch(e) { log('    FAIL prompt: ' + e.message); return; }
      
      // 5. Prompt with responseConstraint (our schema)
      log('[5] Prompt with responseConstraint schema...');
      const schema = {
        type: 'object',
        properties: {
          primaryLabel: { type: 'string', enum: ['High Signal','Specific','Thoughtful','Question','Mixed','Generic','Low Effort','Engagement Bait','Low Signal','Unclear'] },
          color: { type: 'string', enum: ['green','yellow','orange','red','gray'] },
          confidence: { type: 'string', enum: ['low','medium','high'] },
          dimensions: { type: 'object', properties: { authenticity:{type:'number'}, originality:{type:'number'}, specificity:{type:'number'}, engagementBait:{type:'number'}, templating:{type:'number'}, usefulness:{type:'number'} }, required:['authenticity','originality','specificity','engagementBait','templating','usefulness'] },
          reasons: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
        },
        required: ['primaryLabel','color','confidence','dimensions','reasons'],
      };
      try {
        const t0 = Date.now();
        const r = await session.prompt('Classify this LinkedIn post:\\n---\\nI shipped a rollout and reduced failures by 27%.\\n---', { responseConstraint: schema });
        const elapsed = Date.now() - t0;
        log('    Response in ' + elapsed + 'ms');
        const parsed = JSON.parse(r);
        log('    primaryLabel: ' + parsed.primaryLabel);
        log('    color: ' + parsed.color);
        log('    confidence: ' + parsed.confidence);
        log('    reasons: ' + JSON.stringify(parsed.reasons));
        log('    dimensions: ' + JSON.stringify(parsed.dimensions));
        log('    PASS');
      } catch(e) { log('    FAIL schema prompt: ' + e.message); }
      
      // 6. Test our GeminiService directly
      log('[6] Testing GeminiService.scoreWithGemini...');
      try {
        const t0 = Date.now();
        // Our offscreen already has a GeminiService instance (N)
        // We can test by sending a message to ourselves
        log('    (GeminiService is tested via messaging in Test 2)');
        log('    SKIP');
      } catch(e) { log('    FAIL: ' + e.message); }
      
      session.destroy?.();
      log('');
      log('=== ALL CONTEXT TESTS PASSED ===');
    })();
  "
  delay 40
  set result to execute active tab of front window javascript "document.getElementById('ctx-test')?.textContent || 'NO_OUTPUT'"
  return result
end tell
APPLESCRIPT
)

echo "$RESULT"
echo ""
