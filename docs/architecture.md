# UnifiedSphinx Architecture

## Overview

UnifiedSphinx is a layered security product built for the AI era. It protects websites and AI agent workflows from attacks, data leakage, and risky automation using a combination of proven open-source security primitives and proprietary product logic.

---

## Layer Model

```
┌────────────────────────────────────────────────────────┐
│                  UnifiedSphinx Dashboard               │
│              (apps/dashboard/index.html)                │
│     Security score, event log, alerts, approvals        │
└────────────────────────┬───────────────────────────────┘
                         │ HTTP
┌────────────────────────▼───────────────────────────────┐
│                  UnifiedSphinx API                      │
│              (services/api/index.js)                     │
│     POST /events  |  GET /sites/:id/status              │
│     GET /sites/:id/events  |  GET /health               │
└─────┬──────────────────┬───────────────────────────────┘
      │                  │
┌─────▼──────┐    ┌──────▼──────────┐
│  Policy    │    │   Detection     │
│  Engine    │    │   Layer         │
│            │    │                 │
│ - path     │    │ - risk scoring  │
│   probing  │    │ - PII detection │
│ - agent    │    │ - prompt inject │
│   actions  │    │   detection     │
│ - rate     │    │ - payload scan  │
│   limiting │    │                 │
│ - bot UAs  │    └─────────────────┘
│ - SQLi     │
└────────────┘
                         ▲ events
┌────────────────────────┴───────────────────────────────┐
│               Website Sentinel Snippet                  │
│           (clients/web-snippet/sentinel.js)             │
│  page views | form submits | URL params | bot patterns  │
└────────────────────────────────────────────────────────┘
```

---

## Components

### 1. API Service (`services/api/`)

Node.js + Express service that:
- Ingests events from websites and AI agents via `POST /events`
- Runs each event through the policy engine and detection layer
- Returns a decision: `allow`, `alert`, or `block`
- Stores events in memory (upgradeable to Postgres/Redis in production)
- Calculates a rolling security score per site

### 2. Policy Engine (`services/api/policyEngine.js`)

Deterministic rule-based evaluation inspired by Microsoft Agent Governance Toolkit's runtime interception model:
- Suspicious path probing (wp-admin, .env, .git, etc.)
- High-risk agent actions requiring human approval
- IP-based rate limiting (30 requests/minute)
- Known bot/scanner user agent detection
- SQL injection pattern matching in payloads

### 3. Detection Layer (`services/api/detection.js`)

Risk scoring and content analysis layer:
- 0-100 risk score per event
- PII detection (SSN, credit cards, email, phone, API keys)
- Prompt injection pattern matching (NeMo Guardrails-inspired)
- Event type weighting (agent actions score higher)

### 4. Web Sentinel Snippet (`clients/web-snippet/sentinel.js`)

Drop-in client-side JS snippet for any website:
- Tracks page views, form submissions, URL parameters
- Detects XSS/injection patterns in URL params
- Monitors rapid click patterns (bot signals)
- Sends events to the UnifiedSphinx API
- Zero-dependency, async, non-blocking

### 5. Dashboard (`apps/dashboard/index.html`)

Zero-dependency HTML dashboard:
- Security score (0-100)
- Alerts and blocked events counter
- Real-time event table with risk score, decision, and reason
- Auto-refreshes every 10 seconds
- Color-coded risk levels

---

## Open Source Foundation

| Layer | Open Source Basis | Role |
|---|---|---|
| Runtime governance | Microsoft Agent Governance Toolkit | Agent action interception, policy enforcement |
| Content guardrails | NVIDIA NeMo Guardrails | Prompt rails, jailbreak, PII |
| HTTP perimeter | Coraza WAF + OWASP Core Rule Set | Classic web attack defense |
| Red-team testing | Microsoft PyRIT + NVIDIA garak | Adversarial testing and LLM vuln scanning |
| MCP-specific | Invariant Labs aiinvariant | Multi-agent toxic flow analysis |

---

## Deployment Targets

| Component | Recommended Host |
|---|---|
| API Service | Railway, Render, Fly.io, or Cloudflare Workers |
| Dashboard | Cloudflare Pages or Vercel |
| Web Snippet | CDN (Cloudflare R2, jsDelivr) |

---

## Roadmap to v1.0

- [ ] Replace in-memory store with Postgres
- [ ] Add auth (API key per site)
- [ ] Microsoft Agent Governance Toolkit integration
- [ ] NeMo Guardrails integration for LLM content rails
- [ ] Coraza WAF integration at HTTP edge
- [ ] Desktop tray app (Electron/Tauri)
- [ ] Industry-specific policy packs (healthcare, finance, legal)
- [ ] Demo video and public launch

---

## Built by Jay Fisher AI

https://jayfisher.pages.dev
