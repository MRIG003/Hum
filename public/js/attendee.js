import { $, $$, codeFromPath, connect, esc, formatClock, REACTION_LABELS, storage, toast } from './common.js';
import { hasWaiting, momentHtml, resultsHtml } from './views.js';
import { createMini } from './mini.js';

const code = codeFromPath();
const identityKey = `engage.p.${code}`;
const notesKey = `engage.notes.${code}`;

let identity = storage.get(identityKey);
let state = null;
let socket = null;
let momentKey = '';
let notes = storage.get(notesKey) ?? { text: '', todos: [] };
let surveyUrl = null;
let presenting = false;
const embedded = new URLSearchParams(location.search).get('embed') === '1';
if (embedded) document.body.classList.add('embed');
let skipped = 0;
let seenMomentId = null;
let seenFloor = false;
const baseTitle = () => document.title.replace(/^● /, '');

const mini = createMini({
  send: (message) => socket?.send(message),
  now: () => socket?.now() ?? Date.now(),
  onClosed: () => renderMiniButton(),
  onPresent: () => setPresenting(true),
});

const gate = $('#gate');
const app = $('#app');
const recap = $('#recap');

const showFatal = (message) => {
  gate.hidden = true;
  app.hidden = true;
  $('#fatal').textContent = message;
  $('#fatal').hidden = false;
};

// ---- entry ----------------------------------------------------------------

async function start() {
  fetch('/api/config').then((r) => r.json()).then((c) => {
    surveyUrl = c.surveyUrl;
    $('#build').textContent = `Participant view · build ${c.build}`;
  }).catch(() => {});
  const response = await fetch(`/api/meetings/${code}`);
  if (!response.ok) return showFatal('We could not find that meeting. Check the code or link with the host.');
  const meeting = await response.json();
  $('#title').textContent = meeting.title;
  document.title = `Engage · ${meeting.title}`;
  if (meeting.status === 'ended') return showFatal('This meeting has ended.');

  $('#gate-sub').textContent = meeting.title;
  if (identity?.pid) return join();
  gate.hidden = false;
  // The public demo opens the participant view with a name already filled in.
  const preset = new URLSearchParams(location.search).get('name');
  if (embedded && preset) {
    $('#name').value = preset.slice(0, 60);
    return $('#join-form').requestSubmit();
  }
  $('#name').focus();
}

function join() {
  gate.hidden = true;
  socket = connect({
    hello: () => ({
      t: 'hello',
      role: 'attendee',
      code,
      pid: identity?.pid,
      token: identity?.token,
      name: identity?.name,
    }),
    onWelcome: (msg) => {
      identity = { pid: msg.pid, token: msg.token, name: msg.name };
      storage.set(identityKey, identity);
      if (presenting) socket?.send({ t: 'presenting', on: true });
    },
    onState: (next) => {
      state = next;
      render();
    },
    onFatal: (message) => {
      storage.remove(identityKey);
      if (!identity?.pid && gate) {
        // A name that was not accepted: let the person fix it instead of ending up on a dead page.
        socket?.close();
        identity = null;
        gate.hidden = false;
        $('#join-error').textContent = message;
        $('#join-error').hidden = false;
        $('#name').focus();
        return;
      }
      showFatal(message);
    },
    onError: (message) => toast(message),
    onStatus: (status) => {
      $('#conn').hidden = status === 'online';
    },
  });
}

$('#join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#name').value.trim();
  const error = $('#join-error');
  if (name.length < 2) {
    error.textContent = 'Enter your name as it appears in the meeting.';
    error.hidden = false;
    return;
  }
  error.hidden = true;
  identity = { name };
  join();
});

const act = (message) => socket?.send(message);

// ---- rendering ------------------------------------------------------------

function render() {
  $('#role-chip').hidden = false;
  if (state.status === 'ended') return renderRecap();
  app.hidden = false;
  $('#fatal').hidden = true;
  $('#clock').hidden = false;
  $('#points').hidden = false;
  $('#points').textContent = `${state.me.points} pts`;
  trackPresenting();
  trackPrompting();
  renderBanners();
  renderMoment();
  renderQuestions();
  renderGames();
  renderMiniButton();
  mini.update(state);
  updateTitleBadge();
  tick();
}

// ---- presenting mode and the mini window ------------------------------------

function trackPresenting() {
  const id = state.moment?.id ?? null;
  if (presenting && id && id !== seenMomentId) skipped += 1;
  if (presenting && state.floorOpen && !seenFloor) skipped += 1;
  seenMomentId = id;
  seenFloor = state.floorOpen;
}

