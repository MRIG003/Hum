import { $, $$, codeFromPath, connect, esc, formatClock, REACTION_LABELS, storage, toast } from './common.js';
import { renderChart } from './chart.js';

const code = codeFromPath();
const PROMPT_TYPES = { poll: 'poll', pulse: 'pulse check', recall: 'recall check', quiz: 'quiz', wordcloud: 'word cloud' };
// Inside the Meet side panel the host view is shown in a frame. The host key is then kept for this
// tab only (sessionStorage), so another Google account in the same browser never gets host controls.
const embedded = new URLSearchParams(location.search).get('embed') === '1';
if (embedded) document.body.classList.add('embed');
const tokenKey = `engage.host.${code}`;
const tokenStore = {
  get: () => {
    if (!embedded) return storage.get(tokenKey);
    try { return sessionStorage.getItem(tokenKey); } catch { return null; }
  },
  set: (value) => {
    if (!embedded) return storage.set(tokenKey, value);
    try { sessionStorage.setItem(tokenKey, value); } catch { /* blocked */ }
  },
  remove: () => {
    if (!embedded) return storage.remove(tokenKey);
    try { sessionStorage.removeItem(tokenKey); } catch { /* blocked */ }
  },
};
const hashToken = new URLSearchParams(location.hash.slice(1)).get('t');
if (hashToken) {
  tokenStore.set(hashToken);
  history.replaceState(null, '', location.pathname + location.search);
}
const hostToken = tokenStore.get();

// Meet blocks confirm() in add-on frames, so confirmations use an in-page dialog.
const confirmDialog = $('#confirm-dialog');
const confirmAction = (message, okLabel = 'Confirm') => new Promise((resolve) => {
  $('#confirm-text').textContent = message;
  $('#confirm-yes').textContent = okLabel;
  const done = (value) => {
    confirmDialog.close();
    confirmDialog.removeEventListener('cancel', onCancel);
    resolve(value);
  };
  const onCancel = () => done(false);
  $('#confirm-yes').onclick = () => done(true);
  $('#confirm-no').onclick = () => done(false);
  confirmDialog.addEventListener('cancel', onCancel);
  confirmDialog.showModal();
});

let state = null;
let momentKind = 'poll';
let dirty = { bingo: false, prediction: false, agenda: false };
let overrideArmed = false;

const live = $('#live');
const ended = $('#ended');

const link = () => `${location.origin}/j/${code}`;
const chatMessage = () =>
  `Join "${state?.title ?? 'our meeting'}" on Engage: ${link()}\n` +
  (state?.platform === 'meet' ? 'If you have the Engage add-on, you can also open it from the Activities button in Meet.\n' : '') +
  `Code: ${code}. Open it in a second window or on your phone. No sign-up. ` +
  `Please join with your real name, as it appears in this meeting. Reactions, questions and quick polls only.`;

// Without the private host link the server still lets the meeting's signed-in owner in by cookie.
if (!hostToken) $('#copy-host-link').hidden = true;
const authHeaders = () => (hostToken ? { 'x-host-token': hostToken } : {});
let mergeFrom = null;
const hiddenNudges = new Set();

const socket = connect({
  hello: () => ({ t: 'hello', role: 'host', code, hostToken: hostToken ?? undefined }),
  onState: (next) => {
    state = next;
    render();
  },
  onFatal: (message) => {
    $('#fatal').textContent = message;
    $('#fatal').hidden = false;
    live.hidden = true;
  },
  onError: (message) => toast(message),
  onMessage: (msg) => {
    if (msg.t === 'person') showPerson(msg.detail);
  },
  onStatus: (status) => {
    $('#conn').hidden = status === 'online';
  },
});

const act = (message) => socket.send(message);

// ---- rendering ------------------------------------------------------------

function render() {
  $('#title').textContent = state.title;
  document.title = `Engage · ${state.title}`;
  if (state.status === 'ended') {
    live.hidden = true;
    ended.hidden = false;
    $('#focus').hidden = true;
    $('#end').hidden = true;
    $('#clock-reset').hidden = true;
    renderSummary();
    return;
  }
  live.hidden = false;
  renderTop();
  renderBanners();
  renderTiles();
  renderChartCard();
  renderPeople();
  renderMoment();
  renderQuestions();
  renderReactions();
  renderGames();
  renderQuiet();
  renderAgenda();
  trackActivity();
}

// ---- "what is new" cues for the host tools menu -------------------------------
// Only one tool is on screen at a time in the Meet panel, so tell the host when something
// arrives in one they are not looking at.
const seen = { questions: null, reactionTotal: null };
const fresh = { questions: [], reactions: 0 };
const optionLabel = (value) => $(`#feature option[value="${value}"]`);
const baseLabels = {};
function trackActivity() {
  if (!embedded) return;
  const total = Object.values(state.reactions).reduce((a, b) => a + b, 0);
  const current = $('#feature').value;
  if (seen.questions) {
    for (const q of state.questions) {
      if (!seen.questions.has(q.id) && current !== 'questions') fresh.questions.push(q);
    }
    if (total > seen.reactionTotal && current !== 'reactions') fresh.reactions += total - seen.reactionTotal;
  }
  seen.questions = new Set(state.questions.map((q) => q.id));
  seen.reactionTotal = total;
  fresh.questions = fresh.questions.filter((q) => state.questions.some((x) => x.id === q.id && !x.answered));
  paintCues();
}

