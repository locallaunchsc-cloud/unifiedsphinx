/**
 * UnifiedSphinx Sentinel - Drop-in Website Protection Snippet
 * Copy and paste this into any website to start monitoring
 *
 * Usage:
 * <script src="sentinel.js" data-site-id="YOUR_SITE_ID"></script>
 */

(function () {
  'use strict';

  const script = document.currentScript;
  const SITE_ID = (script && script.getAttribute('data-site-id')) || 'default-site';
  const API_URL = (script && script.getAttribute('data-api-url')) || 'https://api.unifiedsphinx.com';
  const DEBUG = (script && script.getAttribute('data-debug') === 'true') || false;

  function log(...args) {
    if (DEBUG) console.log('[UnifiedSphinx]', ...args);
  }

  /**
   * Send an event to the UnifiedSphinx API
   */
  function sendEvent(type, payload) {
    const event = {
      siteId: SITE_ID,
      type,
      path: window.location.pathname,
      userAgent: navigator.userAgent,
      payload: payload || {},
      timestamp: new Date().toISOString(),
    };

    fetch(API_URL + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    })
      .then(res => res.json())
      .then(data => {
        log('Event sent:', type, '| Decision:', data.decision);
        if (data.decision === 'block') {
          log('BLOCKED:', data.reasons);
        }
      })
      .catch(err => log('Error:', err));
  }

  // 1. Track page views
  sendEvent('page_view', {
    referrer: document.referrer,
    title: document.title,
  });

  // 2. Track form submissions (check for suspicious input)
  document.addEventListener('submit', function (e) {
    const form = e.target;
    const formData = {};
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
      if (input.name && input.type !== 'password') {
        formData[input.name] = input.value;
      }
    });

    sendEvent('form_submit', {
      action: form.action,
      method: form.method,
      fields: Object.keys(formData),
      data: formData,
    });
  }, true);

  // 3. Track suspicious URL params (common attack vectors)
  (function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const suspicious = [];
    params.forEach((value, key) => {
      const combined = (key + '=' + value).toLowerCase();
      const attackPatterns = ['<script', 'javascript:', 'union select', 'exec(', '../'];
      for (const pattern of attackPatterns) {
        if (combined.includes(pattern)) {
          suspicious.push({ key, pattern });
        }
      }
    });
    if (suspicious.length > 0) {
      sendEvent('suspicious_url_param', { suspicious, url: window.location.href });
    }
  })();

  // 4. Track rapid click patterns (bot detection signal)
  let clickCount = 0;
  let clickTimer = null;
  document.addEventListener('click', function () {
    clickCount++;
    if (clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(function () {
      if (clickCount > 20) {
        sendEvent('rapid_click_pattern', { clicks: clickCount, window: '3s' });
      }
      clickCount = 0;
    }, 3000);
  });

  log('UnifiedSphinx Sentinel active for site:', SITE_ID);
})();