function setPresenting(on) {
  presenting = on;
  try { sessionStorage.setItem(`engage.presenting.${code}`, on ? '1' : ''); } catch { /* storage can be blocked */ }
  if (on) {
    skipped = 0;
    mini.close();
  }
  socket?.send({ t: 'presenting', on });
  if (state) {
    renderBanners();
    renderMiniButton();
  }
}

function renderMiniButton() {
  const pop = $('#pop-out');
  const sw = $('#presenting');
  pop.hidden = embedded; // inside the Meet panel there is nothing to float
  sw.hidden = false;
  pop.textContent = mini.isOpen() ? 'Mini window open' : 'Mini window';
  pop.disabled = mini.isOpen();
  sw.setAttribute('aria-checked', String(presenting));
}

function updateTitleBadge() {
  const waiting = hasWaiting(state) && document.hidden && !mini.isOpen();
  document.title = `${waiting ? '● ' : ''}${baseTitle()}`;
}
document.addEventListener('visibilitychange', () => state && updateTitleBadge());

$('#pop-out').addEventListener('click', async () => {
  if (presenting) return toast('Turn off presenting first.');
  const ok = await mini.open();
  if (!ok) return toast('The browser blocked the mini window. Allow pop-ups for this site.');
  renderMiniButton();
  mini.update(state);
});
$('#presenting').addEventListener('click', () => setPresenting(!presenting));
try { presenting = sessionStorage.getItem(`engage.presenting.${code}`) === '1'; } catch { /* ignore */ }

function tick() {
  if (!state || !socket) return;
  $('#clock').textContent = formatClock(socket.now() - state.startedAt);
  for (const el of $$('[data-countdown]')) {
    el.textContent = formatClock(Number(el.dataset.countdown) - socket.now());
  }
}
setInterval(tick, 500);

// Inside the Meet panel, a launched prompt takes over the panel until it is answered or its timer
// ends. Then a short "done" note says to go back to the meeting; everything else stays available.
let wasPrompting = false;
let doneTimer = null;
function trackPrompting() {
  const m = state.moment;
  const open = Boolean(m && m.status === 'open' && !state.focus);
  const unanswered = open && (m.type === 'wordcloud' ? !(Array.isArray(m.mine) && m.mine.length) : m.mine === null);
  const prompting = embedded && unanswered && !presenting;
  document.body.classList.toggle('prompting', prompting);
  if (wasPrompting && !prompting) {
    const timedOut = m && m.status === 'closed' && m.mine === null;
    $('#done-note').innerHTML = timedOut
      ? "<b>Time's up</b>That prompt has closed. Back to the meeting."
      : '<b>Thanks, you are done</b>Your answer is in. Back to the meeting.';
    $('#done-note').hidden = false;
    clearTimeout(doneTimer);
    doneTimer = setTimeout(() => { $('#done-note').hidden = true; }, 6000);
  }
  if (prompting) $('#done-note').hidden = true;
  wasPrompting = prompting;
}

function renderBanners() {
  const parts = [];
  if (state.focus) {
    parts.push('<div class="banner focus" role="status"><span><b>Focus moment.</b> The host paused prompts and games. Back to the meeting.</span></div>');
  }
  if (presenting) {
    parts.push(`<div class="banner" role="status"><span><b>Presenting.</b> The mini window is closed and nothing will pop up. ${skipped} ${skipped === 1 ? 'prompt' : 'prompts'} skipped, none queued.</span><button id="presenting-off">Turn off</button></div>`);
  }
  if (state.floorOpen && !state.focus) {
    parts.push('<div class="banner" role="status"><span><b>The host invites your view</b> on the next topic. Add a question or comment below.</span><button id="floor-go">Write something</button></div>');
  }
  if (state.gamesOpen && !state.focus && $('#att-grid').dataset.active !== 'play') {
    parts.push('<div class="banner" role="status"><span><b>Games are open.</b> The host opened buzzword bingo and the prediction.</span><button id="games-go">Play</button></div>');
  }
  $('#banners').innerHTML = parts.join('');
}

function renderMoment() {
  const key = JSON.stringify([state.moment, state.focus]);
  if (key === momentKey) return;
  momentKey = key;
  $('#moment').innerHTML = momentHtml(state);
}

