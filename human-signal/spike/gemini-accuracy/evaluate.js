// Gemini Nano Benchmark Harness
// Runs in Chrome with LanguageModel API available (no extension needed)

const LABEL_MAP = {
  'feels human': 'feels-human',
  'possibly ai': 'possibly-ai',
  'likely ai': 'likely-ai',
  'almost certainly ai': 'almost-certainly-ai',
  "can't tell": 'cant-tell',
  'cant tell': 'cant-tell',
};

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    primaryLabel: {
      type: 'string',
      enum: ['Feels Human', 'Possibly AI', 'Likely AI', 'Almost Certainly AI', "Can't Tell"],
    },
    color: { type: 'string', enum: ['green', 'yellow', 'orange', 'red', 'gray'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
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
      required: ['authenticity', 'originality', 'specificity', 'engagementBait', 'templating', 'usefulness'],
    },
    reasons: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
  },
  required: ['primaryLabel', 'color', 'confidence', 'dimensions', 'reasons'],
};

// Prompt configs - add new variants here
const PROMPT_CONFIGS = {
  baseline: {
    name: 'baseline',
    systemPrompt: [
      'You are a content quality classifier for LinkedIn posts and comments.',
      'Your job is to assess whether the content feels genuinely human-written or AI-generated.',
      'Focus on personal specificity, concrete details, original thinking, and human voice.',
      'Do not make binary AI detection claims. Use probabilistic language.',
      'Be conservative: prefer "Can\'t Tell" over overconfident negative labels for ambiguous content.',
      'Describe the content signals, never judge the author.',
    ].join(' '),
    fewShot: [],
  },
  'detection-v1': {
    name: 'detection-v1',
    systemPrompt: [
      'You are an AI-generated content detector for LinkedIn posts and comments.',
      'Your job is to assess whether the content feels genuinely human-written or AI-generated.',
      '',
      'Use these signals to make your assessment:',
      '- Sentence length variation: humans vary naturally, AI produces uniform sentence lengths',
      '- Contractions: humans use contractions (I\'m, we\'ve, don\'t), AI often expands them',
      '- AI vocabulary markers: delve, intricate, meticulous, leverage, tapestry, pivotal, utilize, comprehensive, robust, foster',
      '- Genuine uncertainty: humans say "I think," "maybe," "not sure" — AI uses formulaic hedges like "it is important to note"',
      '- Structural regularity: AI produces uniform paragraphs, excessive transition words, balanced parallel structures',
      '- Personal specificity: real names, dates, numbers tied to personal experience vs fabricated-sounding details',
      '- Emotional authenticity: genuine frustration, self-deprecation, unresolved tension vs polished wisdom',
      '',
      'Be conservative: prefer "Can\'t Tell" for genuinely ambiguous content.',
      'Do not make binary AI detection claims. Use probabilistic language.',
      'Describe the content signals, never judge the author.',
    ].join('\n'),
    fewShot: [
      {
        role: 'user',
        content: 'Classify this LinkedIn post:\n\n---\nI spent two years building the wrong product. We had customers, revenue, even a waitlist. But I was solving a problem I imagined, not one I verified. The hardest part was admitting it to my co-founder.\n---\n\nReturn JSON matching the schema.',
      },
      {
        role: 'assistant',
        content: '{"primaryLabel":"Feels Human","color":"green","confidence":"high","dimensions":{"authenticity":0.9,"originality":0.8,"specificity":0.7,"engagementBait":0.0,"templating":0.0,"usefulness":0.7},"reasons":["Personal failure story with emotional honesty and self-deprecation","Specific relationship detail (co-founder) and genuine unresolved tension"]}',
      },
      {
        role: 'user',
        content: 'Classify this LinkedIn post:\n\n---\nHard truth: consistency beats talent every single time. The people who show up every day, even when motivation fades, are the ones who build something lasting. Read that again.\n---\n\nReturn JSON matching the schema.',
      },
      {
        role: 'assistant',
        content: '{"primaryLabel":"Likely AI","color":"orange","confidence":"high","dimensions":{"authenticity":0.1,"originality":0.1,"specificity":0.0,"engagementBait":0.3,"templating":0.8,"usefulness":0.2},"reasons":["Template motivational structure with no personal context","Uses \\"read that again\\" cliche and uniform sentence structure"]}',
      },
      {
        role: 'user',
        content: 'Classify this LinkedIn comment:\n\n---\nGreat insights\n---\n\nReturn JSON matching the schema.',
      },
      {
        role: 'assistant',
        content: '{"primaryLabel":"Almost Certainly AI","color":"red","confidence":"high","dimensions":{"authenticity":0.0,"originality":0.0,"specificity":0.0,"engagementBait":0.0,"templating":0.9,"usefulness":0.0},"reasons":["Two-word generic praise with no specific connection to content","Matches common automated engagement comment pattern"]}',
      },
    ],
  },
};

let evalSet = null;
let lastResults = null;

async function loadEvalSet() {
  const resp = await fetch('evaluation-set.json');
  evalSet = await resp.json();
  return evalSet;
}

