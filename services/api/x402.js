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

const { paymentMiddleware, x402ResourceServer } = require('@x402/express');
const { ExactEvmScheme } = require('@x402/evm');
const { HTTPFacilitatorClient } = require('@x402/core/server');
const { createFacilitatorConfig } = require('@coinbase/x402');

// ---- Configuration ---------------------------------------------------------

const PAY_TO = process.env.X402_PAY_TO || '0xaFa55F80461eB78d02E66dcf729F01f995CCa208';

// eip155:84532 = Base Sepolia; eip155:8453 = Base mainnet.
const NETWORK = process.env.X402_NETWORK || 'eip155:84532';

const PRICE = process.env.X402_PRICE || '$0.0005';

const CDP_API_KEY_ID =
  process.env.CDP_API_KEY_ID || '342a68be-3728-4a47-afc9-bdb969b0f1cc';
const CDP_API_KEY_SECRET = process.env.CDP_API_KEY_SECRET;

function buildResourceServer() {
  const facilitatorConfig = CDP_API_KEY_SECRET
    ? createFacilitatorConfig(CDP_API_KEY_ID, CDP_API_KEY_SECRET)
    : { url: 'https://facilitator.x402.org' };

  const client = new HTTPFacilitatorClient(facilitatorConfig);
  return new x402ResourceServer(client).register(NETWORK, new ExactEvmScheme());
}

// ---- Route config (v2 format) ----------------------------------------------

const routes = {
  'POST /v1/scan': {
    accepts: {
      scheme: 'exact',
      network: NETWORK,
      price: PRICE,
      payTo: PAY_TO,
    },
    description:
      'Real-time threat scoring for web traffic and agent actions. ' +
      'Detects prompt injection, PII leakage, SQL injection, scanner ' +
      'traffic, and unapproved agent tool calls. Returns allow/alert/block ' +
      'decision in under 50ms. Built by UnifiedSphinx — the secure runtime ' +
      'for the AI-era internet.',
  },
};

// ---- Express wiring --------------------------------------------------------

function attachX402(app) {
  const server = buildResourceServer();
  app.use(paymentMiddleware(routes, server));
  return server;
}

module.exports = {
  attachX402,
  PAY_TO,
  NETWORK,
  PRICE,
  CDP_API_KEY_ID,
  facilitatorMode: CDP_API_KEY_SECRET ? 'cdp' : 'x402.org',
};
