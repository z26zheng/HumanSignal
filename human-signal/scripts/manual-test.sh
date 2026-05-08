#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUNDLE_DIR="$PROJECT_DIR/.output/chrome-mv3"

cd "$PROJECT_DIR"

echo "=== HumanSignal Manual Test Runner ==="
echo ""

# 1. Install deps if needed
if [ ! -d "node_modules" ]; then
  echo "[1/5] Installing dependencies..."
  corepack pnpm install
else
  echo "[1/5] Dependencies already installed."
fi

# 2. Type-check
echo "[2/5] Type-checking..."
corepack pnpm compile

# 3. Build
echo "[3/5] Building extension..."
corepack pnpm build
echo "      Bundle: $BUNDLE_DIR"
echo ""

# 4. Verify bundle exists
if [ ! -f "$BUNDLE_DIR/manifest.json" ]; then
  echo "ERROR: Build failed — $BUNDLE_DIR/manifest.json not found."
  exit 1
fi

echo "[4/5] Bundle ready. Size summary:"
du -sh "$BUNDLE_DIR"
echo ""

# 5. Launch Chrome with extension loaded
echo "[5/5] Launching Chrome with HumanSignal loaded..."
echo ""
echo "  - LinkedIn feed will open automatically."
echo "  - Click a Signal Sticker to see the explanation popover."
echo "  - Click the extension icon (puzzle piece → HumanSignal) for the popup."
echo "  - Open DevTools → Console to check for errors."
echo "  - Close Chrome when done testing."
echo ""

CHROME_APP=""
if [ -d "/Applications/Google Chrome.app" ]; then
  CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [ -d "/Applications/Google Chrome Canary.app" ]; then
  CHROME_APP="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"
elif [ -d "/Applications/Chromium.app" ]; then
  CHROME_APP="/Applications/Chromium.app/Contents/MacOS/Chromium"
elif command -v google-chrome &>/dev/null; then
  CHROME_APP="google-chrome"
elif command -v chromium-browser &>/dev/null; then
  CHROME_APP="chromium-browser"
fi

if [ -z "$CHROME_APP" ]; then
  echo "Chrome not found automatically."
  echo ""
  echo "Load the extension manually:"
  echo "  1. Open chrome://extensions/"
  echo "  2. Enable Developer Mode"
  echo "  3. Click 'Load unpacked' and select:"
  echo "     $BUNDLE_DIR"
  echo "  4. Navigate to https://www.linkedin.com/feed/"
  exit 0
fi

TEMP_PROFILE="$(mktemp -d -t humansignal-test-profile)"

"$CHROME_APP" \
  --user-data-dir="$TEMP_PROFILE" \
  --disable-extensions-except="$BUNDLE_DIR" \
  --load-extension="$BUNDLE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "https://www.linkedin.com/feed/" \
  2>/dev/null

echo ""
echo "Chrome closed. Cleaning up temp profile..."
rm -rf "$TEMP_PROFILE"
echo "Done."