function mapLabel(raw) {
  if (typeof raw !== 'string') return null;
  return LABEL_MAP[raw.trim().toLowerCase()] ?? null;
}

function parseResponse(text) {
  try {
    const parsed = typeof text === 'string' ? JSON.parse(text) : text;
    if (parsed && typeof parsed.primaryLabel === 'string') {
      return { label: mapLabel(parsed.primaryLabel), confidence: parsed.confidence ?? null, raw: parsed };
    }
    return null;
  } catch {
    return null;
  }
}

function coerceToString(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

window.runBenchmark = async function () {
  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results');
  const runBtn = document.getElementById('runBtn');
  const configName = document.getElementById('promptConfigName').value.trim();
  const repeatCount = parseInt(document.getElementById('repeatCount').value);

  const config = PROMPT_CONFIGS[configName];
  if (!config) {
    statusEl.textContent = `Unknown prompt config: "${configName}". Available: ${Object.keys(PROMPT_CONFIGS).join(', ')}`;
    return;
  }

  runBtn.disabled = true;
  resultsEl.textContent = '';

  if (!evalSet) {
    statusEl.textContent = 'Loading evaluation set...';
    await loadEvalSet();
  }

  statusEl.textContent = `Checking LanguageModel availability...`;

  const lm = typeof LanguageModel !== 'undefined' ? LanguageModel : (self.ai?.languageModel ?? null);
  if (!lm) {
    statusEl.textContent = 'ERROR: LanguageModel API not available in this browser.';
    runBtn.disabled = false;
    return;
  }

  let avail = await lm.availability();
  if (avail !== 'available' && avail !== 'readily') {
    if (avail === 'downloadable' || avail === 'after-download' || avail === 'downloading') {
      statusEl.textContent = `Model is "${avail}". Attempting to trigger download and wait...`;
      try {
        const session = await lm.create({
          systemPrompt: 'test',
          monitor: (m) => {
            m.addEventListener('downloadprogress', (e) => {
              statusEl.textContent = `Downloading model... ${Math.round(e.loaded * 100)}%`;
            });
          },
        });
        session.destroy();
        avail = await lm.availability();
        statusEl.textContent = `Model downloaded. Availability: ${avail}`;
      } catch (e) {
        statusEl.textContent = `ERROR downloading model: ${e.message}`;
        runBtn.disabled = false;
        return;
      }
    } else {
      statusEl.textContent = `ERROR: LanguageModel availability = "${avail}". Need "available" or "readily".`;
      runBtn.disabled = false;
      return;
    }
  }

  statusEl.textContent = `Creating session with config "${configName}"...`;

  const createOptions = { systemPrompt: config.systemPrompt };
  if (config.fewShot.length > 0) {
    createOptions.initialPrompts = config.fewShot;
  }

  let session;
  try {
    session = await lm.create(createOptions);
  } catch (e) {
    statusEl.textContent = `ERROR creating session: ${e.message}`;
    runBtn.disabled = false;
    return;
  }

  const items = evalSet.items;
  const results = [];
  const startTime = Date.now();
  let exact = 0;
  let acceptable = 0;
  let invalidJson = 0;
  const confusion = {};
  const categoryResults = {};
  const latencies = [];

  const log = (text, cls) => {
    const span = document.createElement('span');
    span.className = cls || '';
    span.textContent = text + '\n';
    resultsEl.appendChild(span);
    resultsEl.scrollTop = resultsEl.scrollHeight;
  };

  log(`Benchmark: ${configName} | ${items.length} items | repeat=${repeatCount}`);
  log(`System prompt: ${config.systemPrompt.substring(0, 100)}...`);
  log(`Few-shot examples: ${config.fewShot.length / 2}`);
  log('─'.repeat(60));

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    statusEl.textContent = `Scoring ${i + 1}/${items.length}: ${item.id} (${item.category})`;

    const itemKind = item.itemType === 'post' ? 'post' : 'comment';
    const text = item.text.length > 6000 ? item.text.substring(0, 6000) + '\n[truncated]' : item.text;
    const userPrompt = `Classify this LinkedIn ${itemKind}:\n\n---\n${text}\n---\n\nAssess whether it feels genuinely human-written or AI-generated. Focus on personal specificity, concrete details, and original voice. Return JSON matching the schema.`;

    let bestLabel = null;
    let bestConfidence = null;
    let bestRaw = null;
    let itemLatency = 0;
    let labelsFromRepeats = [];

    for (let r = 0; r < repeatCount; r++) {
      const t0 = Date.now();
      try {
        const rawResponse = await session.prompt(userPrompt, { responseConstraint: RESULT_SCHEMA });
        const responseText = coerceToString(rawResponse);
        const parsed = parseResponse(responseText);
        itemLatency += Date.now() - t0;

        if (parsed && parsed.label) {
          labelsFromRepeats.push(parsed.label);
          if (!bestLabel) {
            bestLabel = parsed.label;
            bestConfidence = parsed.confidence;
            bestRaw = parsed.raw;
          }
        } else {
          invalidJson++;
          labelsFromRepeats.push(null);
        }
      } catch (e) {
        itemLatency += Date.now() - t0;
        invalidJson++;
        labelsFromRepeats.push(null);
        log(`  ERROR on ${item.id}: ${e.message}`, 'fail');
      }
    }

    const avgLatency = Math.round(itemLatency / repeatCount);
    latencies.push(avgLatency);

    const isExact = bestLabel === item.expectedLabel;
    const isAcceptable = bestLabel !== null && item.acceptableLabels.includes(bestLabel);

    if (isExact) exact++;
    if (isAcceptable) acceptable++;

    const key = `${item.expectedLabel}->${bestLabel ?? 'null'}`;
    confusion[key] = (confusion[key] ?? 0) + 1;

    if (!categoryResults[item.category]) {
      categoryResults[item.category] = { total: 0, exact: 0, acceptable: 0, items: [] };
    }
    categoryResults[item.category].total++;
    if (isExact) categoryResults[item.category].exact++;
    if (isAcceptable) categoryResults[item.category].acceptable++;
    categoryResults[item.category].items.push({
      id: item.id,
      expected: item.expectedLabel,
      actual: bestLabel,
      acceptable: isAcceptable,
      latencyMs: avgLatency,
    });

    const consistent = repeatCount > 1 ? (new Set(labelsFromRepeats.filter(Boolean)).size <= 1 ? '✓' : '✗') : '';
    const icon = isAcceptable ? '✓' : '✗';
    const cls = isAcceptable ? 'pass' : 'fail';
    log(`${icon} ${item.id.padEnd(22)} expected=${item.expectedLabel.padEnd(20)} got=${(bestLabel ?? 'null').padEnd(20)} ${avgLatency}ms ${consistent}`, cls);

    results.push({
      id: item.id,
      category: item.category,
      difficulty: item.difficulty,
      expected: item.expectedLabel,
      actual: bestLabel,
      confidence: bestConfidence,
      acceptable: isAcceptable,
      exact: isExact,
      latencyMs: avgLatency,
      repeats: labelsFromRepeats,
    });
  }

  session.destroy();

  const elapsed = Date.now() - startTime;
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] ?? 0;
  const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

  log('');
  log('═'.repeat(60));
  log(`RESULTS: ${configName}`);
  log('═'.repeat(60));
  log(`Items:              ${items.length}`);
  log(`Exact accuracy:     ${exact}/${items.length} (${(exact / items.length * 100).toFixed(1)}%)`);
  log(`Acceptable accuracy: ${acceptable}/${items.length} (${(acceptable / items.length * 100).toFixed(1)}%)`);
  log(`Invalid JSON:       ${invalidJson}`);
  log(`Avg latency:        ${avgLatency}ms`);
  log(`P95 latency:        ${p95}ms`);
  log(`Total time:         ${(elapsed / 1000).toFixed(1)}s`);
  log('');
  log('── Per-Category Accuracy ──');
  for (const [cat, data] of Object.entries(categoryResults).sort()) {
    const pct = (data.acceptable / data.total * 100).toFixed(0);
    const cls = data.acceptable / data.total >= 0.8 ? 'pass' : (data.acceptable / data.total >= 0.6 ? 'warn' : 'fail');
    log(`  ${cat.padEnd(35)} ${data.acceptable}/${data.total} (${pct}%)`, cls);
  }
  log('');
  log('── Confusion Matrix ──');
  for (const [key, count] of Object.entries(confusion).sort()) {
    log(`  ${key}: ${count}`);
  }

  const disagreements = results.filter(r => !r.acceptable);
  if (disagreements.length > 0) {
    log('');
    log(`── Disagreements (${disagreements.length}) ──`);
    for (const d of disagreements) {
      log(`  ${d.id}: expected=${d.expected}, got=${d.actual}, category=${d.category}`, 'fail');
    }
  }

  lastResults = {
    config: configName,
    promptConfig: config,
    evalSetVersion: evalSet.version,
    itemCount: items.length,
    timestamp: new Date().toISOString(),
    exactAccuracy: exact / items.length,
    acceptableAccuracy: acceptable / items.length,
    invalidJsonCount: invalidJson,
    avgLatencyMs: avgLatency,
    p95LatencyMs: p95,
    totalTimeMs: elapsed,
    confusion,
    categoryResults,
    items: results,
  };

  // Write results to a data attribute for Playwright to read
  document.body.dataset.benchmarkComplete = 'true';
  document.body.dataset.benchmarkResults = JSON.stringify(lastResults);

  statusEl.textContent = `Done! Acceptable accuracy: ${(acceptable / items.length * 100).toFixed(1)}% (${acceptable}/${items.length})`;
  runBtn.disabled = false;
};

window.exportResults = function () {
  if (!lastResults) {
    alert('No results to export. Run a benchmark first.');
    return;
  }
  const blob = new Blob([JSON.stringify(lastResults, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `benchmark-${lastResults.config}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// Auto-load eval set on page load
loadEvalSet().then(data => {
  document.getElementById('status').textContent = `Loaded ${data.items.length} items (v${data.version}). Select a prompt config and click Run.`;
}).catch(err => {
  document.getElementById('status').textContent = `ERROR loading evaluation set: ${err.message}`;
});
