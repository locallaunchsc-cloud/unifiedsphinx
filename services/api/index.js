/**
 * UnifiedSphinx - Core API Service
 * Event ingestion, decision engine, and site status
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { evaluateEvent } = require('./policyEngine');
const { scoreRisk } = require('./detection');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// In-memory store (replace with DB in production)
const eventLog = {};
const siteRegistry = {};

/**
 * POST /events
 * Ingest a security event from a site or agent
 */
app.post('/events', async (req, res) => {
  const { siteId, type, path, ip, userAgent, payload, agentAction } = req.body;

  if (!siteId || !type) {
    return res.status(400).json({ error: 'siteId and type are required' });
  }

  const event = {
    id: uuidv4(),
    siteId,
    type,
    path: path || '/',
    ip: ip || req.ip,
    userAgent: userAgent || req.headers['user-agent'],
    payload: payload || {},
    agentAction: agentAction || null,
    timestamp: new Date().toISOString(),
  };

  // Run through policy engine
  const policyResult = evaluateEvent(event);

  // Run through risk scoring
  const riskScore = scoreRisk(event);

  const enrichedEvent = {
    ...event,
    decision: policyResult.decision,
    reasons: policyResult.reasons,
    riskScore,
  };

  // Store event
  if (!eventLog[siteId]) eventLog[siteId] = [];
  eventLog[siteId].unshift(enrichedEvent);
  // Keep last 500 events per site
  if (eventLog[siteId].length > 500) eventLog[siteId].pop();

  // Update site security score
  updateSiteScore(siteId);

  return res.json({
    eventId: event.id,
    decision: enrichedEvent.decision,
    reasons: enrichedEvent.reasons,
    riskScore,
  });
});

/**
 * GET /sites/:id/status
 * Returns security score + recent events for a site
 */
app.get('/sites/:id/status', (req, res) => {
  const { id } = req.params;
  const events = eventLog[id] || [];
  const site = siteRegistry[id] || { score: 100, alerts: 0, blocked: 0 };

  return res.json({
    siteId: id,
    score: site.score,
    alerts: site.alerts,
    blocked: site.blocked,
    recentEvents: events.slice(0, 20),
  });
});

/**
 * GET /sites/:id/events
 * Returns full event log for a site
 */
app.get('/sites/:id/events', (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const events = (eventLog[id] || []).slice(0, limit);
  return res.json({ siteId: id, events, total: events.length });
});

/**
 * GET /health
 */
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'unifiedsphinx-api' }));

// Helpers
function updateSiteScore(siteId) {
  const events = eventLog[siteId] || [];
  const recent = events.slice(0, 100);
  const alerts = recent.filter(e => e.decision === 'alert').length;
  const blocked = recent.filter(e => e.decision === 'block').length;
  const penalty = alerts * 2 + blocked * 5;
  const score = Math.max(0, 100 - penalty);

  siteRegistry[siteId] = { score, alerts, blocked };
}

app.listen(PORT, () => {
  console.log(`UnifiedSphinx API running on port ${PORT}`);
});

module.exports = app;