function paintCues() {
  for (const [value, text] of [['questions', fresh.questions.length ? `Questions (${fresh.questions.length} new)` : 'Questions'], ['reactions', fresh.reactions ? `Reactions (+${fresh.reactions})` : 'Reactions']]) {
    baseLabels[value] ??= optionLabel(value).textContent;
    optionLabel(value).textContent = text;
  }
  const latest = fresh.questions.at(-1);
  const parts = [];
  if (latest) {
    parts.push(`<div class="banner"><span><b>${esc(latest.author)} asked:</b> ${esc(latest.text)}${fresh.questions.length > 1 ? ` <span class="muted">(+${fresh.questions.length - 1} more)</span>` : ''}</span><button class="primary small" data-view="questions">View</button></div>`);
  }
  if (fresh.reactions) {
    parts.push(`<div class="banner"><span><b>${fresh.reactions} new ${fresh.reactions === 1 ? 'reaction' : 'reactions'}</b> from the room.</span><button class="small" data-view="reactions">View</button></div>`);
  }
  $('#notice').innerHTML = parts.join('');
}

function renderTop() {
  $('#link').textContent = link();
  $('#invite-hint').textContent = state.platform === 'meet'
    ? 'In Google Meet™, people who have the add-on can open Engage from Activities. Everyone else joins with this link, so paste it in the chat.'
    : 'Paste it in the meeting chat. Attendees open it in a second window, no account needed.';
  $('#code').textContent = code;
  const focus = $('#focus');
  focus.textContent = state.focus ? 'Resume everyone' : 'Focus moment';
  focus.classList.toggle('primary', state.focus);
  focus.dataset.on = state.focus ? '' : '1';
  tickClock();
}

function tickClock() {
  if (!state || state.status !== 'live') return;
  $('#clock').textContent = formatClock(socket.now() - state.startedAt);
}
setInterval(tickClock, 1000);

function renderBanners() {
  const parts = [];
  if (state.focus) {
    parts.push(`<div class="banner focus"><span><b>Focus moment is on.</b> Prompts and games are paused for everyone.</span><button data-action="focus" data-on="">Resume</button></div>`);
  }
  for (const suggestion of state.suggestions) {
    const buttons = suggestion.actions.map((action) => {
      if (action === 'recall') return '<button data-quick="recall" class="primary">Run a recall check</button>';
      if (action === 'pulse') return '<button data-quick="pulse">Run a pulse check</button>';
      if (action === 'floor') return '<button data-action="floor">Open the floor</button>';
      if (action === 'break') return '<button data-quick="break">Start a break block</button>';
      return '';
    }).join('');
    parts.push(`<div class="banner warn suggestion"><div><b>Suggestion.</b> ${esc(suggestion.text)}</div><div class="row">${buttons}</div></div>`);
  }
  const nudge = state.topicNudge;
  if (nudge && !hiddenNudges.has(nudge.promptId)) {
    parts.push(`<div class="banner"><div><b>${esc(nudge.topic)} is wrapping up.</b> You prepared a ${esc(PROMPT_TYPES[nudge.type] ?? nudge.type)}: “${esc(nudge.prompt)}”</div><div class="row"><button class="primary" data-launch-prepared="${esc(nudge.promptId)}" data-type="${esc(nudge.type)}">Launch it</button><button class="ghost" data-hide-nudge="${esc(nudge.promptId)}">Not now</button></div></div>`);
  }
  if (state.floorOpen) {
    parts.push('<div class="banner"><span>The floor is open: everyone was invited to share their view on the next topic.</span></div>');
  }
  $('#banners').innerHTML = parts.join('');
}

function renderTiles() {
  const { engagement, counts } = state;
  $('#t-eng').textContent = `${engagement.pct}%`;
  $('#t-eng-sub').textContent = counts.connected ? `${engagement.active} of ${counts.connected} active in the last 5 min` : 'Waiting for attendees';
  $('#t-part').textContent = `${counts.participated} of ${counts.joined}`;
  $('#t-part-sub').textContent = counts.joined ? 'Joined people with at least one action' : 'Nobody has joined yet';
  $('#t-conn').textContent = String(counts.connected);
  $('#t-conn-sub').textContent = counts.expected ? `${counts.joined} joined of ${counts.expected} expected` : `${counts.joined} joined in total`;
}

function renderChartCard() {
  renderChart($('#chart'), {
    series: state.series,
    dips: state.dips,
    events: state.events,
    startedAt: state.startedAt,
    now: socket.now(),
    segments: state.agenda.segments,
  });
}

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => state && state.status === 'live' && renderChartCard(), 150);
});

function resultsHtml(moment) {
  const r = moment.results;
  if (moment.type === 'poll' || moment.type === 'quiz') {
    return moment.options.map((option, i) => {
      const pct = r.total ? Math.round((r.counts[i] / r.total) * 100) : 0;
      const right = moment.type === 'quiz' && moment.correct === i;
      return `<div class="bar-row ${right ? 'right' : ''}"><span>${esc(option)}${right ? ' ✓' : ''}</span><div class="bar"><span style="width:${pct}%"></span></div><span class="num">${r.counts[i]}</span></div>`;
    }).join('');
  }
  if (moment.type === 'recall') {
    const row = (label, n, cls = '') => {
      const pct = r.total ? Math.round((n / r.total) * 100) : 0;
      return `<div class="bar-row ${cls}"><span>${label}</span><div class="bar"><span style="width:${pct}%"></span></div><span class="num">${n}</span></div>`;
    };
    return moment.options.map((o, i) => row(`${esc(o)}${moment.correct === i ? ' ✓' : ''}`, r.counts[i], moment.correct === i ? 'right' : '')).join('') + row('Missed that', r.missed, 'miss');
  }
  if (moment.type === 'pulse') {
    const max = Math.max(1, ...r.counts);
    const rows = r.counts.map((n, i) => `<div class="bar-row"><span>${i + 1}</span><div class="bar"><span style="width:${(n / max) * 100}%"></span></div><span class="num">${n}</span></div>`).join('');
    return `<p class="num" style="font-size: 24px; font-weight: 650">${r.average ?? '–'} <span class="small muted">average of 5</span></p>${rows}`;
  }
  const max = Math.max(1, ...r.words.map((w) => w.n));
  return `<div class="words">${r.words.map((w) => `<span style="font-size:${14 + (w.n / max) * 18}px">${esc(w.word)}</span>`).join('') || '<span class="muted">No answers yet</span>'}</div>`;
}