function renderQuestions() {
  $('#q-count').textContent = `${state.questions.filter((q) => !q.answered).length} open`;
  $('#questions').innerHTML = state.questions.length
    ? state.questions.map((q) => `
      <div class="q ${q.answered ? 'answered' : ''} ${q.pinned ? 'pinned' : ''}">
        <button class="vote-btn ${q.voted ? 'selected' : ''}" data-vote="${esc(q.id)}" aria-pressed="${q.voted}" aria-label="Upvote"><span>▲</span><span class="n num">${q.votes}</span></button>
        <div><div>${q.pinned ? '<span class="chip accent">Pinned by host</span> ' : ''}${esc(q.text)}</div><div class="meta">${q.mine ? 'You' : esc(q.author)}${q.answered ? ' · answered' : ''}</div></div>
        <span></span>
      </div>`).join('')
    : '<p class="muted small">No questions yet. Be the first.</p>';
}

function renderGames() {
  const { gamesOpen, focus, card, prediction, windows } = state;
  const playable = gamesOpen && !focus;
  $('#games-card').classList.toggle('idle', !playable);
  const chip = $('#games-chip');
  chip.textContent = focus ? 'Paused' : gamesOpen ? 'Open' : 'Closed';
  chip.className = `chip ${playable ? 'ok' : ''}`;

  let note = '';
  if (focus) note = 'Paused: the host started a Focus moment.';
  else if (gamesOpen) {
    note = windows.current
      ? `Games are open. Tap a word when you hear it. Window ends in `
      : 'Games are open. Tap a word when you hear it.';
  } else if (windows.next) {
    note = 'Games open in ';
  } else note = 'Games are closed. The host opens them during breaks.';
  const countdownTarget = gamesOpen && windows.current ? windows.current.endsAt : !gamesOpen && windows.next ? windows.next.startsAt : null;
  $('#games-note').innerHTML = esc(note) + (countdownTarget && !focus ? `<span class="num" data-countdown="${countdownTarget}"></span>` : '');

  $('#bingo').innerHTML = card.words.map((word, i) =>
    `<button data-bingo="${esc(word)}" class="${card.marks.includes(i) ? 'on' : ''}" aria-pressed="${card.marks.includes(i)}" ${playable ? '' : 'disabled'}>${esc(word)}</button>`).join('');

  $('#pred-question').textContent = prediction.question;
  const open = prediction.status === 'open';
  $('#pred-buttons').innerHTML = ['yes', 'no'].map((choice) =>
    `<button data-predict="${choice}" class="${prediction.mine === choice ? 'selected' : ''}" ${playable && open ? '' : 'disabled'}>${choice === 'yes' ? 'Yes' : 'No'}</button>`).join('');
  $('#pred-note').textContent = !open
    ? `Result: ${prediction.result === 'yes' ? 'Yes' : 'No'}${prediction.mine ? (prediction.mine === prediction.result ? ' · you got it right' : ' · not this time') : ''}`
    : prediction.mine ? 'Your guess is locked in until the host resolves it.' : '';
  $('#score').textContent = `${state.me.points} pts`;
}

// ---- notes (local only) ---------------------------------------------------

const saveNotes = () => storage.set(notesKey, notes);

function renderTodos() {
  $('#todos').innerHTML = notes.todos.length
    ? notes.todos.map((t) => `<label class="check"><input type="checkbox" data-todo="${esc(t.id)}" ${t.done ? 'checked' : ''}> <span style="${t.done ? 'text-decoration: line-through; opacity: .6' : ''}">${esc(t.text)}</span></label>`).join('')
    : '<p class="small muted">Action items you add will show here.</p>';
}

const notesMarkdown = () => {
  const lines = [`# Notes: ${state?.title ?? 'Meeting'}`, '', notes.text.trim() || '_No notes._', '', '## Action items'];
  for (const t of notes.todos) lines.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
  if (!notes.todos.length) lines.push('_None._');
  return lines.join('\n');
};

const downloadNotes = () => {
  const blob = new Blob([notesMarkdown()], { type: 'text/markdown' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `notes-${code}.md` });
  a.click();
  URL.revokeObjectURL(a.href);
};

$('#notes').value = notes.text;
$('#notes').addEventListener('input', (event) => {
  notes.text = event.target.value;
  saveNotes();
});
$('#todo-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('#todo-text').value.trim();
  if (!text) return;
  notes.todos.push({ id: String(Date.now()), text, done: false });
  $('#todo-text').value = '';
  saveNotes();
  renderTodos();
});
$('#todos').addEventListener('change', (event) => {
  const todo = notes.todos.find((t) => t.id === event.target.dataset.todo);
  if (todo) {
    todo.done = event.target.checked;
    saveNotes();
    renderTodos();
  }
});
$('#export-notes').addEventListener('click', downloadNotes);
renderTodos();

