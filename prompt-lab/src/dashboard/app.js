const API = '/api/v1';
const $ = (sel) => document.querySelector(sel);
const app = $('#app');

// ── API helpers ──
async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return res.json();
}

function pct(v) { return (v * 100).toFixed(1) + '%'; }
function metricClass(v) { return v >= 0.9 ? 'good' : v >= 0.7 ? 'warn' : 'bad'; }
function shortHash(h) { return h ? h.slice(0, 8) : '—'; }

function metricsGrid(m) {
  return `<div class="metrics-grid">
    <div class="metric-card"><div class="metric-value ${metricClass(m.accuracy)}">${pct(m.accuracy)}</div><div class="metric-label">Accuracy</div></div>
    <div class="metric-card"><div class="metric-value ${metricClass(m.precision)}">${pct(m.precision)}</div><div class="metric-label">Precision</div></div>
    <div class="metric-card"><div class="metric-value ${metricClass(m.recall)}">${pct(m.recall)}</div><div class="metric-label">Recall</div></div>
    <div class="metric-card"><div class="metric-value ${metricClass(m.f1)}">${pct(m.f1)}</div><div class="metric-label">F1</div></div>
    <div class="metric-card"><div class="metric-value">${m.totalCases}</div><div class="metric-label">Total Cases</div></div>
    <div class="metric-card"><div class="metric-value">${m.avgLatencyMs?.toFixed(0) ?? '—'}ms</div><div class="metric-label">Avg Latency</div></div>
  </div>`;
}

// ── Router ──
function getRoute() {
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  return { path: '/' + (parts[0] || ''), params: parts.slice(1) };
}

const routes = {
  '/': renderOverview,
  '/suites': renderSuites,
  '/rule': renderRuleDetail,
  '/history': renderHistory,
  '/compare': renderCompare,
  '/optimize': renderOptimize,
};

function navigate() {
  const { path, params } = getRoute();
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.getAttribute('href') === '#' + path || (path === '/rule' && l.getAttribute('href') === '#/'));
  });
  const handler = routes[path] || routes['/'];
  handler(params);
}

window.addEventListener('hashchange', navigate);
window.addEventListener('load', navigate);

// ── Views ──

async function renderOverview() {
  app.innerHTML = '<h2>Loading...</h2>';
  const rulesets = await api('/rulesets');
  const suites = await api('/test-suites');

  app.innerHTML = `<h2>Rulesets Overview</h2>` +
    rulesets.map(rs => `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${rs.displayName}</span>
          <span class="text-sm text-muted">${rs.id}</span>
        </div>
        <table>
          <tr><th>Rule</th><th>Severity</th><th>Test Cases</th><th>Actions</th></tr>
          ${rs.contentRules.map(rule => {
            const suite = suites.find(s => s.ruleId === rule.id && s.ruleSetId === rs.id);
            const caseCount = suite ? suite.cases.length : 0;
            return `<tr>
              <td><a href="#/rule/${rs.id}/${rule.id}" style="color:var(--accent)">${rule.id}</a></td>
              <td><span class="badge badge-${rule.severity === 'error' ? 'fail' : rule.severity === 'warning' ? 'info' : 'pass'}">${rule.severity}</span></td>
              <td>${caseCount > 0 ? caseCount + ' cases' : '<span class="text-muted">none</span>'}</td>
              <td>
                <button class="btn btn-sm" onclick="location.hash='#/rule/${rs.id}/${rule.id}'">View</button>
                <button class="btn btn-sm" onclick="location.hash='#/history/${rule.id}'">History</button>
              </td>
            </tr>`;
          }).join('')}
        </table>
      </div>
    `).join('');
}

