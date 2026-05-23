const content = document.getElementById('content');
const statusEl = document.getElementById('status');

async function send(type) {
  return chrome.runtime.sendMessage({ type, source: 'popup', target: 'background', requestId: crypto.randomUUID() });
}

function ts(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

async function refresh() {
  statusEl.textContent = 'refreshing...';

  try {
    const [healthResp, debugResp, tmrResp] = await Promise.all([
      send('GET_HEALTH'),
      send('GET_DEBUG_STATE'),
      send('TMR_STATUS'),
    ]);

    let html = '';

    if (healthResp.ok && healthResp.payload.type === 'HEALTH_RESULT') {
      const h = healthResp.payload.health;
      html += '<div class="section"><h2>Health</h2><dl>';
      html += `<dt>Scoring mode</dt><dd>${esc(h.scoringMode)}</dd>`;
      html += `<dt>Items scored</dt><dd>${h.itemsScored}</dd>`;
      html += `<dt>Cache entries</dt><dd>${h.cacheEntries}</dd>`;
      html += `<dt>Cache hit rate</dt><dd>${(h.cacheHitRate * 100).toFixed(1)}%</dd>`;
      html += `<dt>Avg latency</dt><dd>${h.avgLatencyMs.toFixed(0)} ms</dd>`;
      html += `<dt>Queue depth</dt><dd>${h.queueDepth}</dd>`;
      html += `<dt>Failures</dt><dd>${h.failureCount}</dd>`;
      html += `<dt>Log entries</dt><dd>${h.logEntryCount}</dd>`;
      html += '</dl></div>';
    }

    if (tmrResp.ok && tmrResp.payload.type === 'TMR_STATUS_RESULT') {
      const t = tmrResp.payload;
      html += '<div class="section"><h2>TMR Model</h2><dl>';
      html += `<dt>Loaded</dt><dd>${t.isLoaded ? 'Yes' : 'No'}</dd>`;
      html += `<dt>Loading</dt><dd>${t.isLoading ? 'Yes' : 'No'}</dd>`;
      html += `<dt>Error</dt><dd>${esc(t.errorMessage || 'None')}</dd>`;
      html += '</dl></div>';
    }

    if (debugResp.ok && debugResp.payload.type === 'DEBUG_STATE_RESULT') {
      const d = debugResp.payload;
      html += '<div class="section"><h2>Debug State</h2><dl>';
      html += `<dt>Gemini</dt><dd>${esc(d.geminiAvailability)}</dd>`;
      html += `<dt>Scoring mode</dt><dd>${esc(d.scoringMode)}</dd>`;
      html += '</dl></div>';

      if (d.recentLogs && d.recentLogs.length > 0) {
        html += '<div class="section"><h2>Recent Logs (' + d.recentLogs.length + ')</h2>';
        for (const log of d.recentLogs.slice(-30)) {
          html += '<div class="log-entry">';
          html += `<span class="log-time">${ts(log.timestamp)}</span>`;
          html += `<span class="log-level log-level--${esc(log.level)}">${esc(log.level)}</span>`;
          html += `<span class="log-ctx">${esc(log.context)}</span>`;
          html += `<span class="log-msg">${esc(log.message)}</span>`;
          html += '</div>';
        }
        html += '</div>';
      }
    }

    content.innerHTML = html || 'No data received.';
    statusEl.textContent = 'updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'error: ' + e.message;
  }
}

const devToggle = document.getElementById('devModeToggle');

async function loadDevMode() {
  try {
    const result = await chrome.storage.local.get('userSettings');
    const settings = result.userSettings || {};
    devToggle.checked = settings.isDeveloperMode === true;
  } catch (e) {
    devToggle.checked = false;
  }
}

devToggle.addEventListener('change', async () => {
  const next = devToggle.checked;
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'SETTINGS_CHANGED',
      source: 'popup',
      target: 'background',
      requestId: crypto.randomUUID(),
      settings: { isDeveloperMode: next },
    });
    statusEl.textContent = 'Dev mode ' + (next ? 'enabled' : 'disabled');
  } catch (e) {
    statusEl.textContent = 'Toggle failed: ' + e.message;
    devToggle.checked = !next;
  }
});

document.getElementById('refresh').addEventListener('click', refresh);
loadDevMode();
refresh();

let pollId = setInterval(refresh, 3000);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(pollId);
    pollId = null;
  } else {
    if (pollId === null) {
      refresh();
      pollId = setInterval(refresh, 3000);
    }
  }
});
