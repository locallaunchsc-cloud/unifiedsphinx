/* UnifiedSphinx Dashboard — live wiring */

// Works locally AND after deploy. `__PORT_8000__` is replaced by the proxy path at deploy time.
const API_RAW = '__PORT_8000__';
const API = API_RAW.startsWith('__') ? 'http://localhost:8000' : API_RAW;

const els = {
  siteInput: document.getElementById('siteId'),
  liveStatus: document.getElementById('live-status'),
  liveLabel: document.getElementById('live-label'),
  score: document.getElementById('k-score'),
  scoreBar: document.getElementById('k-score-bar'),
  scoreSub: document.getElementById('k-score-sub'),
  alerts: document.getElementById('k-alerts'),
  blocked: document.getElementById('k-blocked'),
  total: document.getElementById('k-total'),
  spark: document.getElementById('spark'),
  body: document.getElementById('events-body'),
  feedSub: document.getElementById('feed-sub'),
};

let currentSiteId = els.siteInput.value.trim();
let sse = null;
let eventsCache = [];
const MAX_ROWS = 40;

function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
function escape(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function riskClass(r) {
  if (r >= 60) return 'risk-high';
  if (r >= 30) return 'risk-med';
  return 'risk-low';
}

function renderRow(e, isNew = false) {
  const tr = document.createElement('tr');
  if (isNew) tr.classList.add('is-new');
  const reason = (e.reasons && e.reasons[0]) || (e.decision === 'allow' ? 'Clean traffic' : '—');
  const target = e.agentAction ? `agent:${e.agentAction}` : (e.path || '/');
  tr.innerHTML = `
    <td class="time-cell">${escape(fmtTime(e.timestamp))}</td>
    <td><span class="type-cell">${escape(e.type || '-')}</span></td>
    <td><span class="path-cell" title="${escape(target)}">${escape(target)}</span></td>
    <td><span class="ip-cell">${escape(e.ip || '-')}</span></td>
    <td><span class="risk-badge ${riskClass(e.riskScore || 0)}">${e.riskScore ?? 0}</span></td>
    <td><span class="decision decision-${escape(e.decision || 'allow')}">${escape(e.decision || 'allow')}</span></td>
    <td class="col-reason">${escape(reason)}</td>
  `;
  return tr;
}

function renderSpark(events) {
  const slice = events.slice(0, 50).reverse();
  els.spark.innerHTML = '';
  if (!slice.length) return;
  slice.forEach((e) => {
    const bar = document.createElement('div');
    bar.className = 'spark-bar';
    if (e.decision === 'alert') bar.classList.add('alert');
    if (e.decision === 'block') bar.classList.add('block');
    const h = Math.max(6, (e.riskScore || 5));
    bar.style.height = `${h}%`;
    bar.title = `${e.decision.toUpperCase()} · risk ${e.riskScore ?? 0}`;
    els.spark.appendChild(bar);
  });
}

function applyStatus(status) {
  const score = status.score ?? 0;
  els.score.textContent = score;
  const kpiCard = els.score.closest('.kpi');
  kpiCard.classList.remove('score-warn', 'score-bad');
  if (score < 50) kpiCard.classList.add('score-bad');
  else if (score < 80) kpiCard.classList.add('score-warn');
  els.scoreBar.style.width = `${score}%`;
  els.scoreSub.textContent = score >= 80 ? 'Posture: healthy' : score >= 50 ? 'Posture: elevated risk' : 'Posture: critical';
  els.alerts.textContent = status.alerts ?? 0;
  els.blocked.textContent = status.blocked ?? 0;
  els.total.textContent = status.total ?? (status.recentEvents?.length ?? 0);
}

async function loadStatus() {
  try {
    const res = await fetch(`${API}/sites/${encodeURIComponent(currentSiteId)}/status`);
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    applyStatus(data);
    // Grab a bigger slice for the sparkline + table
    const evRes = await fetch(`${API}/sites/${encodeURIComponent(currentSiteId)}/events?limit=${MAX_ROWS}`);
    const evData = await evRes.json();
    eventsCache = evData.events || [];
    renderSpark(eventsCache);
    els.body.innerHTML = '';
    if (!eventsCache.length) {
      els.body.innerHTML = '<tr><td class="empty" colspan="7">No events yet. Send one to /events to see it here.</td></tr>';
      return;
    }
    eventsCache.forEach((e) => els.body.appendChild(renderRow(e, false)));
  } catch (err) {
    console.error('loadStatus failed', err);
    setLive('offline', 'API unreachable');
    els.body.innerHTML = '<tr><td class="empty" colspan="7">Could not reach the UnifiedSphinx API.</td></tr>';
  }
}

function setLive(state, label) {
  els.liveStatus.classList.remove('is-live', 'is-offline');
  if (state === 'live') els.liveStatus.classList.add('is-live');
  if (state === 'offline') els.liveStatus.classList.add('is-offline');
  els.liveLabel.textContent = label;
}

function openStream() {
  if (sse) { try { sse.close(); } catch (_) {} sse = null; }
  const url = `${API}/sites/${encodeURIComponent(currentSiteId)}/stream`;
  try {
    sse = new EventSource(url);
  } catch (e) {
    setLive('offline', 'Stream unavailable');
    return;
  }

  sse.addEventListener('hello', () => setLive('live', 'Live'));
  sse.onopen = () => setLive('live', 'Live');
  sse.onerror = () => setLive('offline', 'Reconnecting…');

  sse.onmessage = (msg) => {
    try {
      const ev = JSON.parse(msg.data);
      pushEvent(ev);
    } catch (_) { /* ignore */ }
  };
}

function pushEvent(ev) {
  eventsCache.unshift(ev);
  if (eventsCache.length > MAX_ROWS) eventsCache.pop();

  // Update counters directly from cache
  const recent = eventsCache.slice(0, 100);
  const alerts = recent.filter((e) => e.decision === 'alert').length;
  const blocked = recent.filter((e) => e.decision === 'block').length;
  const score = Math.max(0, 100 - (alerts * 2 + blocked * 5));
  applyStatus({ score, alerts, blocked, total: eventsCache.length });

  // Prepend row
  const tr = renderRow(ev, true);
  els.body.insertBefore(tr, els.body.firstChild);
  // Trim table rows
  while (els.body.children.length > MAX_ROWS) {
    els.body.removeChild(els.body.lastChild);
  }
  // Rebuild sparkline
  renderSpark(eventsCache);
}

// Wire site input
els.siteInput.addEventListener('change', () => {
  const v = els.siteInput.value.trim();
  if (!v || v === currentSiteId) return;
  currentSiteId = v;
  setLive('idle', 'Reconnecting…');
  loadStatus().then(openStream);
});
els.siteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') els.siteInput.dispatchEvent(new Event('change'));
});

// Boot
setLive('idle', 'Connecting…');
loadStatus().then(openStream);

// Safety: occasional re-sync in case SSE drops silently
setInterval(() => { loadStatus(); }, 30000);