async function renderRuleDetail(params) {
  const [ruleSetId, ruleId] = params;
  if (!ruleSetId || !ruleId) return renderOverview();

  app.innerHTML = '<h2>Loading...</h2>';
  const [rulesets, suite] = await Promise.all([
    api('/rulesets'),
    api(`/test-suites/${ruleSetId}/${ruleId}`).catch(() => null),
  ]);

  const rs = rulesets.find(r => r.id === ruleSetId);
  const rule = rs?.contentRules.find(r => r.id === ruleId);
  if (!rule) { app.innerHTML = '<div class="empty">Rule not found</div>'; return; }

  app.innerHTML = `
    <div class="flex justify-between items-center mb-8">
      <h2>${ruleId}</h2>
      <div class="flex gap-8">
        <button class="btn btn-primary" id="btn-run">Run Tests</button>
        <button class="btn" onclick="location.hash='#/optimize/${ruleSetId}/${ruleId}'">Optimize</button>
      </div>
    </div>
    <div class="card">
      <h3>Evaluation Prompt</h3>
      <div class="code-block">${escHtml(rule.evaluationPrompt || '')}</div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3>Test Cases (${suite?.cases?.length ?? 0})</h3>
        <button class="btn btn-sm" id="btn-add-case">+ Add Case</button>
      </div>
      <div id="cases-list">${suite?.cases?.length ? casesList(suite.cases, ruleSetId, ruleId) : '<div class="empty">No test cases. Click "Add Case" to create one.</div>'}</div>
    </div>
    <div id="case-form-container" style="display:none"></div>
    <div id="run-results"></div>
  `;

  $('#btn-add-case').onclick = () => showCaseForm(null, ruleSetId, ruleId, suite, params);

  $('#btn-run').onclick = async () => {
    $('#btn-run').disabled = true;
    $('#btn-run').textContent = 'Running...';
    const { jobId } = await api('/runs', { method: 'POST', body: { ruleSetId, ruleId } });
    pollRun(jobId, params);
  };
}

/** Render test cases as expandable details with full input preview */
function casesList(cases, ruleSetId, ruleId) {
  return cases.map(c => `
    <details class="case-detail">
      <summary>
        <span class="badge badge-${c.expected.pass ? 'pass' : 'fail'}" style="margin-right:8px">${c.expected.pass ? 'pass' : 'fail'}</span>
        ${escHtml(c.id)} — <span class="text-muted text-sm">${escHtml(c.description)}</span>
      </summary>
      <div>
        <label>Markdown Input:</label>
        <div class="code-block-sm">${escHtml(c.input)}</div>
        ${c.expected.issuesMustMention?.length ? `<p class="text-sm text-muted mt-16">Keywords: ${c.expected.issuesMustMention.join(', ')}</p>` : ''}
        <div class="flex gap-8 mt-16">
          <button class="btn btn-sm" onclick="editCase('${escAttr(c.id)}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteCase('${escAttr(c.id)}')">Delete</button>
        </div>
      </div>
    </details>
  `).join('');
}

/** Show the add/edit case form */
function showCaseForm(existingCase, ruleSetId, ruleId, suite, params) {
  const isEdit = !!existingCase;
  const container = $('#case-form-container');
  container.style.display = 'block';
  container.innerHTML = `
    <div class="card">
      <h3>${isEdit ? 'Edit' : 'Add'} Test Case</h3>
      <div class="form-row">
        <div class="form-group"><label>ID</label><input id="case-id" value="${escAttr(existingCase?.id || '')}" ${isEdit ? 'readonly style="opacity:0.6"' : ''} placeholder="e.g. good_example_1" /></div>
        <div class="form-group"><label>Expected</label><select id="case-expected"><option value="true" ${existingCase?.expected.pass !== false ? 'selected' : ''}>Pass</option><option value="false" ${existingCase?.expected.pass === false ? 'selected' : ''}>Fail</option></select></div>
      </div>
      <div class="form-group"><label>Description</label><input id="case-desc" value="${escAttr(existingCase?.description || '')}" placeholder="What this case tests" /></div>
      <div class="form-group"><label>Markdown Input</label><textarea id="case-input" rows="8" placeholder="Paste section markdown content here...">${escHtml(existingCase?.input || '')}</textarea></div>
      <div class="form-group"><label>Issues Must Mention (comma-separated, optional)</label><input id="case-keywords" value="${escAttr(existingCase?.expected.issuesMustMention?.join(', ') || '')}" placeholder="e.g. 负责人, owner" /></div>
      <div class="flex gap-8">
        <button class="btn btn-primary" id="btn-save-case">${isEdit ? 'Update' : 'Save'} Case</button>
        <button class="btn" id="btn-cancel-case">Cancel</button>
      </div>
    </div>
  `;

  $('#btn-cancel-case').onclick = () => { container.style.display = 'none'; };
  $('#btn-save-case').onclick = async () => {
    const keywords = $('#case-keywords').value.split(',').map(s => s.trim()).filter(Boolean);
    const body = {
      id: $('#case-id').value,
      description: $('#case-desc').value,
      input: $('#case-input').value,
      expected: {
        pass: $('#case-expected').value === 'true',
        ...(keywords.length > 0 ? { issuesMustMention: keywords } : {}),
      },
    };

    if (isEdit) {
      await api(`/test-suites/${ruleSetId}/${ruleId}/cases/${existingCase.id}`, { method: 'PUT', body });
    } else if (!suite) {
      await api('/test-suites', { method: 'POST', body: { ruleId, ruleSetId, description: `Tests for ${ruleId}`, cases: [body] } });
    } else {
      await api(`/test-suites/${ruleSetId}/${ruleId}/cases`, { method: 'POST', body });
    }
    renderRuleDetail(params);
  };
}