function renderMoment() {
  const card = $('#moment-card');
  const moment = state.moment;
  if (!moment) {
    card.hidden = true;
    card.innerHTML = '';
    return;
  }
  card.hidden = false;
  const open = moment.status === 'open';
  const countdown = open && moment.closesAt ? ` · closes in <span class="num" data-closes="${moment.closesAt}"></span>` : '';
  card.innerHTML = `
    <div class="card-head">
      <h2>${esc(moment.prompt)}</h2>
      <span class="chip ${open ? 'ok' : ''}">${open ? 'Open' : 'Closed'}</span>
    </div>
    <p class="small muted" style="margin-top: 4px">${moment.results.total} answered${countdown}${moment.auto ? ' · automatic' : ''}${state.focus ? ' · paused by Focus' : ''}</p>
    <div style="margin-top: 12px">${resultsHtml(moment)}</div>
    <div class="row" style="margin-top: 12px">
      ${open ? '<button data-action="closeMoment" class="primary">Close and show results</button>' : '<button data-action="dismissMoment">Dismiss</button>'}
    </div>`;
  updateCountdowns();
}

function updateCountdowns() {
  for (const el of $$('[data-closes]')) {
    el.textContent = formatClock(Number(el.dataset.closes) - socket.now());
  }
}
setInterval(updateCountdowns, 500);

function renderQuestions() {
  $('#q-count').textContent = `${state.questions.filter((q) => !q.answered).length} open`;
  const merging = mergeFrom && state.questions.some((q) => q.id === mergeFrom);
  if (!merging) mergeFrom = null;
  $('#questions').innerHTML = state.questions.length
    ? state.questions.map((q) => {
      const mergeBtn = !merging
        ? `<button data-merge-from="${esc(q.id)}" class="ghost small" title="Combine with a duplicate question">Merge…</button>`
        : q.id === mergeFrom
          ? '<button data-merge-cancel="1" class="small">Cancel merge</button>'
          : `<button data-merge-into="${esc(q.id)}" class="primary small">Merge here</button>`;
      return `
      <div class="q ${q.answered ? 'answered' : ''} ${q.pinned ? 'pinned' : ''}">
        <div class="votes"><b class="num">${q.votes}</b><div class="meta">votes</div></div>
        <div><div>${q.pinned ? '<span class="chip accent">Pinned</span> ' : ''}${esc(q.text)}</div><div class="meta">${esc(q.author)}${q.merged ? ` · ${q.merged + 1} similar combined` : ''}</div></div>
        <div class="row">
          <button data-pin="${esc(q.id)}" data-value="${q.pinned ? '' : '1'}" class="ghost small" aria-pressed="${q.pinned}">${q.pinned ? 'Unpin' : 'Pin'}</button>
          ${mergeBtn}
          <button data-answered="${esc(q.id)}" data-value="${q.answered ? '' : '1'}" class="small">${q.answered ? 'Reopen' : 'Answered'}</button>
          <button data-remove-q="${esc(q.id)}" class="ghost small" aria-label="Remove question">✕</button>
        </div>
      </div>`;
    }).join('')
    : '<p class="muted small">No questions yet. They will appear here, ranked by votes.</p>';
}

function renderReactions() {
  $('#reactions').innerHTML = Object.entries(REACTION_LABELS).map(([kind, { emoji, label }]) =>
    `<div class="reaction-tile"><b class="num">${state.reactions[kind] ?? 0}</b>${emoji} ${esc(label)}</div>`).join('');
}

function renderGames() {
  $('#games-state').textContent = state.focus ? 'Paused by Focus' : state.gamesOpen ? 'Open' : 'Closed';
  $('#games-state').className = `chip ${state.gamesOpen && !state.focus ? 'ok' : ''}`;
  const toggle = $('#games-toggle');
  toggle.textContent = state.gamesOpen ? 'Close games' : 'Open games now';
  toggle.dataset.on = state.gamesOpen ? '' : '1';

  $('#windows').innerHTML = state.gameWindows.length
    ? state.gameWindows.map((w) => `<div class="row spread"><span>${esc(w.label)} <span class="muted small num">at ${w.startMin} min for ${w.durationMin} min</span></span><button data-remove-w="${esc(w.id)}" class="ghost small" aria-label="Remove window">✕</button></div>`).join('')
    : '<p class="small muted">No windows yet. Add one, for example a break block.</p>';

  const prediction = state.prediction;
  if (!dirty.prediction && document.activeElement !== $('#p-question')) $('#p-question').value = prediction.question;
  $('#p-counts').textContent = `Yes ${prediction.yes} · No ${prediction.no}`;
  $('#p-actions').innerHTML = prediction.status === 'resolved'
    ? `<span class="chip ok">Resolved: ${prediction.result === 'yes' ? 'Yes' : 'No'}</span>`
    : '<button data-resolve="yes" class="small">Resolve Yes</button><button data-resolve="no" class="small">Resolve No</button>';

  if (!dirty.bingo && document.activeElement !== $('#b-words')) $('#b-words').value = state.bingoWords.join('\n');
}

