// Smol Claims — landing page JS (demo + subscribe)

const $ = (s) => document.querySelector(s);

// Demo: file a case from the landing page
$('#demo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const grievance = $('#demo-grievance').value.trim();
  const judgeStyle = $('#demo-judge-style').value;
  if (grievance.length < 30) {
    alert('Please describe your grievance in at least 30 characters.');
    return;
  }
  const btn = $('#demo-btn');
  btn.disabled = true;
  btn.querySelector('.btn-label').hidden = true;
  btn.querySelector('.btn-spinner').hidden = false;

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grievance, judge_style: judgeStyle })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error (${res.status})`);
    }
    const data = await res.json();
    $('#demo-title').textContent = data.title;
    $('#demo-headline').textContent = data.verdict_headline;
    $('#demo-headline').style.color = data.verdict_for_plaintiff ? 'var(--c-success)' : 'var(--c-danger)';
    $('#demo-headline').style.borderLeftColor = data.verdict_for_plaintiff ? 'var(--c-success)' : 'var(--c-danger)';
    $('#demo-headline').style.borderRightColor = data.verdict_for_plaintiff ? 'var(--c-success)' : 'var(--c-danger)';
    $('#demo-headline').style.background = data.verdict_for_plaintiff
      ? 'rgba(20, 83, 45, 0.08)'
      : 'rgba(127, 29, 29, 0.08)';
    $('#demo-law').textContent = data.applicable_law;
    $('#demo-text').textContent = data.verdict_text;
    $('#demo-remedy').textContent = data.recommended_remedy;
    $('#demo-result').hidden = false;
    $('#demo-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (window.posthog) posthog.capture('landing_demo_used', { judge_style: judgeStyle });
  } catch (err) {
    alert(`The court is experiencing difficulties: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-label').hidden = false;
    btn.querySelector('.btn-spinner').hidden = true;
  }
});

// Newsletter subscribe
$('#subscribe-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#subscribe-email').value.trim();
  if (!email) return;
  const status = $('#subscribe-status');
  status.textContent = 'Submitting…';
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'landing' })
    });
    const data = await res.json();
    if (res.ok) {
      status.textContent = '✓ Subscribed. Daily Docket arrives at 7am.';
      $('#subscribe-email').value = '';
      if (window.posthog) posthog.capture('newsletter_subscribed', { source: 'landing' });
    } else {
      status.textContent = data.error || 'Subscription failed.';
    }
  } catch {
    status.textContent = 'Subscription failed.';
  }
});