// Global edit handler
window.editCase = async function(caseId) {
  const { path, params } = getRoute();
  if (path !== '/rule') return;
  const [ruleSetId, ruleId] = params;
  const suite = await api(`/test-suites/${ruleSetId}/${ruleId}`).catch(() => null);
  if (!suite) return;
  const c = suite.cases.find(tc => tc.id === caseId);
  if (!c) return;
  showCaseForm(c, ruleSetId, ruleId, suite, params);
};

async function pollRun(jobId, params) {
  const poll = setInterval(async () => {
    const job = await api(`/runs/${jobId}`);
    if (job.status === 'completed') {
      clearInterval(poll);
      const runs = job.result;
      if (runs?.length) {
        const run = runs[0];
        $('#run-results').innerHTML = `
          <div class="card mt-16">
            <h3>Run Results</h3>
            ${metricsGrid(run.metrics)}
            ${run.results.map(r => `
              <details class="case-detail">
                <summary>
                  ${r.correct ? '✓' : '✗'}
                  <span class="badge badge-${r.actualPass ? 'pass' : 'fail'}" style="margin:0 8px">${r.actualPass ? 'pass' : 'fail'}</span>
                  ${r.caseId}
                  ${!r.correct ? `<span class="text-sm text-muted">(expected ${r.expectedPass ? 'pass' : 'fail'})</span>` : ''}
                  <span class="text-sm text-muted" style="margin-left:auto">${r.latencyMs}ms</span>
                </summary>
                <div>
                  ${r.input ? `<label>Input:</label><div class="code-block-sm">${escHtml(r.input)}</div>` : ''}
                  ${r.issues?.length ? `<label class="mt-16">Issues:</label><ul>${r.issues.map(i => `<li class="text-sm">${escHtml(i)}</li>`).join('')}</ul>` : ''}
                  ${r.suggestions?.length ? `<label class="mt-16">Suggestions:</label><ul>${r.suggestions.map(s => `<li class="text-sm">${escHtml(s)}</li>`).join('')}</ul>` : ''}
                  ${r.rawOutput ? `<label class="mt-16">Raw LLM Output:</label><div class="code-block-sm">${escHtml(r.rawOutput)}</div>` : ''}
                </div>
              </details>
            `).join('')}
          </div>`;
      }
      const btn = $('#btn-run');
      if (btn) { btn.disabled = false; btn.textContent = 'Run Tests'; }
    } else if (job.status === 'failed') {
      clearInterval(poll);
      $('#run-results').innerHTML = `<div class="card mt-16"><div class="badge badge-fail">Run failed: ${job.error || 'unknown'}</div></div>`;
      const btn = $('#btn-run');
      if (btn) { btn.disabled = false; btn.textContent = 'Run Tests'; }
    }
  }, 2000);
}

// ── Test Suites Editor ──

async function renderSuites() {
  app.innerHTML = '<h2>Loading...</h2>';
  const [rulesets, suites] = await Promise.all([api('/rulesets'), api('/test-suites')]);

  app.innerHTML = `
    <h2>Test Suite Editor</h2>
    <div class="form-group">
      <label>Select Rule</label>
      <select id="suite-select">
        <option value="">— Choose a rule —</option>
        ${rulesets.flatMap(rs => rs.contentRules.map(r => {
          const suite = suites.find(s => s.ruleId === r.id && s.ruleSetId === rs.id);
          return `<option value="${rs.id}/${r.id}">${rs.id} / ${r.id} (${suite ? suite.cases.length + ' cases' : 'no suite'})</option>`;
        })).join('')}
      </select>
    </div>
    <div id="suite-editor"></div>
  `;

  $('#suite-select').onchange = () => {
    const val = $('#suite-select').value;
    if (val) location.hash = `#/rule/${val}`;
  };
}

// ── History ──