function renderAgenda() {
  if (!dirty.agenda && document.activeElement !== $('#ag-text')) $('#ag-text').value = state.agenda.text;
  const segs = state.agenda.segments;
  $('#ag-list').innerHTML = segs.length
    ? segs.map((s) => `<div class="stack" style="gap: 4px"><div class="row spread"><span><b>${esc(s.title)}</b> <span class="muted num">${s.startMin} to ${s.endMin} min</span></span><span class="num muted">${s.avg === null ? 'no data yet' : `${s.avg}% avg`}</span></div>${
      (s.prompts ?? []).map((p) => `<div class="row spread prepared ${p.used ? 'used' : ''}"><span class="small">${p.used ? '✓ ' : ''}<span class="chip">${esc(PROMPT_TYPES[p.type] ?? p.type)}</span> ${esc(p.prompt)}</span><span class="row"><button class="small" data-launch-prepared="${esc(p.id)}" data-type="${esc(p.type)}">${p.used ? 'Launch again' : 'Launch'}</button><button class="ghost small" data-remove-prompt="${esc(p.id)}" aria-label="Remove prepared prompt">✕</button></span></div>`).join('')}</div>`).join('')
    : '<p class="muted">No agenda yet. Add topics to see engagement by topic, and to prepare prompts for each topic.</p>';
  const select = $('#f-topic');
  const chosen = select.value;
  select.innerHTML = '<option value="">Right now</option>' + segs.map((s) => `<option value="${esc(s.title)}">Later, near the end of ${esc(s.title)}</option>`).join('');
  if ([...select.options].some((o) => o.value === chosen)) select.value = chosen;
  $('#f-topic-wrap').hidden = segs.length === 0;
  syncMomentForm();
}

function renderQuiet() {
  if (document.activeElement !== $('#quiet-on')) $('#quiet-on').checked = state.quiet.on;
  if (document.activeElement !== $('#quiet-every')) $('#quiet-every').value = String(state.quiet.everyMin);
}


// ---- people: who has been quiet, and per-person detail -----------------------------

let quietAfterMin = Number(storage.get('engage.quietAfter')) || 5;
let showEveryone = false;

const minutesText = (ms) => {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? '< 1 min' : `${m} min`;
};

function renderPeople() {
  const select = $('#quiet-after');
  if (document.activeElement !== select) select.value = String(quietAfterMin);
  const people = state.people ?? [];
  const limit = quietAfterMin * 60_000;
  const quiet = people.filter((p) => p.connected && !p.presenting && p.quietMs >= limit);
  const rows = showEveryone ? people : quiet;
  $('#people-all').setAttribute('aria-pressed', String(showEveryone));
  $('#people-all').textContent = showEveryone ? 'Show only quiet' : `Show everyone (${people.length})`;

  if (!rows.length) {
    $('#people-list').innerHTML = `<p class="muted">${people.length
      ? `Everyone connected has taken part in the last ${quietAfterMin} minutes.`
      : 'Nobody has joined yet.'}</p>`;
    return;
  }
  $('#people-list').innerHTML = rows.map((p) => {
    const status = !p.connected ? 'Left the meeting window'
      : p.presenting ? 'Presenting'
        : p.neverActed ? `No activity since joining, ${minutesText(p.quietMs)} ago`
          : `No activity for ${minutesText(p.quietMs)}`;
    const tone = !p.connected ? '' : p.presenting ? 'accent' : p.quietMs >= limit ? 'warn' : 'ok';
    return `<button class="person-row" data-person="${esc(p.id)}"><b>${esc(p.name)}</b><span class="chip ${tone}">${esc(status)}</span><span class="muted small num">${p.actions} ${p.actions === 1 ? 'action' : 'actions'}</span></button>`;
  }).join('');
}

const STATUS_LABEL = { answered: 'Answered', none: 'Did not answer' };

function showPerson(d) {
  const maxBar = Math.max(1, ...d.timeline.map((t) => t.count));
  const reactions = Object.entries(REACTION_LABELS)
    .map(([kind, { emoji, label }]) => `<div class="reaction-tile"><b class="num">${d.reactionsByKind[kind] ?? 0}</b>${emoji} ${esc(label)}</div>`).join('');
  const prompts = d.prompts.length
    ? d.prompts.map((p) => `<div class="row spread" style="padding: 5px 0; border-top: 1px solid var(--border)"><span class="small">${esc(p.prompt)}</span><span class="chip ${p.status === 'none' ? 'warn' : 'ok'}">${STATUS_LABEL[p.status]}</span></div>`).join('')
    : '<p class="muted small">No prompts were run while they were here.</p>';
  const questions = d.questions.length
    ? d.questions.map((q) => `<div class="small" style="padding: 4px 0">“${esc(q.text)}” <span class="muted">${q.votes} ${q.votes === 1 ? 'vote' : 'votes'}${q.answered ? ', answered' : ''}</span></div>`).join('')
    : '<p class="muted small">Asked no questions.</p>';
  $('#person-body').innerHTML = `
    <div class="row spread"><h2>${esc(d.name)}</h2><span class="chip ${d.connected ? 'ok' : ''}">${d.presenting ? 'Presenting' : d.connected ? 'In the meeting window' : 'Left the meeting window'}</span></div>
    <div class="tiles" style="margin-top: 12px">
      <div class="tile"><div class="label">Time in Engage</div><div class="value num">${d.minutesIn} min</div></div>
      <div class="tile"><div class="label">Quiet right now</div><div class="value num">${minutesText(d.quietMs)}</div><div class="sub">${d.lastActionAt ? 'since their last action' : 'since joining'}</div></div>
      <div class="tile"><div class="label">Longest quiet stretch</div><div class="value num">${minutesText(d.longestQuietMs)}</div></div>
    </div>
    <h3 style="margin-top: 16px">Activity every 5 minutes</h3>
    <div class="bars" role="img" aria-label="Actions per 5 minutes">${d.timeline.map((t) => `<div class="bar-col"><span style="height:${Math.round((t.count / maxBar) * 100)}%" title="${t.count}"></span><small>${t.fromMin}</small></div>`).join('')}</div>
    <p class="small muted">Minutes since the meeting clock started. Taller means more actions in Engage.</p>
    <h3 style="margin-top: 14px">Reactions</h3><div class="reaction-grid">${reactions}</div>
    <h3 style="margin-top: 14px">Prompts (${d.answeredPrompts} of ${d.prompts.length} answered)</h3>${prompts}
    <h3 style="margin-top: 14px">Questions</h3>${questions}
    <p class="small muted" style="margin-top: 12px">Engage only sees actions inside Engage. Points, bingo cards, predictions and notes stay private to each person.</p>`;
  if (!$('#person-dialog').open) $('#person-dialog').showModal();
}

