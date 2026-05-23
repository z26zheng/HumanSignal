import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';

let detector = null;
let loadError = null;

async function initModel() {
  const t0 = performance.now();
  try {
    detector = await pipeline(
      'text-classification',
      'onnx-community/tmr-ai-text-detector-ONNX',
      { dtype: 'q4' }
    );
    const loadTime = Math.round(performance.now() - t0);
    console.log(`[offscreen] TMR model loaded in ${loadTime}ms`);
    return { ok: true, loadTime };
  } catch (err) {
    loadError = err.message;
    console.error('[offscreen] TMR model failed to load:', err);
    return { ok: false, error: err.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TMR_STATUS') {
    sendResponse({
      loaded: detector !== null,
      error: loadError,
    });
    return false;
  }

  if (message.type === 'CLASSIFY_TEXT') {
    if (!detector) {
      sendResponse({ ok: false, error: 'Model not loaded' });
      return false;
    }

    const t0 = performance.now();
    detector(message.text).then(result => {
      const latency = Math.round(performance.now() - t0);
      sendResponse({
        ok: true,
        label: result[0].label,
        score: result[0].score,
        latencyMs: latency,
      });
    }).catch(err => {
      sendResponse({ ok: false, error: err.message });
    });

    return true; // async response
  }
});

// Start loading immediately
initModel();
