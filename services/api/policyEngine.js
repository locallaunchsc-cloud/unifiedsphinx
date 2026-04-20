/**
 * UnifiedSphinx - Policy Engine
 * Evaluates events against security rules
 * Inspired by Microsoft Agent Governance Toolkit
 */

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

function evaluateEvent(event) {
  const reasons = [];
  let decision = 'allow';

  // 1. Suspicious path probing
  if (event.path) {
    for (const pattern of SUSPICIOUS_PATHS) {
      if (pattern.test(event.path)) {
        reasons.push('Suspicious path probe: ' + event.path);
        decision = 'block';
        break;
      }
    }
  }

  // 2. High-risk agent actions
  if (event.agentAction) {
    const action = event.agentAction.toLowerCase();
    for (const risky of HIGH_RISK_AGENT_ACTIONS) {
      if (action.includes(risky)) {
        reasons.push('High-risk agent action requires approval: ' + event.agentAction);
        decision = 'block';
        break;
      }
    }
  }

  // 3. Rate limiting
  const ip = event.ip;
  if (ip) {
    const now = Date.now();
    if (!ipTracker[ip]) ipTracker[ip] = [];
    ipTracker[ip] = ipTracker[ip].filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    ipTracker[ip].push(now);
    if (ipTracker[ip].length > RATE_LIMIT_MAX) {
      reasons.push('Rate limit exceeded from ' + ip);
      if (decision === 'allow') decision = 'alert';
    }
  }

  // 4. Bot/scanner UA detection
  if (event.userAgent) {
    const ua = event.userAgent.toLowerCase();
    const bots = ['sqlmap', 'nikto', 'nmap', 'masscan', 'zgrab', 'python-requests'];
    for (const bot of bots) {
      if (ua.includes(bot)) {
        reasons.push('Known scanner detected: ' + bot);
        decision = 'block';
        break;
      }
    }
  }

  // 5. SQL injection in payload
  if (event.payload) {
    const s = JSON.stringify(event.payload).toLowerCase();
    const sqli = ["union select", "drop table", "insert into", "; exec"];
    for (const p of sqli) {
      if (s.includes(p)) {
        reasons.push('Potential SQL injection in payload');
        decision = 'block';
        break;
      }
    }
  }

  return { decision, reasons };
}

module.exports = { evaluateEvent };
