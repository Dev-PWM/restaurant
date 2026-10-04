(() => {
  'use strict';
  const form = document.getElementById('staff-login-form'), error = document.getElementById('login-error');
  const target = new URLSearchParams(location.search).get('next') || '/businessDashbord.html';
  const next = /^\/(?:businessDashbord\.html|metricsDashbord\.html|MenuManagment\.html|history\.html|analytics\/?)(?:\?[^#]*)?$/.test(target) ? target : '/businessDashbord.html';
  const tr = text => window.MasaFlowI18n.translate(text);
  function showError(message) { error.textContent = tr(message); error.hidden = false; }
  form.addEventListener('submit', async event => {
    event.preventDefault(); error.hidden = true;
    const button = document.getElementById('staff-sign-in'); button.disabled = true;
    try {
      const response = await fetch('/api/session/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('staff-password').value }) });
      if (!response.ok) { const result = await response.json(); showError(result.code === 'RATE_LIMITED' ? 'Too many sign-in attempts. Try again in 15 minutes.' : 'Incorrect staff password.'); return; }
      location.replace(next);
    } catch { showError('Connection unavailable. Please try again.'); }
    finally { button.disabled = false; }
  });
  document.getElementById('staff-continue').href = next;
  document.getElementById('staff-sign-out').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/session/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error('Sign-out failed');
      location.reload();
    } catch { form.hidden = false; showError('Connection unavailable. Please try again.'); }
  });
  fetch('/api/session').then(response => response.ok ? response.json() : null).then(session => {
    if (!session) return;
    if (!session.required) { location.replace(next); return; }
    form.hidden = session.authenticated; document.getElementById('staff-session').hidden = !session.authenticated;
  }).catch(() => showError('Connection unavailable. Please try again.'));
})();
