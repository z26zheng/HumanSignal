#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUNDLE_DIR="$PROJECT_DIR/.output/chrome-mv3"

cd "$PROJECT_DIR"

echo "=== HumanSignal Live LinkedIn Test ==="
echo ""

echo "[1/5] Building extension..."
corepack pnpm build
echo ""

echo "[2/5] Killing Chrome and clearing stale extension storage..."
pkill -f "Google Chrome" 2>/dev/null || true
sleep 3
if pgrep -f "Google Chrome" > /dev/null 2>&1; then
  pkill -9 -f "Google Chrome" 2>/dev/null || true
  sleep 2
fi

echo "       Keeping extension storage (geminiStatus persists across launches)."
echo "       Chrome stopped."

echo "[3/5] Launching Chrome with extension and LinkedIn feed..."
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --profile-directory="Default" \
  --load-extension="$BUNDLE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "https://www.linkedin.com/feed/" \
  2>/dev/null &
CHROME_PID=$!

echo "       Waiting 15 seconds for page load..."
sleep 15

echo "[4/5] Reading diagnostics via AppleScript..."
DIAG=$(osascript << 'APPLESCRIPT'
tell application "Google Chrome"
  set diagResult to execute active tab of front window javascript "
    (() => {
      const stickers = document.querySelectorAll('.human-signal-sticker');
      const overlayRoot = document.getElementById('human-signal-overlay-root');
      const ids = Array.from(stickers).map(s => s.dataset.itemId ?? '');
      const labels = Array.from(stickers).map(s => s.textContent ?? '');
      const commentIds = ids.filter(id => id.includes('comment') || id.includes('urn:li:comment'));
      const postIds = ids.filter(id => !id.includes('comment') && !id.includes('urn:li:comment'));
      const positions = Array.from(stickers).map(s => s.style.transform);

      return JSON.stringify({
        url: location.pathname,
        title: document.title,
        overlayExists: !!overlayRoot,
        totalStickers: stickers.length,
        postStickers: postIds.length,
        commentStickers: commentIds.length,
        labels: labels.slice(0, 10),
        commentLabels: labels.filter((_, i) => commentIds.includes(ids[i])),
        commentContainersInDOM: document.querySelectorAll('div[componentkey*=\"replaceableComment_urn:li:comment\"]').length,
        listitemCount: document.querySelectorAll('[role=\"listitem\"]').length,
        expandableTextBoxCount: document.querySelectorAll('[data-testid=\"expandable-text-box\"]').length,
        positionedStickers: positions.filter(p => p && !p.includes('-9999')).length,
      }, null, 2);
    })();
  "
  return diagResult
end tell
APPLESCRIPT
)

echo ""
echo "[5/5] Results:"
echo "$DIAG"
echo ""

# Parse and summarize
TOTAL=$(echo "$DIAG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['totalStickers'])" 2>/dev/null || echo "?")
POSTS=$(echo "$DIAG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['postStickers'])" 2>/dev/null || echo "?")
COMMENTS=$(echo "$DIAG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['commentStickers'])" 2>/dev/null || echo "?")
POSITIONED=$(echo "$DIAG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['positionedStickers'])" 2>/dev/null || echo "?")

echo "Summary: $TOTAL stickers ($POSTS posts, $COMMENTS comments), $POSITIONED positioned on screen"
echo ""
echo "Chrome is still running. Close it when done."
