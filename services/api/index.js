/**
 * UnifiedSphinx - Core API Service
 * Event ingestion, decision engine, site status + SSE live stream.
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { evaluateEvent } = require('./policyEngine');
const { scoreRisk } = require('./detection');
const { SEED_EVENTS } = require('./seed');

const app = express();
const PORT = process.env.PORT || 8000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// In-memory store
const eventLog = {};
const siteRegistry = {};
const sseClients = {}; // { siteId: Set<res> }

// -- Core ingestion ----------------------------------------------------------
function ingest({ siteId, type, path, ip, userAgent, payload, agentAction, now }) {
  const event = {
    id: uuidv4(),
    siteId,
    type,
    path: path || '/',
    ip: ip || '0.0.0.0',
    userAgent: userAgent || '',
    payload: payload || {},
    agentAction: agentAction || null,
    timestamp: (now || new Date()).toISOString(),
  };

  const policyResult = evaluateEvent(event);
  const riskScore = scoreRisk(event);

  const enriched = {
    ...event,
    decision: policyResult.decision,
    reasons: policyResult.reasons,
    riskScore,
  };

  if (!eventLog[siteId]) eventLog[siteId] = [];
  eventLog[siteId].unshift(enriched);
  if (eventLog[siteId].length > 500) eventLog[siteId].pop();

  updateSiteScore(siteId);
  broadcast(siteId, enriched);

  return enriched;
}

function updateSiteScore(siteId) {
  const events = eventLog[siteId] || [];
  const recent = events.slice(0, 100);
  const alerts = recent.filter((e) => e.decision === 'alert').length;
  const blocked = recent.filter((e) => e.decision === 'block').length;
  const penalty = alerts * 2 + blocked * 5;
  const score = Math.max(0, 100 - penalty);
  siteRegistry[siteId] = { score, alerts, blocked, total: events.length };
}

// -- SSE broadcast -----------------------------------------------------------
function broadcast(siteId, payload) {
  const set = sseClients[siteId];
  if (!set) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(line); } catch (_) { /* ignore */ }
  }
}

// -- Routes ------------------------------------------------------------------

app.post('/events', (req, res) => {
  const { siteId, type } = req.body || {};
  if (!siteId || !type) {
    return res.status(400).json({ error: 'siteId and type are required' });
  }
  const ev = ingest({
    siteId,
    type,
    path: req.body.path,
    ip: req.body.ip || req.ip,
    userAgent: req.body.userAgent || req.headers['user-agent'],
    payload: req.body.payload,
    agentAction: req.body.agentAction,
  });
  res.json({
    eventId: ev.id,
    decision: ev.decision,
    reasons: ev.reasons,
    riskScore: ev.riskScore,
  });
});

app.get('/sites/:id/status', (req, res) => {
  const { id } = req.params;
  const events = eventLog[id] || [];
  const site = siteRegistry[id] || { score: 100, alerts: 0, blocked: 0, total: 0 };
  res.json({
    siteId: id,
    score: site.score,
    alerts: site.alerts,
    blocked: site.blocked,
    total: site.total,
    recentEvents: events.slice(0, 20),
  });
});

app.get('/sites/:id/events', (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const events = (eventLog[id] || []).slice(0, limit);
  res.json({ siteId: id, events, total: events.length });
});

// Server-Sent Events stream of new events for a site
app.get('/sites/:id/stream', (req, res) => {
  const { id } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  if (!sseClients[id]) sseClients[id] = new Set();
  sseClients[id].add(res);

  // Greet the client so the browser knows the stream is open
  res.write(`event: hello\ndata: ${JSON.stringify({ siteId: id, ts: Date.now() })}\n\n`);

  // Keepalive ping every 20s (also satisfies proxy timeouts)
  const ping = setInterval(() => {
    try { res.write(`: ping ${Date.now()}\n\n`); } catch (_) { /* ignore */ }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    sseClients[id]?.delete(res);
  });
});

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'unifiedsphinx-api', version: '0.1.0' }));

// List registered sites (for dashboard site picker)
app.get('/sites', (_, res) => {
  const sites = Object.keys(siteRegistry).map((id) => ({ id, ...siteRegistry[id] }));
  res.json({ sites });
});

// -- Demo seeding ------------------------------------------------------------
function seedDemo(siteId = 'demo-acme-shop') {
  const base = Date.now() - 1000 * 60 * 60 * 3; // spread across last 3 hours
  SEED_EVENTS.forEach((evt, i) => {
    const when = new Date(base + (i * 1000 * 60 * 60 * 3) / SEED_EVENTS.length);
    ingest({ ...evt, siteId, now: when });
  });
  console.log(`[seed] Ingested ${SEED_EVENTS.length} demo events for "${siteId}"`);
}

// -- Continuous background generator -----------------------------------------
// Emits a fresh event every 8-14s so the live dashboard never feels static.
function startLiveFeed(siteId = 'demo-acme-shop') {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const tick = () => {
    const evt = pick(SEED_EVENTS);
    ingest({ ...evt, siteId });
    const next = 8000 + Math.random() * 6000;
    setTimeout(tick, next);
  };
  setTimeout(tick, 6000);
}

// Start
app.listen(PORT, HOST, () => {
  console.log(`UnifiedSphinx API listening on ${HOST}:${PORT}`);
  seedDemo();
  startLiveFeed();
});

module.exports = app;
