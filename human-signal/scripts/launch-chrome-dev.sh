#!/usr/bin/env bash
# Launch Chrome with the z26zheng (Default) profile, the HumanSignal extension,
# and CDP enabled on port 9222 so the Browserbase Browse MCP plugin can attach.
#
# Usage:
#   bash scripts/launch-chrome-dev.sh
#
# The Cursor Browse plugin reads BROWSE_WS=ws://localhost:9222 from its .env
# and connects directly to this Chrome instance — no separate daemon needed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUNDLE_DIR="$PROJECT_DIR/.output/chrome-mv3"
CHROME_APP="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
CDP_PORT=9222

# Verify the extension bundle exists
if [ ! -f "$BUNDLE_DIR/manifest.json" ]; then
  echo "ERROR: Extension bundle not found at $BUNDLE_DIR"
  echo "Run 'pnpm build' first."
  exit 1
fi

# Check if another Chrome already owns port $CDP_PORT
if lsof -iTCP:$CDP_PORT -sTCP:LISTEN -t &>/dev/null; then
  echo "Port $CDP_PORT already in use — a CDP-enabled Chrome may already be running."
  echo "Verify with: curl -s http://localhost:$CDP_PORT/json/version"
  exit 0
fi

echo "Launching Chrome (z26zheng profile) with CDP on port $CDP_PORT..."
echo "  Extension: $BUNDLE_DIR"
echo "  Profile:   Default (z26zheng@gmail.com)"
echo ""

"$CHROME_APP" \
  --profile-directory=Default \
  --load-extension="$BUNDLE_DIR" \
  --remote-debugging-port=$CDP_PORT \
  --no-first-run \
  --no-default-browser-check \
  "https://www.linkedin.com/feed/" \
  2>/dev/null &

# Wait for CDP to become available
echo -n "Waiting for CDP..."
for i in $(seq 1 20); do
  if curl -sf "http://localhost:$CDP_PORT/json/version" &>/dev/null; then
    echo " ready."
    echo ""
    echo "Chrome is running with CDP on ws://localhost:$CDP_PORT"
    echo "The Browse MCP plugin will connect automatically."
    exit 0
  fi
  sleep 0.5
  echo -n "."
done

echo ""
echo "WARNING: CDP did not become available within 10 seconds."
echo "Try: curl http://localhost:$CDP_PORT/json/version"
