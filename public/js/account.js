import { $ } from './common.js';

const post = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};
const say = (text, bad = false) => {
  const el = $('#msg');
  el.textContent = text;
  el.style.color = bad ? 'var(--bad)' : '';
  el.hidden = false;
};
const token = new URLSearchParams(location.search).get('token') ?? '';

if ($('#forgot')) {
  $('#forgot').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#go').disabled = true;
    const r = await post('/api/auth/forgot', { email: $('#email').value });
    if (r.ok) say('If that address has an account, a reset link is on its way. It can take a minute. Check spam too.');
    else say(r.data.error ?? 'Something went wrong. Try again.', true);
    setTimeout(() => { $('#go').disabled = false; }, 5000);
  });
}

if ($('#reset')) {
  if (!token) say('This link is missing its code. Open the link from your email again, or ask for a new one.', true);
  $('#reset').addEventListener('submit', async (event) => {
    event.preventDefault();
    $('#go').disabled = true;
    const r = await post('/api/auth/reset', { token, password: $('#password').value });
    if (r.ok) {
      say('Password changed. Signing you in…');
      setTimeout(() => { location.href = '/meetings'; }, 800);
    } else {
      say(r.data.error ?? 'Something went wrong. Try again.', true);
      $('#go').disabled = false;
    }
  });
}

if ($('#verify')) {
  (async () => {
    if (!token) {
      $('#verify h1').textContent = 'This link is incomplete';
      return say('Open the link from your email again.', true);
    }
    const r = await post('/api/auth/verify', { token });
    $('#verify h1').textContent = r.ok ? 'Email confirmed' : 'Could not confirm';
    say(r.ok ? 'Thanks. Engage can now email you your meeting summaries.' : (r.data.error ?? 'Something went wrong.'), !r.ok);
    $('#next').hidden = false;
  })();
}
