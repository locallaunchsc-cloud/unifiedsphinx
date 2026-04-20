/* UnifiedSphinx — main interactions */
document.documentElement.classList.add('js');

// IntersectionObserver reveal
(function revealOnScroll() {
  const els = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -10% 0px', threshold: 0.05 }
  );
  els.forEach((el) => io.observe(el));
})();

// Header scrolled state
(function headerScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const onScroll = () => {
    if (window.scrollY > 20) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

// Feature card cursor spotlight
(function cardSpotlight() {
  const cards = document.querySelectorAll('.feature-card');
  cards.forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', `${mx}%`);
      card.style.setProperty('--my', `${my}%`);
    });
  });
})();

// Waitlist form submission — opens prefilled Airtable form in new tab
(function waitlistForm() {
  const form = document.getElementById('waitlist-form');
  if (!form) return;
  const AIRTABLE_FORM = 'https://airtable.com/appnhaB59pRM5domJ/shr6Mvh6QXyB9r5sh';
  const successEl = document.getElementById('wl-success');
  const submitBtn = document.getElementById('wl-submit');
  const submitLabel = submitBtn?.querySelector('.form-submit-label');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('wl-email');
    const email = (emailInput?.value || '').trim();
    const tier = form.querySelector('input[name="tier"]:checked')?.value || 'Open Core';

    // Minimal client-side validation
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      emailInput?.focus();
      emailInput?.setAttribute('aria-invalid', 'true');
      form.classList.add('has-error');
      return;
    }
    form.classList.remove('has-error');
    emailInput?.removeAttribute('aria-invalid');

    // Build prefilled Airtable URL
    const params = new URLSearchParams({
      'prefill_Email': email,
      'prefill_Source': 'landing_page',
      'prefill_Tier Interest': tier,
      'hide_Source': 'true',
    });
    const url = `${AIRTABLE_FORM}?${params.toString()}`;

    // Open Airtable form in a new tab so user can finish/confirm there
    window.open(url, '_blank', 'noopener,noreferrer');

    // Optimistic UI: show success, swap button
    if (successEl) successEl.hidden = false;
    if (submitLabel) submitLabel.textContent = 'Opened — confirm in new tab';
    submitBtn?.setAttribute('disabled', 'true');
    submitBtn?.classList.add('is-done');
  });
})();

// Smooth anchor scroll with header offset
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id || id === '#') return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    const y = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top: y, behavior: 'smooth' });
  });
});
