/**
 * UnifiedSphinx - Policy Engine
 * Evaluates events against security rules and produces a decision
 *   allow : traffic passes through
 *   alert : traffic passes but is flagged for review
 *   block : traffic is stopped
 */

const { detectPII, detectPromptInjection } = require('./detection');

const SUSPICIOUS_PATHS = [
  /\/wp-admin/i, /\/phpmyadmin/i, /\/\.env/i, /\/\.git/i,
  /\/config\./i, /\/etc\/passwd/i, /\/xmlrpc\.php/i, /\/shell/i,
];

const HIGH_RISK_AGENT_ACTIONS = [
  'delete_production', 'export_customer_data', 'modify_permissions',
  'send_bulk_email', 'execute_shell', 'deploy_code', 'drop_table', 'transfer_funds',
];

const ipTracker = {};
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

// Decision precedence: block > alert > allow. Never downgrade.
function escalate(current, next) {
  const rank = { allow: 0, alert: 1, block: 2 };
  return rank[next] > rank[current] ? next : current;
}

function evaluateEvent(event) {
  const reasons = [];
  let decision = 'allow';

  // 1. Suspicious path probing → block
  if (event.path) {
    for (const pattern of SUSPICIOUS_PATHS) {
      if (pattern.test(event.path)) {
        reasons.push('Suspicious path probe: ' + event.path);
        decision = escalate(decision, 'block');
        break;
      }
    }
  }

  // 2. High-risk agent actions → block
  if (event.agentAction) {
    const action = event.agentAction.toLowerCase();
    for (const risky of HIGH_RISK_AGENT_ACTIONS) {
      if (action.includes(risky)) {
        reasons.push('High-risk agent action requires approval: ' + event.agentAction);
        decision = escalate(decision, 'block');
        break;
      }
    }
  }

  // 3. Rate limiting → alert
  const ip = event.ip;
  if (ip) {
    const now = Date.now();
    if (!ipTracker[ip]) ipTracker[ip] = [];
    ipTracker[ip] = ipTracker[ip].filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    ipTracker[ip].push(now);
    if (ipTracker[ip].length > RATE_LIMIT_MAX) {
      reasons.push('Rate limit exceeded from ' + ip);
      decision = escalate(decision, 'alert');
    }
  }

  // 4. Bot/scanner UA detection → block
  if (event.userAgent) {
    const ua = event.userAgent.toLowerCase();
    const bots = ['sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab', 'python-requests'];
    for (const bot of bots) {
      if (ua.includes(bot)) {
        reasons.push('Known scanner detected: ' + bot);
        decision = escalate(decision, 'block');
        break;
      }
    }
  }

  // 5. SQL injection in payload → block
  if (event.payload) {
    const s = JSON.stringify(event.payload).toLowerCase();
    const sqli = ['union select', 'drop table', 'insert into', '; exec', "' or 1=1", "or 1=1--"];
    for (const p of sqli) {
      if (s.includes(p)) {
        reasons.push('Potential SQL injection in payload');
        decision = escalate(decision, 'block');
        break;
      }
    }
  }

  // 6. Prompt injection → alert (block only paired with SQLi/agent abuse)
  if (event.payload) {
    const content = JSON.stringify(event.payload);
    if (detectPromptInjection(content)) {
      reasons.push('Prompt injection attempt detected');
      decision = escalate(decision, 'alert');
    }
  }

  // 7. PII exposure in payload → alert
  if (event.payload) {
    const content = JSON.stringify(event.payload);
    const pii = detectPII(content);
    if (pii.found) {
      reasons.push('PII detected in payload: ' + pii.types.join(', '));
      decision = escalate(decision, 'alert');
    }
  }

  // Friendly default reason for allowed traffic
  if (decision === 'allow' && reasons.length === 0) {
    reasons.push('Clean traffic');
  }

  return { decision, reasons };
}

module.exports = { evaluateEvent };
