# UnifiedSphinx

> A smart security agent that keeps your website and AI tools from getting hacked.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Built by Jay Fisher AI](https://img.shields.io/badge/built%20by-Jay%20Fisher%20AI-purple)

---

## What is UnifiedSphinx?

UnifiedSphinx is a secure runtime and website safety agent for the AI era.

It sits between your website, your AI tools, and the real world — watching for suspicious activity, weak spots, and risky agent behavior before they turn into real damage.

**Plain English:** It watches your site and AI tools 24/7. If something looks sketchy, it flags it or blocks it.

---

## Why now?

Every major platform is getting breached. AI made it 100x easier to build — and 100x easier to attack.

- Attack surfaces are expanding daily (websites, AI agents, automations, internal tools)
- AI-powered attacks are faster, cheaper, and more automated than ever
- Most small and mid-sized businesses have zero real-time protection

UnifiedSphinx is the answer.

---

## What it does

| Feature | What it means for you |
|---|---|
| Website safety scan | Finds weak spots before attackers do |
| Suspicious activity alerts | Flags bots, hammered logins, probing |
| AI tool guardrails | Stops employees from leaking sensitive data into AI tools |
| Agent action approvals | Pauses risky AI agent actions before they execute |
| Audit trail | Every event, decision, and block — logged and readable |
| Security score | Plain-English score so you always know where you stand |

---

## Architecture

```
unifiedsphinx/
  apps/
    dashboard/          # React/Vite web dashboard
  services/
    api/                # Node/Express event ingestion + decision engine
  clients/
    web-snippet/        # Drop-in JS snippet for any website
  packages/
    policy-engine/      # Shared rule and policy logic
    detection/          # Prompt injection, risk scoring, leak detection
  docs/
    architecture.md     # Full technical architecture
```

---

## Open Source Foundation

UnifiedSphinx is built on top of the strongest available open-source security primitives:

- **Microsoft Agent Governance Toolkit** — runtime interception and policy enforcement for AI agents
- **NVIDIA NeMo Guardrails** — LLM content rails, jailbreak detection, PII checks
- **Coraza WAF** — enterprise-grade HTTP perimeter defense (OWASP Core Rule Set)
- **Microsoft PyRIT** — adversarial red-teaming and attack simulation
- **NVIDIA garak** — LLM vulnerability scanning and evaluation
- **Invariant Labs aiinvariant** — MCP-specific toxic flow analysis

---

## Getting Started

### 1. Drop the snippet on your website

```html
<script src="https://cdn.unifiedsphinx.com/sentinel.js" data-site-id="YOUR_SITE_ID"></script>
```

### 2. View your dashboard

Log in at [app.unifiedsphinx.com](https://app.unifiedsphinx.com) to see real-time events, alerts, and your security score.

### 3. Connect your AI tools

Wrap your agent workflows with the UnifiedSphinx runtime SDK to get action-level protection.

---

## Roadmap

- [x] Repo setup and architecture
- [ ] API event ingestion service
- [ ] Web dashboard (React/Vite)
- [ ] Drop-in website snippet
- [ ] Policy engine (rule evaluation)
- [ ] Detection layer (prompt injection, risk scoring)
- [ ] Microsoft Agent Governance Toolkit integration
- [ ] NeMo Guardrails integration
- [ ] Desktop tray app (UnifiedSphinx sentinel)
- [ ] Cloudflare Pages deployment

---

## Built by

[Jay Fisher AI](https://jayfisher.pages.dev) — AI consulting and automation for modern businesses.

---

## License

MIT
