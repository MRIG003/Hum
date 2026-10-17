import { $, $$ } from './common.js';

const show = (id) => {
  for (const el of $$('#panel > section, #panel > div')) el.hidden = el.id !== id;
};

const fail = (title, text) => {
  $('#error-title').textContent = title;
  $('#error-text').textContent = text;
  show('state-error');
};

// Meet gives each meeting a stable id. Keep only characters the Engage link API accepts.
const linkKey = (meetingId) => String(meetingId).replace(/[^\w.-]/g, '_').slice(0, 80);

// The panel's host key lives in this tab only (sessionStorage). Storage that is shared across
// the whole browser would hand the host view to any other Google account used in the same
// browser profile.
const panelKey = (meetingCode) => `engage.panelhost.${meetingCode}`;
const getPanelToken = (meetingCode) => {
  try { return sessionStorage.getItem(panelKey(meetingCode)); } catch { return null; }
};
const setPanelToken = (meetingCode, token) => {
  try { sessionStorage.setItem(panelKey(meetingCode), token); } catch { /* storage can be blocked */ }
};

// The free hosting tier sleeps when idle. Wake it the moment the panel opens, and say so if it is slow.
fetch('/healthz').catch(() => {});
const slowHint = setTimeout(() => {
  const loading = $('#state-loading p');
  if (loading && !$('#state-loading').hidden) loading.textContent = 'Waking up the Engage server. This can take up to a minute the first time…';
}, 4000);

// Fetch with a deadline so a button never just sits there.
const request = async (url, options = {}, ms = 70_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); }
};


async function connectToMeet() {
  const config = await request('/api/config').then((r) => r.json());
  if (!config.googleCloudProjectNumber) {
    return fail('Not set up yet', 'Engage is not configured for Google Meet™ yet. The person who set up Engage needs to add the Google Cloud project number.');
  }
  let client;
  try {
    const { meet } = await import('/vendor/meet.addons.mjs');
    // Outside Meet the SDK may never answer, so do not wait forever.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
    const open = async () => {
      const session = await meet.addon.createAddonSession({ cloudProjectNumber: config.googleCloudProjectNumber });
      return session.createSidePanelClient();
    };
    client = await Promise.race([open(), timeout]);
  } catch {
    return fail('Open Engage from Google Meet™', 'This panel only works inside a Google Meet™ call. In Meet, choose Activities, then Engage.');
  }
  const info = await client.getMeetingInfo();
  return { client, key: linkKey(info.meetingId), meetingCode: info.meetingCode };
}

const lookup = async (key) => {
  const res = await request(`/api/link/meet/${encodeURIComponent(key)}`);
  return res.ok ? res.json() : null;
};

// The host tools open in this same panel as the full host view (with its tools menu).
const goHost = (target, token) => location.replace(`/h/${target}?embed=1#t=${encodeURIComponent(token)}`);
const goAttendee = (target) => location.replace(`/j/${target}?embed=1`);

async function route(ctx) {
  const found = await lookup(ctx.key);
  if (found) {
    const token = getPanelToken(found.code);
    if (token) return goHost(found.code, token);
    return goAttendee(found.code);
  }
  $('#panel-sub').textContent = ctx.meetingCode ?? '';
  show('state-start');
  $('#start-title').placeholder = ctx.meetingCode ? `Meet ${ctx.meetingCode}` : 'Weekly team meeting';
  // Non-hosts wait here; the moment the host starts Engage, this panel opens it.
  const timer = setInterval(async () => {
    if ($('#state-start').contains(document.activeElement)) return; // do not interrupt someone typing
    const live = await lookup(ctx.key);
    if (live) {
      clearInterval(timer);
      goAttendee(live.code);
    }
  }, 4000);
  $('#start-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    clearInterval(timer);
    const btn = $('#start-btn');
    const err = $('#start-error');
    btn.disabled = true;
    btn.textContent = 'Starting…';
    err.hidden = false;
    err.style.color = '';
    err.textContent = 'Starting Engage. If the server was asleep this can take up to a minute.';
    const title = $('#start-title').value.trim() || ($('#start-title').placeholder);
    const failStart = (message) => {
      err.style.color = 'var(--bad)';
      err.textContent = message;
      btn.disabled = false;
      btn.textContent = 'Try again';
    };
    let res;
    let body;
    try {
      res = await request('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, platform: 'meet', link: { platform: 'meet', id: ctx.key } }),
      });
      body = await res.json();
    } catch {
      return failStart('Could not reach Engage. Check your connection and try again.');
    }
    if (res.status === 409 && body.code) return goAttendee(body.code); // someone else started it a moment ago
    if (!res.ok) return failStart(body.error ?? 'Could not start Engage.');
    err.hidden = true;
    setPanelToken(body.code, body.hostToken);
    // Ask Meet to invite the call before leaving this page; the SDK session lives here.
    try { await ctx.client.startActivity(); } catch { /* the host view offers the invite again */ }
    goHost(body.code, body.hostToken);
  });
}

show('state-loading');
connectToMeet().then((ctx) => { clearTimeout(slowHint); return ctx && route(ctx); }).catch((error) => fail('Engage could not start', error.message));
