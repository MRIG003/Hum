import { $, $$, connect, esc, formatClock, toast } from './common.js';

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

let activityClient = null;
let code = null;
let hostToken = null;
let socket = null;
let state = null;

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

const goAttendee = (target) => location.replace(`/j/${target}?embed=1`);

async function route(ctx) {
  const found = await lookup(ctx.key);
  if (found) {
    const token = getPanelToken(found.code);
    if (token) {
      activityClient = ctx.client;
      return startHost(found.code, token, found.title);
    }
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
    activityClient = ctx.client;
    startHost(body.code, body.hostToken, title);
    inviteCall();
  });
}

// ---- compact host view -------------------------------------------------------

function startHost(meetingCode, token, title) {
  code = meetingCode;
  hostToken = token;
  $('#panel-sub').textContent = title ?? '';
  $('#p-console').href = `/h/${code}#t=${token}`;
  $('#p-link').value = `${location.origin}/j/${code}`;
  show('state-host');
  socket = connect({
    hello: () => ({ t: 'hello', role: 'host', code, hostToken }),
    onState: (next) => {
      state = next;
      render();
    },
    onStatus: (status) => { $('#p-offline').hidden = status === 'online'; },
    onFatal: (message) => fail('Engage could not open', message),
    onError: (message) => toast(message),
  });
}

const minutes = (ms) => {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? '< 1 min' : `${m} min`;
};

function render() {
  if (state.status === 'ended') {
    show('state-error');
    $('#error-title').textContent = 'Meeting ended';
    $('#error-text').textContent = 'The summary is in the full console.';
    return;
  }
  $('#p-eng').textContent = `${state.engagement.pct}%`;
  $('#p-eng-sub').textContent = state.counts.connected ? `${state.engagement.active} of ${state.counts.connected} active` : 'Waiting for people';
  $('#p-conn').textContent = String(state.counts.connected);
  $('#p-conn-sub').textContent = `${state.counts.joined} joined`;

  const focus = $('#p-focus');
  focus.textContent = state.focus ? 'Resume everyone' : 'Focus moment';
  focus.dataset.on = state.focus ? '' : '1';
  focus.classList.toggle('primary', state.focus);

  $('#p-banners').innerHTML = [
    ...(state.focus ? ['<div class="banner focus"><span><b>Focus moment is on.</b> Prompts are paused.</span></div>'] : []),
    ...state.suggestions.slice(0, 1).map((s) => `<div class="banner warn suggestion"><div><b>Suggestion.</b> ${esc(s.text)}</div><div class="row">${
      s.actions.includes('pulse') ? '<button id="p-sugg-pulse" class="primary small">Run a pulse check</button>' : ''}${
      s.actions.includes('floor') ? '<button data-action="floor" class="small">Open the floor</button>' : ''}</div></div>`),
    ...(state.topicNudge ? [`<div class="banner"><div><b>${esc(state.topicNudge.topic)} is wrapping up.</b> You prepared: “${esc(state.topicNudge.prompt)}”</div><button class="primary small" data-prepared="${esc(state.topicNudge.promptId)}">Launch it</button></div>`] : []),
  ].join('');

  const m = state.moment;
  $('#p-moment').innerHTML = m
    ? `<p class="small"><b>${esc(m.prompt)}</b></p><p class="small muted">${m.results.total} answered${m.status === 'open' && m.closesAt ? ` · closes in <span class="num" data-closes="${m.closesAt}"></span>` : ''}</p>${
      m.status === 'open' ? '<button data-action="closeMoment" class="small primary">Close and show results</button>' : '<button data-action="dismissMoment" class="small">Dismiss</button>'}`
    : '';

  const quiet = (state.people ?? []).filter((p) => p.connected && !p.presenting && p.quietMs >= 5 * 60_000).slice(0, 6);
  $('#p-quiet').innerHTML = quiet.length
    ? quiet.map((p) => `<div class="person-row" style="grid-template-columns: 1fr auto"><b>${esc(p.name)}</b><span class="chip warn">${minutes(p.quietMs)}</span></div>`).join('')
    : `<p class="muted small">${state.counts.connected ? 'Everyone has taken part in the last 5 minutes.' : 'Nobody is here yet.'}</p>`;

  const open = state.questions.filter((q) => !q.answered).slice(0, 4);
  $('#p-q-count').textContent = `${state.questions.filter((q) => !q.answered).length} open`;
  $('#p-questions').innerHTML = open.length
    ? open.map((q) => `<div class="q" style="grid-template-columns: auto 1fr auto"><div class="votes"><b class="num">${q.votes}</b></div><div><div>${esc(q.text)}</div><div class="meta">${esc(q.author)}</div></div><button class="small" data-answered="${esc(q.id)}">Answered</button></div>`).join('')
    : '<p class="muted small">No questions yet.</p>';
  tickCountdown();
}

