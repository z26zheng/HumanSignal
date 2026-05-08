#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_DIR="$PROJECT_DIR/.output/chrome-mv3"
EXT_ID="hoagjhaadmbfbgceiipccdgkjfghflnj"

cd "$PROJECT_DIR"

echo "=== Gemini Nano Live Integration Test ==="
echo ""

echo "[1/4] Building extension..."
corepack pnpm build
echo ""

echo "[2/4] Killing Chrome and clearing storage..."
pkill -f "Google Chrome" 2>/dev/null || true
sleep 3
rm -rf "$HOME/Library/Application Support/Google/Chrome/Default/Local Extension Settings/$EXT_ID" 2>/dev/null
echo "       Done."

echo "[3/4] Launching Chrome..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --profile-directory="Default" \
  --load-extension="$BUNDLE_DIR" \
  --no-first-run --no-default-browser-check \
  "chrome-extension://$EXT_ID/offscreen.html" \
  2>/dev/null &
sleep 8

echo "[4/4] Running Gemini scoring tests from offscreen document..."
echo ""

RESULT=$(osascript << 'APPLESCRIPT'
tell application "Google Chrome"
  execute active tab of front window javascript "
    (async () => {
      const el = document.createElement('pre');
      el.id = 'test-output';
      el.style.cssText = 'font:11px monospace;padding:10px;background:#111;color:#0f0;white-space:pre-wrap;';
      document.body.prepend(el);
      
      function log(msg) { el.textContent += msg + '\\n'; }
      
      const tests = [
        { type: 'post', text: 'I shipped a billing alert change in April 2026 and reduced false positives from 18% to 4%.' },
        { type: 'post', text: 'Comment AI and I will send you the full template.' },
        { type: 'post', text: 'Hard truth: consistency beats talent. Read that again.' },
        { type: 'comment', text: 'Great insights' },
        { type: 'comment', text: 'How did you decide which tradeoffs mattered first when the team disagreed?' },
        { type: 'post', text: 'We tested three rollout paths last quarter and picked the one with 12% fewer failures.' },
      ];
      
      const schema = {
        type: 'object',
        properties: {
          primaryLabel: { type: 'string', enum: ['High Signal','Specific','Thoughtful','Question','Mixed','Generic','Low Effort','Engagement Bait','Low Signal','Unclear'] },
          color: { type: 'string', enum: ['green','yellow','orange','red','gray'] },
          confidence: { type: 'string', enum: ['low','medium','high'] },
          dimensions: {
            type: 'object',
            properties: {
              authenticity: { type: 'number' },
              originality: { type: 'number' },
              specificity: { type: 'number' },
              engagementBait: { type: 'number' },
              templating: { type: 'number' },
              usefulness: { type: 'number' },
            },
            required: ['authenticity','originality','specificity','engagementBait','templating','usefulness'],
          },
          reasons: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
        },
        required: ['primaryLabel','color','confidence','dimensions','reasons'],
      };
      
      log('--- Step 1: Check LanguageModel ---');
      log('typeof LanguageModel: ' + typeof LanguageModel);
      if (typeof LanguageModel === 'undefined') {
        log('FAIL: LanguageModel not available');
        return;
      }
      
      log('--- Step 2: Check availability ---');
      try {
        const avail = await LanguageModel.availability();
        log('availability: ' + avail);
        if (avail !== 'available') {
          log('FAIL: Model not available (' + avail + ')');
          return;
        }
      } catch(e) {
        log('FAIL availability: ' + e.message);
        return;
      }
      
      log('--- Step 3: Create session ---');
      let session;
      try {
        const t0 = Date.now();
        session = await LanguageModel.create({
          systemPrompt: 'You are a content quality classifier for LinkedIn posts and comments. Classify the given text and return a JSON object. Focus on signal quality, specificity, and originality. Be conservative: prefer Unclear over overconfident labels.'
        });
        log('Session created in ' + (Date.now() - t0) + 'ms');
      } catch(e) {
        log('FAIL create: ' + e.message);
        return;
      }
      
      log('--- Step 4: Score test items ---');
      let passed = 0;
      let failed = 0;
      
      for (let i = 0; i < tests.length; i++) {
        const item = tests[i];
        const prompt = 'Classify this LinkedIn ' + item.type + ':\\n---\\n' + item.text + '\\n---';
        
        try {
          const t0 = Date.now();
          const result = await session.prompt(prompt, { responseConstraint: schema });
          const elapsed = Date.now() - t0;
          
          const parsed = JSON.parse(result);
          const hasLabel = !!parsed.primaryLabel;
          const hasColor = !!parsed.color;
          const hasConf = !!parsed.confidence;
          const hasDims = !!parsed.dimensions;
          const hasReasons = Array.isArray(parsed.reasons) && parsed.reasons.length >= 2;
          const isValid = hasLabel && hasColor && hasConf && hasDims && hasReasons;
          
          if (isValid) {
            passed++;
            log('PASS [' + elapsed + 'ms] ' + item.type + ': ' + parsed.primaryLabel + ' (' + parsed.confidence + ') - ' + parsed.reasons[0]?.slice(0, 40));
          } else {
            failed++;
            log('FAIL [' + elapsed + 'ms] ' + item.type + ': Missing fields. Got: ' + result.slice(0, 80));
          }
        } catch(e) {
          failed++;
          log('ERROR [' + item.type + ']: ' + e.message);
        }
      }
      
      session.destroy?.();
      
      log('');
      log('--- Results ---');
      log('Passed: ' + passed + '/' + tests.length);
      log('Failed: ' + failed + '/' + tests.length);
      log(passed === tests.length ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
    })();
  "
  
  -- Wait for all tests to complete (each takes ~15-20s)
  delay 150
  
  set result to execute active tab of front window javascript "document.getElementById('test-output')?.textContent || 'NO_OUTPUT'"
  return result
end tell
APPLESCRIPT
)

echo "$RESULT"
echo ""
echo "Done."
