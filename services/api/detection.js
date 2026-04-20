/**
 * UnifiedSphinx - Detection Layer
 * Risk scoring and prompt injection detection
 * Inspired by NeMo Guardrails and Rebuff concepts
 */

// Prompt injection patterns
const PROMPT_INJECTION_PATTERNS = [
  /ignore (previous|all|prior) instructions/i,
  /you are now/i,
  /pretend (you are|to be)/i,
  /act as (if|though)/i,
  /disregard (safety|guidelines|rules)/i,
  /jailbreak/i,
  /DAN mode/i,
  /system prompt/i,
  /override (safety|security)/i,
];

// PII patterns — sensitive identifiers only.
// We intentionally do NOT flag plain emails or generic phone numbers here
// (they are legitimate in most forms); the alert is reserved for things
// that are almost always a real leak when they appear in a payload.
const PII_PATTERNS = [
  { type: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: 'Credit Card', pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/ },
  { type: 'API Key', pattern: /\b(sk-|pk_|api_key|bearer )[A-Za-z0-9_\-]{20,}\b/i },
];

/**
 * Score risk of an event (0-100, higher = riskier)
 * @param {object} event
 * @returns {number} riskScore
 */
function scoreRisk(event) {
  let score = 0;

  // Agent actions carry higher base risk
  if (event.agentAction) score += 20;

  // Check payload for prompt injection
  if (event.payload) {
    const content = JSON.stringify(event.payload);
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        score += 40;
        break;
      }
    }
  }

  // Check payload for PII
  if (event.payload) {
    const content = JSON.stringify(event.payload);
    for (const { pattern } of PII_PATTERNS) {
      if (pattern.test(content)) {
        score += 30;
        break;
      }
    }
  }

  // Form submissions are higher risk than page views
  if (event.type === 'form_submit') score += 10;
  if (event.type === 'agent_action') score += 15;
  if (event.type === 'api_call') score += 10;

  return Math.min(score, 100);
}

/**
 * Detect PII in a string
 * @param {string} text
 * @returns {{ found: boolean, types: string[] }}
 */
function detectPII(text) {
  const types = [];
  for (const { type, pattern } of PII_PATTERNS) {
    if (pattern.test(text)) types.push(type);
  }
  return { found: types.length > 0, types };
}

/**
 * Detect prompt injection attempts
 * @param {string} text
 * @returns {boolean}
 */
function detectPromptInjection(text) {
  return PROMPT_INJECTION_PATTERNS.some(p => p.test(text));
}

module.exports = { scoreRisk, detectPII, detectPromptInjection };