$('#person-close').addEventListener('click', () => $('#person-dialog').close());
$('#quiet-after').addEventListener('change', () => {
  quietAfterMin = Number($('#quiet-after').value);
  storage.set('engage.quietAfter', quietAfterMin);
  renderPeople();
});
$('#people-all').addEventListener('click', () => {
  showEveryone = !showEveryone;
  renderPeople();
});
document.addEventListener('click', (event) => {
  const row = event.target.closest('[data-person]');
  if (row) act({ t: 'person', pid: row.dataset.person });
});

// ---- summary --------------------------------------------------------------

const summaryText = (s) => {
  const lines = [
    `# ${state.title}: Engage summary`,
    '',
    `- Duration: ${formatClock(s.durationMs)}`,
    `- Joined: ${s.joined}${s.expected ? ` of ${s.expected} expected` : ''}`,
    `- Took part in Engage: ${s.participated} (${s.participationRate}%)`,
    `- Average room engagement: ${s.averageEngagement ?? 'n/a'}%`,
    `- Share of actions from the top 20% most active people: ${s.spreadTop20 ?? 'n/a'}%`,
    `- Open questions left: ${s.unanswered}`,
    '',
    '## Moments',
  ];
  for (const m of s.moments) {
    lines.push(`- ${m.prompt} (${m.type}, ${m.results.total} answered)`);
  }
  if (s.agenda.length) {
    lines.push('', '## Engagement by topic');
    for (const a of s.agenda) lines.push(`- ${a.title} (${a.startMin} to ${a.endMin} min): ${a.avg === null ? 'no data' : `${a.avg}% average, lowest ${a.low}%`}`);
  }
  lines.push('', '## Coach summary (host only)');
  for (const i of s.coach.insights) lines.push(`- ${i.title} ${i.detail}`);
  lines.push(`- Next time: ${s.coach.next}`);
  lines.push('', '## Top questions');
  for (const q of s.topQuestions) lines.push(`- ${q.text} (${q.votes} votes${q.answered ? ', answered' : ''})`);
  return lines.join('\n');
};

