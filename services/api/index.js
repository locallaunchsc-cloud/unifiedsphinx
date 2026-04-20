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
const { attachX402, PAY_TO, NETWORK } = require('./x402');

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

// -- Stateless scan helper (powers /v1/scan and /v1/scan-public) -------------
function runScan(body) {
  const start = Date.now();
  const event = {
    id: 'scan-' + Math.random().toString(36).slice(2, 10),
    siteId: body.siteId || 'x402-direct',
    type: body.type,
    path: body.path || '/',
    ip: body.ip || '0.0.0.0',
    userAgent: body.userAgent || '',
    payload: body.payload || {},
    agentAction: body.agentAction || null,
    timestamp: new Date().toISOString(),
  };
  const policy = evaluateEvent(event);
  const risk = scoreRisk(event);
  return {
    decision: policy.decision,
    risk,
    reasons: policy.reasons,
    latencyMs: Date.now() - start,
  };
}

// Lightweight in-memory rate limit for /v1/scan-public (free tier).
const publicHits = new Map(); // ip -> { count, resetAt }
function publicRateLimit(req, res, next) {
  const ip = req.ip || '0.0.0.0';
  const now = Date.now();
  const slot = publicHits.get(ip);
  if (!slot || now > slot.resetAt) {
    publicHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  if (slot.count >= 30) {
    return res.status(429).json({
      error: 'rate_limited',
      message: 'Free tier: 30 calls/min/IP. Pay $0.0005/call via x402 for unlimited.',
      x402Endpoint: '/v1/scan',
    });
  }
  slot.count += 1;
  next();
}

// -- x402 paid endpoint ------------------------------------------------------
// Mount BEFORE we define POST /v1/scan so the middleware intercepts.
attachX402(app);

app.post('/v1/scan', (req, res) => {
  const body = req.body || {};
  if (!body.type) return res.status(400).json({ error: 'type is required' });
  res.json(runScan(body));
});

// -- Free preview endpoint (rate-limited) ------------------------------------
app.post('/v1/scan-public', publicRateLimit, (req, res) => {
  const body = req.body || {};
  if (!body.type) return res.status(400).json({ error: 'type is required' });
  res.json({ ...runScan(body), tier: 'public-preview' });
});

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
app.get('/x402-info', (_, res) => {
  res.json({
    payTo: PAY_TO,
    network: NETWORK,
    facilitator: 'https://x402.org/facilitator',
    routes: {
      paid: { method: 'POST', path: '/v1/scan', price: '$0.0005' },
      free: { method: 'POST', path: '/v1/scan-public', limit: '30/min/ip' },
    },
    docs: 'https://github.com/locallaunchsc-cloud/unifiedsphinx#x402',
  });
});

app.listen(PORT, HOST, () => {
  console.log(`UnifiedSphinx API listening on ${HOST}:${PORT}`);
  seedDemo();
  startLiveFeed();
});

module.exports = app;
