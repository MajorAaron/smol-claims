// Smol Claims — frontend logic
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentCase = null;

// Char counter
const grievanceEl = $('#grievance');
const charCountEl = $('#char-count');
grievanceEl.addEventListener('input', () => {
  const len = grievanceEl.value.length;
  charCountEl.textContent = `${len} / 1200`;
  charCountEl.style.color = len > 1100 ? 'var(--c-danger)' : 'var(--c-text-muted)';
});

// Submit case
$('#case-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const grievance = grievanceEl.value.trim();
  if (grievance.length < 30) {
    alert('Please describe your grievance in at least 30 characters. The court requires evidence.');
    return;
  }
  const judgeStyle = $('#judge-style').value;
  const btn = $('#file-btn');
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
    renderVerdict(data);
    if (window.posthog) posthog.capture('case_filed', { judge_style: judgeStyle });
  } catch (err) {
    alert(`The court is experiencing difficulties: ${err.message}\n\nPlease try again in a moment.`);
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-label').hidden = false;
    btn.querySelector('.btn-spinner').hidden = true;
  }
});

function renderVerdict(c) {
  currentCase = c;
  $('#case-title').textContent = c.title;
  $('#case-id').textContent = c.case_id;
  $('#next-case-no').textContent = c.case_id;
  $('#verdict-headline').textContent = c.verdict_headline;
  $('#applicable-law').textContent = c.applicable_law;
  $('#verdict-text').textContent = c.verdict_text;
  $('#dissent').textContent = c.dissent;
  $('#remedy').textContent = c.recommended_remedy;
  $('#verdict-date').textContent = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Tint verdict color
  const verdictBox = $('.ruling-verdict');
  if (c.verdict_for_plaintiff) {
    verdictBox.style.borderLeftColor = 'var(--c-success)';
    verdictBox.style.background = 'rgba(20, 83, 45, 0.05)';
    $('#verdict-headline').style.color = 'var(--c-success)';
  } else {
    verdictBox.style.borderLeftColor = 'var(--c-danger)';
    verdictBox.style.background = 'rgba(127, 29, 29, 0.05)';
    $('#verdict-headline').style.color = 'var(--c-danger)';
  }

  $('#uphold-count').textContent = c.uphold_votes || 0;
  $('#overturn-count').textContent = c.overturn_votes || 0;
  $('#vote-status').textContent = '';
  $$('.vote-btn').forEach(b => b.classList.remove('voted-active'));
  $('#verdict-section').hidden = false;
  $('#verdict-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Voting
$$('.vote-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!currentCase) return;
    const vote = btn.dataset.vote;
    const localKey = `voted_${currentCase.case_id}`;
    if (localStorage.getItem(localKey)) {
      $('#vote-status').textContent = 'You have already voted on this case.';
      return;
    }
    btn.classList.add('voted-active');
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: currentCase.case_id, vote })
      });
      const data = await res.json();
      $('#uphold-count').textContent = data.uphold_votes;
      $('#overturn-count').textContent = data.overturn_votes;
      localStorage.setItem(localKey, vote);
      $('#vote-status').textContent = `Vote recorded. The jury has spoken.`;
      if (window.posthog) posthog.capture('jury_vote_cast', { vote, case_id: currentCase.case_id });
    } catch (err) {
      $('#vote-status').textContent = 'Vote could not be recorded.';
    }
  });
});

// Share buttons
$$('.share-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!currentCase) return;
    const action = btn.dataset.share;
    const verdictUrl = `${location.origin}${location.pathname}?case=${currentCase.case_id}`;
    const shareText = `Smol Claims Court ruled on my case "${currentCase.title}": ${currentCase.verdict_headline}`;
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(`${shareText}\n${verdictUrl}`);
        btn.textContent = '✓ Copied!';
        setTimeout(() => btn.textContent = '📋 Copy Link', 1800);
      } catch { alert(`Copy this:\n${shareText}\n${verdictUrl}`); }
    } else if (action === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(verdictUrl)}`, '_blank');
    } else if (action === 'reddit') {
      window.open(`https://www.reddit.com/submit?title=${encodeURIComponent(currentCase.title)}&url=${encodeURIComponent(verdictUrl)}`, '_blank');
    }
    if (window.posthog) posthog.capture('verdict_shared', { method: action });
  });
});

function resetForm() {
  $('#verdict-section').hidden = true;
  grievanceEl.value = '';
  charCountEl.textContent = '0 / 1200';
  currentCase = null;
  $('#filing').scrollIntoView({ behavior: 'smooth' });
}
window.resetForm = resetForm;

// Newsletter signup
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
      body: JSON.stringify({ email, source: 'tool-newsletter' })
    });
    const data = await res.json();
    if (res.ok) {
      status.textContent = '✓ Subscribed. Daily Docket arrives at 7am.';
      $('#subscribe-email').value = '';
      if (window.posthog) posthog.capture('newsletter_subscribed', { source: 'tool' });
    } else {
      status.textContent = data.error || 'Subscription failed.';
    }
  } catch {
    status.textContent = 'Subscription failed.';
  }
});

// Load public docket
async function loadDocket() {
  try {
    const res = await fetch('/api/history?limit=12');
    const data = await res.json();
    const list = $('#docket-list');
    if (!data.cases || !data.cases.length) {
      list.innerHTML = '<div class="docket-empty">No cases on the docket yet. Be the first to file.</div>';
      return;
    }
    list.innerHTML = data.cases.map(c => `
      <div class="docket-row" data-case-id="${c.case_id}">
        <div class="docket-content">
          <div class="docket-title">${escapeHtml(c.title)}</div>
          <div class="docket-meta">Case ${c.case_id} · ${c.judge_style.replace('-', ' ')} · ${formatDate(c.created_at)}</div>
        </div>
        <div class="docket-tally">
          <span class="tally-uphold">✓ ${c.uphold_votes}</span>
          <span class="tally-overturn">✗ ${c.overturn_votes}</span>
        </div>
      </div>
    `).join('');
    $$('.docket-row').forEach(row => {
      row.addEventListener('click', async () => {
        const id = row.dataset.caseId;
        const r = await fetch(`/api/history?case=${id}`);
        const d = await r.json();
        if (d.case) renderVerdict(d.case);
      });
    });
  } catch {
    $('#docket-list').innerHTML = '<div class="docket-empty">Could not load the docket.</div>';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Auto-load case from URL param
async function loadCaseFromUrl() {
  const params = new URLSearchParams(location.search);
  const caseId = params.get('case');
  if (!caseId) return;
  try {
    const r = await fetch(`/api/history?case=${caseId}`);
    const d = await r.json();
    if (d.case) renderVerdict(d.case);
  } catch {}
}

loadDocket();
loadCaseFromUrl();
