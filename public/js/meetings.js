import { $, esc, toast } from './common.js';

const render = (data) => {
  $('#who').textContent = data.email;
  $('#list').innerHTML = data.meetings.length
    ? data.meetings.map((m) => `
      <div class="row spread" style="padding: 10px 0; border-top: 1px solid var(--border)">
        <div><b>${esc(m.title)}</b><div class="small muted">${new Date(m.createdAt).toLocaleString()} · ${m.joined} joined · ${m.status === 'live' ? 'live now' : 'ended'}</div></div>
        <div class="row"><a href="/h/${esc(m.code)}"><button class="primary small">${m.status === 'live' ? 'Open console' : 'Open summary'}</button></a><button class="ghost small" data-delete="${esc(m.code)}">Delete</button></div>
      </div>`).join('')
    : '<p class="muted">No meetings yet. Meetings you start while signed in appear here.</p>';
};

const load = async () => {
  const res = await fetch('/api/my/meetings');
  if (res.status === 401) {
    location.href = '/login?next=/meetings';
    return;
  }
  render(await res.json());
};

document.addEventListener('click', async (event) => {
  const del = event.target.closest('[data-delete]');
  if (del && confirm('Delete this meeting and all its results for good? This cannot be undone.')) {
    const res = await fetch(`/api/meetings/${del.dataset.delete}`, { method: 'DELETE' });
    toast(res.ok ? 'Meeting deleted' : 'Could not delete the meeting');
    load();
  }
});

$('#signout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/';
});

load();
