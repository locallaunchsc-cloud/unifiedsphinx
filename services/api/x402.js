/**
 * UnifiedSphinx — x402 / Agentic.Market integration.
 *
 * Exposes the detection engine as a paid endpoint that AI agents can
 * discover and call autonomously through the x402 Bazaar discovery layer
 * (https://docs.cdp.coinbase.com/x402/bazaar).
 *
 * Paid routes:
 *   POST /v1/scan  - $0.0005 USDC per call. Base Sepolia by default.
 *
 * Companion free routes (mounted by index.js, NOT through this middleware):
 *   POST /v1/scan-public  - same logic, rate-limited, for humans + previews.
 *
 * Facilitator selection:
 *   - If CDP_API_KEY_ID and CDP_API_KEY_SECRET are set, use Coinbase CDP
 *     facilitator. This is what indexes the service into Agentic.Market.
 *   - Otherwise fall back to the public x402.org facilitator (testnet only,
 *     does NOT index into Agentic.Market).
 */

const { paymentMiddleware } = require('x402-express');
const { createFacilitatorConfig } = require('@coinbase/x402');

// ---- Configuration ---------------------------------------------------------

// Pay-to wallet (receive-only — no private key needed on this server).
const PAY_TO = process.env.X402_PAY_TO || '0xaFa55F80461eB78d02E66dcf729F01f995CCa208';

// Network: 'base-sepolia' (testnet, no real funds) or 'base' (mainnet).
const NETWORK = process.env.X402_NETWORK || 'base-sepolia';

// Per-call price in USD (USDC).
const PRICE = process.env.X402_PRICE || '$0.0005';

// CDP credentials. Key ID is non-secret and can default; secret is env-only.
// Default Key ID belongs to the UnifiedSphinx project on CDP.
const CDP_API_KEY_ID =
  process.env.CDP_API_KEY_ID || 'aa9c783d-6990-4e27-9be8-ea21de1bd3ea';
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET; // never default

function buildFacilitatorConfig() {
  if (CDP_API_KEY_SECRET) {
    // Production / indexable path. Hits Coinbase's facilitator and gets
    // discovered by Agentic.Market on first successful payment.
    return createFacilitatorConfig(CDP_API_KEY_ID, CDP_API_KEY_SECRET);
  }
  // Public testnet fallback — works for verification, but NOT indexed by
  // Agentic.Market (CDP is the only facilitator they crawl right now).
  return { url: 'https://x402.org/facilitator' };
}

// ---- Discovery metadata (rendered in the Bazaar listing) -------------------

const SCAN_INPUT_FIELDS = {
  type: {
    type: 'string',
    enum: ['page_view', 'form_submit', 'chat_message', 'agent_input', 'agent_action'],
    description: 'The kind of event being evaluated.',
    required: true,
  },
  path: { type: 'string', description: 'Request path or target.' },
  ip: { type: 'string', description: 'Source IP address.' },
  userAgent: { type: 'string', description: 'Client user-agent string.' },
  payload: {
    type: 'object',
    description:
      'Free-form event body. Strings inside are scanned for prompt injection, PII, and SQL injection.',
  },
  agentAction: {
    type: 'object',
    description:
      'For type=agent_action: { tool, args, userConfirmed, amount? }.',
  },
};

const SCAN_OUTPUT_SCHEMA = {
  decision: {
    type: 'string',
    description: 'allow | alert | block — the policy decision.',
    required: true,
  },
  risk: { type: 'number', description: 'Risk score 0-100.', required: true },
  reasons: {
    type: 'array',
    description: 'Human-readable reasons for the decision.',
    required: true,
  },
  latencyMs: { type: 'number', description: 'Server-side processing latency.' },
};

// ---- Express wiring --------------------------------------------------------

const routes = {
  'POST /v1/scan': {
    price: PRICE,
    network: NETWORK,
    config: {
      description:
        'Real-time threat scoring for web traffic and agent actions. ' +
        'Detects prompt injection, PII leakage, SQL injection, scanner ' +
        'traffic, and unapproved agent tool calls. Returns allow/alert/block ' +
        'decision in under 50ms. Built by UnifiedSphinx — the secure runtime ' +
        'for the AI-era internet.',
      mimeType: 'application/json',
      maxTimeoutSeconds: 10,
      discoverable: true,
      inputSchema: { queryParams: {}, bodyFields: SCAN_INPUT_FIELDS },
      outputSchema: SCAN_OUTPUT_SCHEMA,
    },
  },
};

function attachX402(app) {
  const facilitator = buildFacilitatorConfig();
  app.use(paymentMiddleware(PAY_TO, routes, facilitator));
  return facilitator;
}

module.exports = {
  attachX402,
  PAY_TO,
  NETWORK,
  PRICE,
  CDP_API_KEY_ID,
  facilitatorMode: CDP_API_KEY_SECRET ? 'cdp' : 'x402.org',
};