async function renderHistory(params) {
  const ruleId = params[0];
  if (!ruleId) {
    app.innerHTML = '<h2>History</h2><p class="text-muted">Select a rule from the overview to view its history.</p>';
    const rulesets = await api('/rulesets');
    app.innerHTML += rulesets.map(rs =>
      rs.contentRules.map(r =>
        `<a href="#/history/${r.id}" class="btn" style="margin:4px">${r.id}</a>`
      ).join('')
    ).join('');
    return;
  }

  app.innerHTML = '<h2>Loading...</h2>';
  const history = await api(`/history/${ruleId}`);

  if (history.length === 0) {
    app.innerHTML = `<h2>History: ${ruleId}</h2><div class="empty">No runs yet. Run tests from the rule detail page.</div>`;
    return;
  }

  app.innerHTML = `
    <h2>History: ${ruleId}</h2>
    <p class="text-sm text-muted mb-8">Select 2 or more runs, then click Compare.</p>
    <div class="card">
      <div class="flex justify-between items-center mb-8">
        <span></span>
        <button class="btn btn-primary btn-sm" id="btn-compare-selected">Compare Selected</button>
      </div>
      <table>
        <tr><th style="width:40px"></th><th>Time</th><th>Commit</th><th>Model</th><th>Accuracy</th><th>F1</th><th>Prompt Hash</th><th>Suite Hash</th></tr>
        ${history.map(r => `<tr>
          <td><input type="checkbox" class="compare-check" value="${r.id}" /></td>
          <td class="text-sm">${new Date(r.timestamp).toLocaleString()}</td>
          <td><code>${shortHash(r.gitCommit)}</code></td>
          <td class="text-sm">${r.model}</td>
          <td><span class="badge badge-${r.metrics.accuracy >= 0.9 ? 'pass' : r.metrics.accuracy >= 0.7 ? 'info' : 'fail'}">${pct(r.metrics.accuracy)}</span></td>
          <td>${pct(r.metrics.f1)}</td>
          <td><code>${shortHash(r.promptHash)}</code></td>
          <td><code>${shortHash(r.suiteHash)}</code></td>
        </tr>`).join('')}
      </table>
    </div>
  `;

  $('#btn-compare-selected').onclick = () => {
    const checked = [...document.querySelectorAll('.compare-check:checked')].map(cb => cb.value);
    if (checked.length < 2) { alert('Select at least 2 runs to compare.'); return; }
    location.hash = `#/compare/${checked.join('/')}`;
  };
}

// ── Compare (multi-run, unified columns) ──

function deltaSpan(current, baseline) {
  const d = current - baseline;
  if (Math.abs(d) < 0.001) return '';
  const cls = d > 0 ? 'pos' : 'neg';
  return `<span class="delta ${cls}">${d >= 0 ? '+' : ''}${pct(d)}</span>`;
}