// ---- recap ----------------------------------------------------------------

function renderRecap() {
  app.hidden = true;
  recap.hidden = false;
  $('#clock').hidden = true;
  const r = state.recap;
  const moments = r.moments.length
    ? r.moments.map((m) => `<div class="stack" style="padding: 10px 0; border-top: 1px solid var(--border)"><b>${esc(m.prompt)}</b>${resultsHtml({ ...m, status: 'closed' })}</div>`).join('')
    : '<p class="muted">No polls were run.</p>';
  const mine = r.myQuestions.length
    ? r.myQuestions.map((q) => `<div class="q ${q.answered ? 'answered' : ''}"><div class="votes"><b class="num">${q.votes}</b><div class="meta">votes</div></div><div>${esc(q.text)}<div class="meta">${q.answered ? 'Answered' : 'Not answered yet'}</div></div><span></span></div>`).join('')
    : '<p class="muted">You did not ask a question.</p>';
  const todos = notes.todos.length
    ? notes.todos.map((t) => `<p>${t.done ? '☑' : '☐'} ${esc(t.text)}</p>`).join('') : '<p class="muted">No action items.</p>';

  recap.innerHTML = `
    <div class="row spread"><div><h1>Your recap</h1><p class="muted">${esc(state.title)} · ${formatClock(r.durationMs)} · ${r.joined} people</p></div>
      <span class="chip accent num">${state.me.points} pts</span></div>
    <div class="att-grid">
      <div class="stack">
        <section class="card"><h2>Your action items</h2>${todos}<div class="row" style="margin-top: 12px"><button id="recap-export" class="primary">Download notes</button></div></section>
        <section class="card"><h2>Your questions</h2><div class="q-list">${mine}</div></section>
      </div>
      <div class="stack"><section class="card"><h2>Results from the meeting</h2>${moments}</section></div>
    </div>
    ${surveyUrl ? `<p class="muted">How was Engage for you? <a href="${esc(surveyUrl)}" target="_blank" rel="noopener noreferrer">Share quick feedback</a>. It takes under a minute.</p>` : ''}
    <p class="small muted"><a href="/privacy.html">How Engage handles data</a></p>`;
  $('#recap-export').onclick = downloadNotes;
}

// ---- events ---------------------------------------------------------------

document.addEventListener('click', (event) => {
  const el = event.target.closest('button');
  if (!el) return;
  if (el.id === 'floor-go') return $('#ask-text').focus();
  if (el.id === 'games-go') return $('[data-tab="play"]').click();
  if (el.id === 'presenting-off') return setPresenting(false);
  if (el.dataset.tab) {
    $('#att-grid').dataset.active = el.dataset.tab;
    for (const t of $$('#att-tabs button')) t.setAttribute('aria-selected', String(t === el));
    if (state) renderBanners();
    return;
  }
  if (el.dataset.react) {
    act({ t: 'react', kind: el.dataset.react });
    el.classList.add('selected');
    setTimeout(() => el.classList.remove('selected'), 700);
  } else if (el.dataset.vote) act({ t: 'upvote', id: el.dataset.vote });
  else if (el.dataset.answer !== undefined) act({ t: 'respond', momentId: state.moment.id, value: el.dataset.answer });
  else if (el.dataset.bingo) act({ t: 'bingo', word: el.dataset.bingo });
  else if (el.dataset.predict) act({ t: 'predict', choice: el.dataset.predict });
});

document.addEventListener('submit', (event) => {
  if (event.target.classList.contains('word-form')) {
    event.preventDefault();
    const input = event.target.querySelector('.word-input');
    if (input.value.trim()) act({ t: 'respond', momentId: state.moment.id, value: input.value });
  }
});

$('#ask-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('#ask-text').value.trim();
  if (!text) return;
  act({ t: 'ask', text });
  $('#ask-text').value = '';
});

$('#reactions').innerHTML = Object.entries(REACTION_LABELS).map(([kind, { emoji, label }]) =>
  `<button data-react="${kind}" aria-label="${esc(label)}"><span class="emoji" aria-hidden="true">${emoji}</span>${esc(label)}</button>`).join('');

start().catch(() => showFatal('Could not reach Engage. Check your connection and reload.'));