function renderSummary() {
  const s = state.summary;
  const tiles = [
    ['Duration', formatClock(s.durationMs), ''],
    ['Took part', `${s.participationRate}%`, `${s.participated} of ${s.joined} who joined`],
    ['Average engagement', s.averageEngagement === null ? '–' : `${s.averageEngagement}%`, 'Across the meeting'],
    ['Spread of participation', s.spreadTop20 === null ? '–' : `${s.spreadTop20}%`, 'of actions from the top 20% of people. Lower is more even'],
  ].map(([label, value, sub]) => `<div class="tile"><div class="label">${label}</div><div class="value num">${value}</div><div class="sub">${esc(sub)}</div></div>`).join('');

  const moments = s.moments.length
    ? s.moments.map((m) => `<div class="stack" style="padding: 10px 0; border-top: 1px solid var(--border)"><div class="row spread"><b>${esc(m.prompt)}</b><span class="chip">${esc(m.type)} · ${m.results.total} answered</span></div>${resultsHtml({ ...m, status: 'closed' })}</div>`).join('')
    : '<p class="muted">No moments were run.</p>';

  const questions = s.topQuestions.length
    ? s.topQuestions.map((q) => `<div class="q ${q.answered ? 'answered' : ''}"><div class="votes"><b class="num">${q.votes}</b><div class="meta">votes</div></div><div><div>${esc(q.text)}</div><div class="meta">${esc(q.author)}${q.answered ? ' · answered' : ''}</div></div><span></span></div>`).join('')
    : '<p class="muted">No questions were asked.</p>';

  const reactions = Object.entries(REACTION_LABELS).map(([kind, { emoji, label }]) =>
    `<div class="reaction-tile"><b class="num">${s.reactionTotals[kind] ?? 0}</b>${emoji} ${esc(label)}</div>`).join('');

  const coach = `<section class="card"><div class="card-head"><h2>Your coach summary</h2><span class="chip">Only you can see this</span></div>${
    s.coach.insights.length ? s.coach.insights.map((i, n) => `<div class="q" style="grid-template-columns: 28px 1fr; margin-top: 8px"><b class="chip accent" style="justify-content:center">${n + 1}</b><div><div><b>${esc(i.title)}</b></div><div class="muted small">${esc(i.detail)}</div></div></div>`).join('') : '<p class="muted" style="margin-top: 8px">Nothing needs attention. Engagement held up well.</p>'}<div class="tile" style="margin-top: 10px"><div class="label">Try this next time</div><div>${esc(s.coach.next)}</div></div></section>`;
  const agendaCard = s.agenda.length ? `<section class="card"><h2>Engagement by topic</h2>${s.agenda.map((a) => `<div class="bar-row" style="grid-template-columns: minmax(80px, 34%) 1fr 56px"><span>${esc(a.title)}</span><div class="bar"><span style="width:${a.avg ?? 0}%"></span></div><span class="num">${a.avg === null ? '–' : a.avg + '%'}</span></div>`).join('')}</section>` : '';

  const peopleCard = s.people?.length ? `<section class="card"><div class="card-head"><h2>People</h2><span class="chip">Only you can see this</span></div><div class="people" style="margin-top: 8px">${s.people.map((p) => `<button class="person-row" data-person="${esc(p.id)}"><b>${esc(p.name)}</b><span class="chip ${p.actions ? 'ok' : 'warn'}">${p.actions ? `${p.actions} ${p.actions === 1 ? 'action' : 'actions'}` : 'No activity'}</span><span class="muted small">Longest quiet stretch ${esc(minutesText(p.longestQuietMs))}</span></button>`).join('')}</div><p class="small muted" style="margin-top: 8px">Select a name for their details. Engage only sees actions inside Engage.</p></section>` : '';

  ended.innerHTML = `
    <div class="row spread"><div><h1>Meeting summary</h1><p class="muted">${esc(state.title)}</p></div>
      <div class="row"><button id="copy-summary">Copy as text</button><button id="download-summary" class="primary">Download .md</button><button id="export-csv">Export CSV</button><a href="/"><button>New meeting</button></a><button id="delete-meeting" class="danger">Delete meeting</button></div></div>
    <div class="summary-grid">${tiles}</div>
    ${coach}
    ${peopleCard}
    <section class="card"><div class="card-head"><h2>Engagement over the meeting</h2></div><svg id="summary-chart" class="chart" role="img" aria-label="Engagement over time"></svg></section>
    <div class="host-grid">
      <section class="card"><h2>Moments</h2>${moments}</section>
      <div class="stack">
        ${agendaCard}
        <section class="card"><h2>Top questions</h2><div class="q-list">${questions}</div><p class="small muted" style="margin-top: 8px">${s.unanswered} still open</p></section>
        <section class="card"><h2>Reactions</h2><div class="reaction-grid">${reactions}</div></section>
        <section class="card"><h2>Prediction</h2><p>${esc(s.prediction.question)}</p><p class="muted small">Yes ${s.prediction.yes} · No ${s.prediction.no}${s.prediction.result ? ` · Result: ${s.prediction.result === 'yes' ? 'Yes' : 'No'}` : ''}</p></section>
      </div>
    </div>`;
  fetch('/api/config').then((r) => r.json()).then((c) => {
    if (c.surveyUrl && !$('#survey-line')) ended.insertAdjacentHTML('beforeend', `<p id="survey-line" class="muted">Help us improve Engage. <a href="${esc(c.surveyUrl)}" target="_blank" rel="noopener noreferrer">Share quick feedback</a>.</p>`);
  }).catch(() => {});
  renderChart($('#summary-chart'), {
    series: s.series,
    dips: s.dips,
    events: s.events,
    startedAt: state.startedAt,
    now: state.startedAt + s.durationMs,
    segments: s.agenda,
  });
  $('#export-csv').onclick = exportCsv;
  $('#delete-meeting').onclick = deleteMeeting;
  $('#copy-summary').onclick = () => copy(summaryText(s), 'Summary copied');
  $('#download-summary').onclick = () => {
    const blob = new Blob([summaryText(s)], { type: 'text/markdown' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `engage-${code}.md` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

// ---- events ---------------------------------------------------------------

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    return toast(message);
  } catch { /* the clipboard API is blocked inside Meet frames */ }
  const box = Object.assign(document.createElement('textarea'), { value: text });
  box.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.append(box);
  box.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { /* ignore */ }
  box.remove();
  if (copied) return toast(message);
  toast('Could not copy. Select the link and copy it by hand.');
  if (embedded) {
    showFeature('invite');
    const range = document.createRange();
    range.selectNodeContents($('#link'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }
}

$('#copy-link').addEventListener('click', () => copy(link(), 'Link copied'));
$('#copy-message').addEventListener('click', () => copy(chatMessage(), 'Chat message copied'));
$('#copy-host-link').addEventListener('click', () => copy(`${location.origin}/h/${code}#t=${hostToken}`, 'Private host link copied. Anyone with it can control the meeting.'));
$('#clock-reset').addEventListener('click', async () => {
  if (await confirmAction('Restart the meeting clock and the engagement chart from now?', 'Restart')) act({ t: 'resetClock' });
});

document.addEventListener('click', async (event) => {
  const el = event.target.closest('button');
  if (!el) return;
  const { action, quick } = el.dataset;

  if (el.dataset.view) showFeature(el.dataset.view);
  else if (action === 'focus') act({ t: 'focus', on: el.dataset.on === '1' });
  else if (action === 'games') act({ t: 'games', on: el.dataset.on === '1' });
  else if (action === 'floor') act({ t: 'floor' });
  else if (action === 'closeMoment') act({ t: 'closeMoment' });
  else if (action === 'dismissMoment') act({ t: 'dismissMoment' });
  else if (action === 'end') {
    if (await confirmAction('End the meeting for everyone and build the summary?', 'End meeting')) act({ t: 'end' });
  } else if (quick === 'recall') {
    $('#moment-tabs [data-kind="recall"]').click();
    $('#moment-form').scrollIntoView({ block: 'center', behavior: 'smooth' });
    $('#f-prompt').focus();
  } else if (quick === 'pulse') {
    act({ t: 'launchMoment', type: 'pulse', prompt: 'How is this meeting going for you?', durationSec: 45 });
  } else if (quick === 'break') {
    const elapsed = Math.ceil((socket.now() - state.startedAt) / 60_000);
    act({ t: 'addWindow', startMin: elapsed, durationMin: 5, label: 'Break block' });
    act({ t: 'games', on: true });
  } else if (el.dataset.answered) act({ t: 'answered', id: el.dataset.answered, answered: el.dataset.value === '1' });
  else if (el.dataset.pin) act({ t: 'pin', id: el.dataset.pin, on: el.dataset.value === '1' });
  else if (el.dataset.mergeFrom) { mergeFrom = el.dataset.mergeFrom; renderQuestions(); }
  else if (el.dataset.mergeCancel) { mergeFrom = null; renderQuestions(); }
  else if (el.dataset.mergeInto) { act({ t: 'merge', from: mergeFrom, into: el.dataset.mergeInto }); mergeFrom = null; }
  else if (el.dataset.launchPrepared) {
    const capped = el.dataset.type === 'recall' && state.recallNextAt > socket.now();
    const override = capped && await confirmAction(`The next recall check is available in ${formatClock(state.recallNextAt - socket.now())}. Run it now anyway?`, 'Run it now');
    if (!capped || override) act({ t: 'launchPrepared', id: el.dataset.launchPrepared, override });
  } else if (el.dataset.removePrompt) act({ t: 'removePrompt', id: el.dataset.removePrompt });
  else if (el.dataset.hideNudge) { hiddenNudges.add(el.dataset.hideNudge); renderBanners(); }
  else if (el.dataset.removeQ) act({ t: 'removeQuestion', id: el.dataset.removeQ });
  else if (el.dataset.removeW) act({ t: 'removeWindow', id: el.dataset.removeW });
  else if (el.dataset.resolve) act({ t: 'resolvePrediction', result: el.dataset.resolve });
});

// moment form
const optionLines = () => $('#f-options').value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6);

function syncMomentForm() {
  const needsOptions = momentKind === 'poll' || momentKind === 'recall';
  $('#f-options-wrap').hidden = !needsOptions;
  $('#f-correct-wrap').hidden = momentKind !== 'recall';
  const note = $('#f-recall-note');
  note.hidden = momentKind !== 'recall';
  if (momentKind === 'recall' && state) {
    const wait = state.recallNextAt - socket.now();
    note.textContent = 'Includes "Missed that", counted separately from wrong answers. ' + (wait > 0 ? `Next check available in ${formatClock(wait)}. Press Launch twice to override.` : 'One check per 15 minutes.');
  }
  const placeholders = {
    poll: 'Should we ship on Friday?',
    pulse: 'How is this meeting going for you?',
    recall: 'Which option did we just choose?',
    wordcloud: 'One word for how you feel about the plan',
  };
  $('#f-prompt').placeholder = placeholders[momentKind];
  if (momentKind === 'recall') {
    const options = optionLines();
    const current = $('#f-correct').value;
    $('#f-correct').innerHTML = options.map((o, i) => `<option value="${i}">${esc(o)}</option>`).join('');
    if (current && Number(current) < options.length) $('#f-correct').value = current;
  }
}

$('#moment-tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-kind]');
  if (!tab) return;
  momentKind = tab.dataset.kind;
  overrideArmed = false;
  $('#f-submit').textContent = $('#f-topic').value ? 'Save for later' : 'Launch';
  $('#f-duration').value = momentKind === 'recall' ? '20' : '60';
  for (const t of $$('#moment-tabs button')) t.setAttribute('aria-selected', String(t === tab));
  syncMomentForm();
});
$('#f-options').addEventListener('input', syncMomentForm);
$('#f-topic').addEventListener('change', () => {
  $('#f-submit').textContent = $('#f-topic').value ? 'Save for later' : 'Launch';
});

$('#moment-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const error = $('#f-error');
  const prompt = $('#f-prompt').value.trim() || $('#f-prompt').placeholder;
  const options = optionLines();
  if ((momentKind === 'poll' || momentKind === 'recall') && options.length < 2) {
    error.textContent = 'Add at least two options, one per line.';
    error.hidden = false;
    return;
  }
  error.hidden = true;
  const topic = $('#f-topic').value;
  if (topic) {
    act({
      t: 'addPrompt',
      topic,
      type: momentKind,
      prompt,
      options,
      correct: momentKind === 'recall' ? Number($('#f-correct').value) : null,
      durationSec: Number($('#f-duration').value),
    });
    toast(`Saved for ${topic}. You will get a gentle reminder near the end of the topic.`);
    $('#f-prompt').value = '';
    $('#f-options').value = '';
    syncMomentForm();
    return;
  }
  const capped = momentKind === 'recall' && state.recallNextAt > socket.now();
  if (capped && !overrideArmed) {
    overrideArmed = true;
    error.textContent = `The next recall check is available in ${formatClock(state.recallNextAt - socket.now())}. Press Launch again to run it now.`;
    error.hidden = false;
    $('#moment-form button[type="submit"]').textContent = 'Launch anyway';
    return;
  }
  $('#moment-form button[type="submit"]').textContent = 'Launch';
  act({
    t: 'launchMoment',
    override: overrideArmed,
    type: momentKind,
    prompt,
    options,
    correct: momentKind === 'recall' ? Number($('#f-correct').value) : null,
    durationSec: Number($('#f-duration').value),
  });
  overrideArmed = false;
  $('#f-prompt').value = '';
  $('#f-options').value = '';
  syncMomentForm();
});