async function renderCompare(params) {
  // params = [runId1, runId2, ...runIdN]
  if (params.length < 2) {
    app.innerHTML = `<h2>Compare Runs</h2><div class="empty">Select 2+ runs from the History view to compare them.</div>`;
    return;
  }

  app.innerHTML = '<h2>Loading...</h2>';
  const ids = params.join(',');
  const comparison = await api(`/compare-multi?ids=${ids}`);

  if (comparison.error) {
    app.innerHTML = `<h2>Compare</h2><div class="empty">${escHtml(comparison.error)}</div>`;
    return;
  }

  const runs = comparison.runs;
  const first = runs[0];
  const numRuns = runs.length;

  // Check if suite hashes differ
  const suitesAllSame = runs.every(r => r.suiteHash === first.suiteHash);
  const promptsAllSame = runs.every(r => r.prompt === first.prompt);

  // Build unified comparison table
  const runHeaders = runs.map((r, i) =>
    `<th class="run-col">Run ${i + 1}<br>
     <span class="text-sm text-muted"><code>${shortHash(r.gitCommit)}</code> · ${new Date(r.timestamp).toLocaleString()}</span></th>`
  ).join('');

  // Suite hash row
  const suiteRow = `<tr class="${suitesAllSame ? '' : 'row-highlight'}">
    <td class="label-col">Suite</td>
    ${runs.map(r => `<td><code>${shortHash(r.suiteHash)}</code></td>`).join('')}
  </tr>`;

  // Prompt row
  const promptRow = promptsAllSame
    ? `<tr>
        <td class="label-col">Prompt</td>
        <td colspan="${numRuns}"><span class="badge badge-pass">identical</span><div class="code-block-sm mt-16">${escHtml(first.prompt)}</div></td>
       </tr>`
    : `<tr>
        <td class="label-col">Prompt</td>
        ${runs.map(r => `<td><div class="code-block-sm">${escHtml(r.prompt)}</div></td>`).join('')}
       </tr>`;

  // Metrics rows
  const metricDefs = [
    { key: 'accuracy', label: 'Accuracy' },
    { key: 'precision', label: 'Precision' },
    { key: 'recall', label: 'Recall' },
    { key: 'f1', label: 'F1' },
    { key: 'avgLatencyMs', label: 'Avg Latency', format: v => `${v.toFixed(0)}ms` },
  ];
  const metricsRows = metricDefs.map(({ key, label, format }) => {
    const fmt = format || (v => `<span class="${metricClass(v)}">${pct(v)}</span>`);
    return `<tr>
      <td class="label-col">${label}</td>
      ${runs.map((r, i) => {
        const val = r.metrics[key];
        const display = fmt(val);
        const delta = i > 0 && !format ? deltaSpan(val, first.metrics[key]) : '';
        return `<td>${display}${delta}</td>`;
      }).join('')}
    </tr>`;
  }).join('');

  // Build table
  const tableHtml = `
    <div class="compare-wrapper">
      <table class="compare-table">
        <thead>
          <tr><th class="label-col"></th>${runHeaders}</tr>
        </thead>
        <tbody>
          ${suiteRow}
          ${promptRow}
          ${metricsRows}
        </tbody>
      </table>
    </div>`;

  // Per-case sections (always expanded)
  const casesHtml = comparison.caseDetails.map(cd => {
    const hasDiff = cd.perRun.some((r, i) => i > 0 && r.correct !== cd.perRun[0].correct);
    const icons = cd.perRun.map(r => r.correct ? '✓' : '✗').join(' ');

    return `
      <div class="case-section ${hasDiff ? 'has-diff' : ''}">
        <div class="case-header">
          <span>${escHtml(cd.caseId)}</span>
          <span class="case-icons">${icons}${hasDiff ? ' <span class="badge badge-info">changed</span>' : ''}</span>
        </div>
        <label>Input:</label>
        <div class="code-block-sm mb-8">${escHtml(cd.input)}</div>
        <div class="compare-cols mt-16">
          ${cd.perRun.map((r, i) => `
            <div class="compare-col">
              <p class="text-sm" style="font-weight:600;margin-bottom:6px">Run ${i + 1}</p>
              <p class="text-sm">
                Expected: <span class="badge badge-${r.expectedPass ? 'pass' : 'fail'}">${r.expectedPass ? 'pass' : 'fail'}</span>
                Actual: <span class="badge badge-${r.actualPass ? 'pass' : 'fail'}">${r.actualPass ? 'pass' : 'fail'}</span>
                ${r.correct ? '✓' : '✗'}
              </p>
              ${r.issues?.length ? `<label class="mt-16">Issues:</label><ul>${r.issues.map(iss => `<li class="text-sm">${escHtml(iss)}</li>`).join('')}</ul>` : '<p class="text-sm text-muted">No issues</p>'}
              ${r.suggestions?.length ? `<label class="mt-16">Suggestions:</label><ul>${r.suggestions.map(s => `<li class="text-sm">${escHtml(s)}</li>`).join('')}</ul>` : ''}
              ${r.rawOutput ? `<label class="mt-16">Raw Output:</label><div class="code-block-sm">${escHtml(r.rawOutput)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');

  app.innerHTML = `
    <h2>Compare: ${comparison.ruleId} (${numRuns} runs)</h2>
    ${tableHtml}
    <h3 class="mt-16">Per-Case Results</h3>
    <p class="text-sm text-muted mb-8">Cases with differing results are highlighted.</p>
    ${casesHtml}
  `;
}

// ── Optimize ──

async function renderOptimize(params) {
  const [ruleSetId, ruleId] = params;
  if (!ruleSetId || !ruleId) {
    const rulesets = await api('/rulesets');
    app.innerHTML = `<h2>Optimize</h2><p class="text-muted mb-8">Select a rule to optimize:</p>` +
      rulesets.map(rs =>
        rs.contentRules.map(r =>
          `<a href="#/optimize/${rs.id}/${r.id}" class="btn" style="margin:4px">${rs.id} / ${r.id}</a>`
        ).join('')
      ).join('');
    return;
  }

  app.innerHTML = `
    <h2>Optimize: ${ruleId}</h2>
    <div class="card">
      <div class="form-group">
        <label>Target Accuracy</label>
        <input id="opt-target" type="number" value="0.95" min="0" max="1" step="0.05" />
      </div>
      <div class="form-group">
        <label>Max Iterations</label>
        <input id="opt-max" type="number" value="10" min="1" max="20" />
      </div>
      <div class="form-group">
        <label>Guidance (optional)</label>
        <textarea id="opt-guidance" rows="3" placeholder="e.g. 对英文格式日期宽容, focus on owner assignment not deadline format..."></textarea>
      </div>
      <button class="btn btn-primary" id="btn-start-opt">Start Optimization</button>
    </div>
    <div id="opt-progress"></div>
    <div id="opt-live-guide" style="display:none" class="card mt-16">
      <h3>Live Guidance</h3>
      <p class="text-sm text-muted mb-8">Send advice to the running optimizer:</p>
      <div class="flex gap-8">
        <input id="live-guide-input" placeholder="e.g. stop requiring bullet format..." style="flex:1" />
        <button class="btn" id="btn-send-guide">Send</button>
      </div>
    </div>
    <div id="opt-result"></div>
  `;

  let currentJobId = null;

  $('#btn-start-opt').onclick = async () => {
    $('#btn-start-opt').disabled = true;
    $('#btn-start-opt').textContent = 'Running...';
    const { jobId } = await api('/optimize', {
      method: 'POST',
      body: {
        ruleSetId,
        ruleId,
        targetAccuracy: parseFloat($('#opt-target').value),
        maxIterations: parseInt($('#opt-max').value),
        guidance: $('#opt-guidance').value,
      },
    });
    currentJobId = jobId;
    $('#opt-live-guide').style.display = 'block';
    pollOptimize(jobId);
  };

  $('#btn-send-guide').onclick = async () => {
    if (!currentJobId) return;
    await api(`/optimize/${currentJobId}/guide`, {
      method: 'POST',
      body: { guidance: $('#live-guide-input').value },
    });
    $('#live-guide-input').value = '';
  };
}

async function pollOptimize(jobId) {
  const poll = setInterval(async () => {
    const job = await api(`/optimize/${jobId}`);

    if (job.iterations?.length) {
      $('#opt-progress').innerHTML = `
        <div class="card mt-16">
          <h3>Progress (${job.iterations.length} iterations)</h3>
          <div class="progress-bar mb-8"><div class="progress-fill" style="width:${(job.iterations.length / job.maxIterations) * 100}%"></div></div>
          <table>
            <tr><th>#</th><th>Accuracy</th><th>F1</th><th>Analysis</th></tr>
            ${job.iterations.map(it => `<tr>
              <td>${it.iteration}</td>
              <td><span class="badge badge-${it.metrics.accuracy >= 0.9 ? 'pass' : 'info'}">${pct(it.metrics.accuracy)}</span></td>
              <td>${pct(it.metrics.f1)}</td>
              <td class="text-sm">${escHtml((it.failureAnalysis || '').slice(0, 150))}</td>
            </tr>`).join('')}
          </table>
        </div>`;
    }

    if (job.status !== 'running') {
      clearInterval(poll);
      $('#opt-live-guide').style.display = 'none';
      const btn = $('#btn-start-opt');
      if (btn) { btn.disabled = false; btn.textContent = 'Start Optimization'; }

      if (job.iterations?.length) {
        const best = job.iterations[job.bestIteration];
        $('#opt-result').innerHTML = `
          <div class="card mt-16">
            <h3>Best Result (Iteration ${job.bestIteration})</h3>
            ${metricsGrid(best.metrics)}
            <h3>Optimized Prompt</h3>
            <div class="code-block">${escHtml(best.prompt)}</div>
            <button class="btn btn-primary mt-16" id="btn-apply">Apply to YAML</button>
          </div>`;
        $('#btn-apply').onclick = async () => {
          await api(`/optimize/${jobId}/apply`, { method: 'POST' });
          alert('Prompt applied to YAML file!');
        };
      }
    }
  }, 3000);
}

// Global delete handler
window.deleteCase = async function(caseId) {
  const { path, params } = getRoute();
  if (path !== '/rule') return;
  const [ruleSetId, ruleId] = params;
  if (confirm(`Delete case "${caseId}"?`)) {
    await api(`/test-suites/${ruleSetId}/${ruleId}/cases/${caseId}`, { method: 'DELETE' });
    renderRuleDetail(params);
  }
};

function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
