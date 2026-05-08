#!/usr/bin/env bash
# Test 2: Does the background<->offscreen messaging roundtrip work for GEMINI_PROMPT?
# This tests the exact message path: content -> background -> offscreen -> background -> content
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_DIR="$PROJECT_DIR/.output/chrome-mv3"
EXT_ID="hoagjhaadmbfbgceiipccdgkjfghflnj"

cd "$PROJECT_DIR"
echo "=== Test 2: Gemini Messaging Roundtrip ==="
echo ""

corepack pnpm build 2>&1 | tail -1
pkill -f "Google Chrome" 2>/dev/null || true; sleep 3

"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --profile-directory="Default" \
  --load-extension="$BUNDLE_DIR" \
  --no-first-run --no-default-browser-check \
  "https://www.linkedin.com/feed/" \
  2>/dev/null &
sleep 12

echo "Testing messaging via background service worker..."
echo ""

# Use the extension's popup page which HAS chrome.runtime
RESULT=$(osascript << APPLESCRIPT2
tell application "Google Chrome"
  set URL of active tab of front window to "chrome-extension://$EXT_ID/popup.html"
end tell
APPLESCRIPT2
)
sleep 3

RESULT=$(osascript << 'APPLESCRIPT'
tell application "Google Chrome"
  execute active tab of front window javascript "
    (async () => {
      const el = document.createElement('pre');
      el.id = 'msg-test';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;font:11px monospace;padding:10px;background:#111;color:#0f0;white-space:pre-wrap;max-height:80vh;overflow:auto;';
      document.body.prepend(el);
      function log(m) { el.textContent += m + '\\n'; }
      
      log('=== MESSAGING ROUNDTRIP TEST ===');
      log('Context: offscreen document (has chrome.runtime)');
      log('');
      
      function sendMsg(msg) {
        return new Promise((resolve, reject) => {
          try {
            chrome.runtime.sendMessage(msg, response => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          } catch(e) { reject(e); }
        });
      }
      
      // 1. PING -> background (baseline)
      log('[1] PING -> background...');
      try {
        const t0 = Date.now();
        const r = await sendMsg({ type: 'PING', requestId: crypto.randomUUID(), source: 'popup', target: 'background' });
        log('    Response in ' + (Date.now() - t0) + 'ms: ok=' + r?.ok + ' type=' + r?.payload?.type);
        log('    PASS');
      } catch(e) { log('    FAIL: ' + e.message); }
      
      // 2. CHECK_GEMINI_STATUS -> background -> offscreen
      log('[2] CHECK_GEMINI_STATUS -> background -> offscreen...');
      try {
        const t0 = Date.now();
        const r = await sendMsg({ type: 'CHECK_GEMINI_STATUS', requestId: crypto.randomUUID(), source: 'popup', target: 'background' });
        const elapsed = Date.now() - t0;
        log('    Response in ' + elapsed + 'ms: ok=' + r?.ok);
        log('    Type: ' + r?.payload?.type);
        log('    Status: ' + JSON.stringify(r?.payload?.status));
        if (r?.ok && r?.payload?.status?.availability) log('    PASS'); else log('    FAIL: unexpected response');
      } catch(e) { log('    FAIL: ' + e.message); }
      
      // 3. GEMINI_PROMPT -> background -> offscreen (the critical path)
      log('[3] GEMINI_PROMPT -> background -> offscreen...');
      log('    (This is the critical test - should take 15-20s for first, ~3s after)');
      const testItem = {
        itemId: 'msg-test-1',
        itemType: 'post',
        text: 'I shipped a billing change in April and reduced false positives from 18% to 4%.',
        metadata: { contentHash: 'hash_msgtest1', sourceUrl: null, detectedAt: Date.now(), idStability: 'content-hash' },
        isTruncated: false,
      };
      try {
        const t0 = Date.now();
        const r = await sendMsg({ type: 'GEMINI_PROMPT', requestId: crypto.randomUUID(), source: 'popup', target: 'background', item: testItem });
        const elapsed = Date.now() - t0;
        log('    Response in ' + elapsed + 'ms: ok=' + r?.ok);
        if (r?.ok) {
          log('    Payload type: ' + r?.payload?.type);
          if (r?.payload?.result) {
            log('    Result label: ' + r.payload.result.label);
            log('    Result source: ' + r.payload.result.source);
            log('    Result confidence: ' + r.payload.result.confidence);
            log('    Result explanation: ' + r.payload.result.explanation?.slice(0, 60));
            if (r.payload.result.source === 'gemini') log('    PASS: AI-enhanced scoring works!');
            else log('    PARTIAL: Got result but source is ' + r.payload.result.source + ' (rules fallback)');
          } else {
            log('    Result: null (Gemini returned null, will fall back to rules)');
            log('    Status: ' + JSON.stringify(r?.payload?.status));
            log('    FAIL: Gemini prompt returned null');
          }
        } else {
          log('    Error: ' + JSON.stringify(r?.error));
          log('    FAIL: Message failed');
        }
      } catch(e) {
        log('    FAIL: ' + e.message);
        log('    (Timeout or channel closed - this is the known issue)');
      }
      
      // 4. Second GEMINI_PROMPT (should be faster with warm session)
      log('[4] Second GEMINI_PROMPT (warm session)...');
      const testItem2 = {
        ...testItem,
        itemId: 'msg-test-2',
        text: 'Comment AI and I will send you the full template.',
        metadata: { ...testItem.metadata, contentHash: 'hash_msgtest2' },
      };
      try {
        const t0 = Date.now();
        const r = await sendMsg({ type: 'GEMINI_PROMPT', requestId: crypto.randomUUID(), source: 'popup', target: 'background', item: testItem2 });
        const elapsed = Date.now() - t0;
        log('    Response in ' + elapsed + 'ms: ok=' + r?.ok);
        if (r?.ok && r?.payload?.result) {
          log('    Label: ' + r.payload.result.label + ' source: ' + r.payload.result.source);
          if (r.payload.result.source === 'gemini') log('    PASS');
          else log('    PARTIAL: rules fallback');
        } else {
          log('    FAIL: ' + JSON.stringify(r?.error || r?.payload));
        }
      } catch(e) { log('    FAIL: ' + e.message); }
      
      // 5. SCORE_BATCH with mode check
      log('[5] GET_HEALTH to check scoring mode...');
      try {
        const r = await sendMsg({ type: 'GET_HEALTH', requestId: crypto.randomUUID(), source: 'popup', target: 'background' });
        if (r?.ok && r?.payload?.health) {
          log('    Mode: ' + r.payload.health.scoringMode);
          log('    Items scored: ' + r.payload.health.itemsScored);
          log('    Failures: ' + r.payload.health.failureCount);
          log('    Queue: ' + r.payload.health.queueDepth);
        }
      } catch(e) { log('    FAIL: ' + e.message); }
      
      log('');
      log('=== MESSAGING TEST COMPLETE ===');
    })();
  "
  delay 90
  set result to execute active tab of front window javascript "document.getElementById('msg-test')?.textContent || 'NO_OUTPUT'"
  return result
end tell
APPLESCRIPT
)

echo "$RESULT"
echo ""
