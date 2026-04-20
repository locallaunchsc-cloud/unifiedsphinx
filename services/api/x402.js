/**
 * UnifiedSphinx — x402 / Agentic.Market integration.
 *
 * Exposes the detection engine as a paid endpoint that AI agents can
 * discover and call autonomously through the x402 Bazaar discovery layer
 * (https://docs.cdp.coinbase.com/x402/bazaar).
 *
 * Paid routes:
 *   POST /v1/scan  - $0.0005 USDC per call on Base Sepolia testnet.
 *
 * Companion free routes (mounted by index.js, NOT through this middleware):
 *   POST /v1/scan-public  - same logic, rate-limited, for humans + previews.
 *
 * Listing strategy: services appear in Bazaar after the first successful
 * payment settles through the facilitator. Once you fund the buyer wallet
 * and call /v1/scan once, the service auto-indexes.
 */

const { paymentMiddleware } = require('x402-express');

// Base Sepolia testnet — no real funds needed.
// Replace with a production wallet + eip155:8453 once we go live.
const PAY_TO = process.env.X402_PAY_TO || '0xaFa55F80461eB78d02E66dcf729F01f995CCa208';
const NETWORK = process.env.X402_NETWORK || 'base-sepolia';

// JSON Schemas declared inline so the Bazaar listing renders rich metadata.
const SCAN_INPUT_SCHEMA = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: ['page_view', 'form_submit', 'chat_message', 'agent_input', 'agent_action'],
      description: 'The kind of event being evaluated.',
    },
    path: { type: 'string', description: 'Request path or target.' },
    ip: { type: 'string', description: 'Source IP address.' },
    userAgent: { type: 'string', description: 'Client user-agent string.' },
    payload: {
      type: 'object',
      description: 'Free-form event body. Strings inside are scanned for prompt injection, PII, and SQL injection.',
    },
    agentAction: {
      type: 'object',
      description: 'For type=agent_action: { tool, args, userConfirmed, amount? }.',
      properties: {
        tool: { type: 'string' },
        args: { type: 'object' },
        userConfirmed: { type: 'boolean' },
        amount: { type: 'number' },
      },
    },
  },
};

const SCAN_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['decision', 'risk', 'reasons'],
  properties: {
    decision: { type: 'string', enum: ['allow', 'alert', 'block'] },
    risk: { type: 'number', minimum: 0, maximum: 100 },
    reasons: { type: 'array', items: { type: 'string' } },
    latencyMs: { type: 'number' },
  },
};

const routes = {
  'POST /v1/scan': {
    price: '$0.0005',
    network: NETWORK,
    config: {
      description:
        'Real-time threat scoring for web traffic and agent actions. Detects prompt injection, PII leakage, SQL injection, scanner traffic, and unapproved agent tool calls. Returns allow/alert/block decision in under 50ms. Built by UnifiedSphinx — the secure runtime for the AI-era internet.',
      mimeType: 'application/json',
      maxTimeoutSeconds: 10,
      discoverable: true,
      inputSchema: {
        queryParams: {},
        bodyFields: SCAN_INPUT_SCHEMA.properties,
      },
      outputSchema: SCAN_OUTPUT_SCHEMA,
    },
  },
};

function attachX402(app) {
  app.use(
    paymentMiddleware(PAY_TO, routes, {
      url: 'https://x402.org/facilitator',
    }),
  );
}

module.exports = { attachX402, PAY_TO, NETWORK };