$('#agenda-form').addEventListener('submit', (event) => {
  event.preventDefault();
  dirty.agenda = false;
  act({ t: 'setAgenda', text: $('#ag-text').value });
  toast('Agenda saved');
});
$('#ag-text').addEventListener('input', () => { dirty.agenda = true; });

$('#window-form').addEventListener('submit', (event) => {
  event.preventDefault();
  act({
    t: 'addWindow',
    label: $('#w-label').value,
    startMin: Number($('#w-start').value),
    durationMin: Number($('#w-len').value),
  });
  event.target.reset();
});

$('#prediction-form').addEventListener('submit', (event) => {
  event.preventDefault();
  dirty.prediction = false;
  act({ t: 'setPrediction', question: $('#p-question').value });
});
$('#p-question').addEventListener('input', () => { dirty.prediction = true; });

$('#bingo-form').addEventListener('submit', (event) => {
  event.preventDefault();
  dirty.bingo = false;
  act({ t: 'bingoWords', words: $('#b-words').value.split('\n') });
  toast('Bingo words saved. Cards were reset.');
});
$('#b-words').addEventListener('input', () => { dirty.bingo = true; });

const sendQuiet = () => act({ t: 'quiet', on: $('#quiet-on').checked, everyMin: Number($('#quiet-every').value) });
$('#quiet-on').addEventListener('change', sendQuiet);
$('#quiet-every').addEventListener('change', sendQuiet);