const tickCountdown = () => {
  for (const el of $$('[data-closes]')) el.textContent = formatClock(Number(el.dataset.closes) - (socket?.now() ?? Date.now()));
};
setInterval(tickCountdown, 500);

// Meet frames this page without clipboard permission, so the modern API usually fails here.
// Try it, then the older copy command, then show the link so it can be selected by hand.
async function copyJoinLink() {
  const text = `${location.origin}/j/${code}`;
  try {
    await navigator.clipboard.writeText(text);
    return toast('Join link copied');
  } catch { /* not allowed in this frame */ }
  const box = $('#p-link');
  box.value = text;
  box.focus();
  box.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* ignore */ }
  toast(copied ? 'Join link copied' : 'Select the link below and copy it');
}

// Asks Meet to invite everyone in the call to open Engage. People who cannot see the add-on
// (it is not installed or published for them) will not get it, so say what happened.
async function inviteCall() {
  const status = $('#p-invite-status');
  if (!activityClient) {
    status.textContent = 'Open Engage from Activities in Meet to invite the call. For now, share the join link below.';
    return;
  }
  try {
    await activityClient.startActivity();
    status.textContent = 'Invitation sent to the call. Anyone who does not see it can join with the link below.';
  } catch (error) {
    status.textContent = `Meet did not send the invitation (${error?.message || error?.errorType || 'unknown reason'}). Share the join link below instead.`;
  }
}

const pulse = () => send({ t: 'launchMoment', type: 'pulse', prompt: 'How is this meeting going for you?', durationSec: 45 });

// Sends an action; tells the host when the connection is down instead of silently doing nothing.
const send = (message) => {
  if (!socket || !socket.isOpen()) return toast('Not connected right now. Reconnecting, then try again.');
  socket.send(message);
};

let endArmed = null;
const disarmEnd = () => {
  clearTimeout(endArmed);
  endArmed = null;
  const btn = $('#p-end');
  btn.textContent = 'End meeting';
  btn.classList.remove('armed');
};

document.addEventListener('click', (event) => {
  const el = event.target.closest('button');
  if (!el || !socket) return;
  const { action } = el.dataset;
  if (el.id === 'p-pulse' || el.id === 'p-sugg-pulse') pulse();
  else if (action === 'floor') send({ t: 'floor' });
  else if (action === 'focus') send({ t: 'focus', on: el.dataset.on === '1' });
  else if (action === 'closeMoment') send({ t: 'closeMoment' });
  else if (action === 'dismissMoment') send({ t: 'dismissMoment' });
  else if (el.dataset.answered) send({ t: 'answered', id: el.dataset.answered, answered: true });
  else if (el.dataset.prepared) send({ t: 'launchPrepared', id: el.dataset.prepared });
  else if (el.id === 'p-copy') copyJoinLink();
  else if (el.id === 'p-invite-btn') inviteCall();
  else if (el.id === 'p-end') {
    // Meet blocks confirm() in add-on frames, so confirm in the page with a second press.
    if (endArmed) {
      disarmEnd();
      send({ t: 'end' });
    } else {
      el.textContent = 'Press again to end for everyone';
      el.classList.add('armed');
      endArmed = setTimeout(disarmEnd, 5000);
    }
  }
});

show('state-loading');
connectToMeet().then((ctx) => { clearTimeout(slowHint); return ctx && route(ctx); }).catch((error) => fail('Engage could not start', error.message));
