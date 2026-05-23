async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['LOCAL_STORAGE'],
    justification: 'Run TMR AI text detection model via ONNX Runtime.',
  });
  console.log('[background] Offscreen document created');
}

async function classifyText(text) {
  await ensureOffscreen();

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'CLASSIFY_TEXT', text }, (response) => {
      resolve(response);
    });
  });
}

async function checkStatus() {
  await ensureOffscreen();

  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'TMR_STATUS' }, (response) => {
      resolve(response);
    });
  });
}

// Expose to console for manual testing
globalThis.classifyText = classifyText;
globalThis.checkStatus = checkStatus;

// Auto-create offscreen on startup
ensureOffscreen().then(() => {
  console.log('[background] TMR test extension ready');
  console.log('  Use: classifyText("your text here")');
  console.log('  Use: checkStatus()');
});