async function exportCsv() {
  if (embedded) return window.open($('#export-site').href, '_blank', 'noopener');
  const res = await fetch(`/api/meetings/${code}/export.csv`, { headers: authHeaders() });
  if (!res.ok) return toast('Could not export. Only the host can export results.');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: `engage-${code}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function deleteMeeting() {
  if (!await confirmAction('Delete this meeting and all its results for good? This cannot be undone.', 'Delete')) return;
  const res = await fetch(`/api/meetings/${code}`, { method: 'DELETE', headers: authHeaders() });
  if (!res.ok) return toast('Could not delete the meeting.');
  tokenStore.remove();
  location.href = embedded ? '/meet/panel' : '/meetings';
}

$('#export-live').addEventListener('click', exportCsv);
$('#delete-live').addEventListener('click', deleteMeeting);

const joinDialog = $('#join-dialog');
$('#show-join').addEventListener('click', () => {
  $('#join-qr').src = `/api/qr/${code}.svg`;
  $('#join-short').textContent = `${location.host}/${code}`;
  joinDialog.showModal();
});
$('#join-close').addEventListener('click', () => joinDialog.close());

fetch('/api/auth/me').then((r) => r.json()).then((me) => {
  const a = $('#account');
  if (me.email) {
    a.textContent = 'My meetings';
    a.href = '/meetings';
    a.title = me.email;
  } else a.href = `/login?next=${encodeURIComponent(location.pathname)}`;
}).catch(() => {});

// ---- host tools menu (Meet side panel) -----------------------------------------
const featureSelect = $('#feature');
const featureKey = `engage.feature.${code}`;
const showFeature = (name) => {
  for (const el of $$('[data-feature]')) {
    if (el.dataset.feature === name) el.removeAttribute('data-off');
    else el.setAttribute('data-off', '');
  }
  if (name === 'games') $('#games-fold').open = true;
  featureSelect.value = name;
  if (name === 'questions') fresh.questions = [];
  if (name === 'reactions') fresh.reactions = 0;
  if (state) paintCues();
  try { sessionStorage.setItem(featureKey, name); } catch { /* ignore */ }
};
if (embedded) {
  $('#feature-bar').hidden = false;
  let saved = null;
  try { saved = sessionStorage.getItem(featureKey); } catch { /* ignore */ }
  // First time in: land on the meeting code and invite link; after that the host's last tool is remembered.
  showFeature([...featureSelect.options].some((o) => o.value === saved) ? saved : 'invite');

  featureSelect.addEventListener('change', () => showFeature(featureSelect.value));

  // The CSV is downloaded on the website after signing in; the meeting is saved to the account.
  const consoleUrl = `/h/${code}${hostToken ? `#t=${hostToken}` : ''}`;
  $('#export-site').href = `/login?next=${encodeURIComponent(consoleUrl)}`;
  $('#copy-host-link').hidden = true;
  const openConsole = $('#open-console');
  openConsole.hidden = !hostToken;
  openConsole.addEventListener('click', () => window.open(consoleUrl, '_blank', 'noopener'));
  $('#show-join').hidden = true;
  addInviteButton();
}

// "Invite everyone in this call" needs the Meet add-ons SDK, so only add it where that works.
async function addInviteButton() {
  try {
    const config = await fetch('/api/config').then((r) => r.json());
    if (!config.googleCloudProjectNumber) return;
    const { meet } = await import('/vendor/meet.addons.mjs');
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000));
    const client = await Promise.race([
      meet.addon.createAddonSession({ cloudProjectNumber: config.googleCloudProjectNumber }).then((s) => s.createSidePanelClient()),
      timeout,
    ]);
    const button = Object.assign(document.createElement('button'), { id: 'invite-call', textContent: 'Invite everyone in this call', className: 'primary' });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await client.startActivity();
        toast('Invitation sent to the call');
      } catch (error) {
        toast(`Meet did not send the invitation (${error?.message || 'unknown reason'}). Share the link instead.`);
      }
      button.disabled = false;
    });
    $('#copy-message').before(button);
    $('#copy-message').classList.remove('primary');
  } catch { /* not inside Meet: the join link still works */ }
}

syncMomentForm();

// Close the "More" menu after choosing an action or clicking elsewhere.
document.addEventListener('click', (event) => {
  for (const menu of $$('.menu[open]')) {
    if (!menu.contains(event.target) || event.target.closest('.menu-pop button')) menu.open = false;
  }
});
