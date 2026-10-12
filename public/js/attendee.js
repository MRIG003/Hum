import { $, $$, codeFromPath, connect, esc, formatClock, REACTION_LABELS, storage, toast } from './common.js';

const code = codeFromPath();
const identityKey = `engage.p.${code}`;
const notesKey = `engage.notes.${code}`;

let identity = storage.get(identityKey);
let state = null;
let socket = null;
let momentKey = '';
let notes = storage.get(notesKey) ?? { text: '', todos: [] };

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
  const response = await fetch(`/api/meetings/${code}`);
  if (!response.ok) return showFatal('We could not find that meeting. Check the code or link with the host.');
  const meeting = await response.json();
  $('#title').textContent = meeting.title;
  document.title = `Engage · ${meeting.title}`;
  if (meeting.status === 'ended') return showFatal('This meeting has ended.');

  $('#gate-sub').textContent = meeting.title;
  if (identity?.pid) return join();
  gate.hidden = false;
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
      anon: identity?.anon,
    }),
    onWelcome: (msg) => {
      identity = { pid: msg.pid, token: msg.token, name: msg.name, anon: msg.anon };
      storage.set(identityKey, identity);
    },
    onState: (next) => {
      state = next;
      render();
    },
    onFatal: (message) => {
      storage.remove(identityKey);
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
  const anon = $('#anon').checked;
  const name = $('#name').value.trim();
  const error = $('#join-error');
  if (!anon && !name) {
    error.textContent = 'Enter your first name or choose to join anonymously.';
    error.hidden = false;
    return;
  }
  identity = { name, anon };
  join();
});

$('#anon').addEventListener('change', (event) => {
  $('#name').disabled = event.target.checked;
});

const act = (message) => socket?.send(message);

// ---- rendering ------------------------------------------------------------

function render() {
  if (state.status === 'ended') return renderRecap();
  app.hidden = false;
  $('#fatal').hidden = true;
  $('#clock').hidden = false;
  $('#points').hidden = false;
  $('#points').textContent = `${state.me.points} pts`;
  renderBanners();
  renderMoment();
  renderQuestions();
  renderGames();
  tick();
}

function tick() {
  if (!state || !socket) return;
  $('#clock').textContent = formatClock(socket.now() - state.startedAt);
  for (const el of $$('[data-countdown]')) {
    el.textContent = formatClock(Number(el.dataset.countdown) - socket.now());
  }
}
setInterval(tick, 500);

function renderBanners() {
  const parts = [];
  if (state.focus) {
    parts.push('<div class="banner focus" role="status"><span><b>Focus moment.</b> The host paused prompts and games. Back to the meeting.</span></div>');
  }
  if (state.floorOpen && !state.focus) {
    parts.push('<div class="banner" role="status"><span><b>The host invites your view</b> on the next topic. Add a question or comment below.</span><button id="floor-go">Write something</button></div>');
  }
  $('#banners').innerHTML = parts.join('');
}

const resultsHtml = (moment) => {
  const r = moment.results;
  if (moment.type === 'poll' || moment.type === 'quiz') {
    return moment.options.map((option, i) => {
      const pct = r.total ? Math.round((r.counts[i] / r.total) * 100) : 0;
      const right = moment.type === 'quiz' && moment.correct === i;
      return `<div class="bar-row ${right ? 'right' : ''}"><span>${esc(option)}${right ? ' ✓' : ''}</span><div class="bar"><span style="width:${pct}%"></span></div><span class="num">${pct}%</span></div>`;
    }).join('');
  }
  if (moment.type === 'pulse') {
    return `<p class="num" style="font-size: 22px; font-weight: 650">${r.average ?? '–'} <span class="small muted">group average of 5</span></p>`;
  }
  const max = Math.max(1, ...r.words.map((w) => w.n));
  return `<div class="words">${r.words.map((w) => `<span style="font-size:${14 + (w.n / max) * 18}px">${esc(w.word)}</span>`).join('')}</div>`;
};

function renderMoment() {
  const moment = state.moment;
  const key = JSON.stringify([moment, state.focus]);
  if (key === momentKey) return;
  momentKey = key;
  const box = $('#moment');

  if (!moment) {
    box.innerHTML = '<p class="muted">Nothing to answer. Stay with the meeting, we will ping you when the host asks something.</p>';
    return;
  }

  const head = `<p><b>${esc(moment.prompt)}</b></p>`;
  const countdown = moment.status === 'open' && moment.closesAt
    ? `<p class="small muted">Closes in <span class="num" data-countdown="${moment.closesAt}"></span></p>` : '';

  if (moment.status === 'closed') {
    let verdict = '';
    if (moment.type === 'quiz' && moment.mine !== null) {
      verdict = moment.mine === moment.correct
        ? '<p class="chip ok">You got it right</p>' : '<p class="chip warn">Not this time</p>';
    }
    box.innerHTML = `<div class="stack">${head}${verdict}${resultsHtml(moment)}<p class="small muted">Closed. Results are for the whole group.</p></div>`;
    return;
  }

  if (state.focus) {
    box.innerHTML = `<div class="stack">${head}<p class="muted">Paused while the host has Focus on. You can answer when it resumes.</p></div>`;
    return;
  }

  const answered = moment.mine !== null && moment.type !== 'wordcloud';
  if (answered) {
    box.innerHTML = `<div class="stack">${head}<p class="chip ok">Answer recorded</p>${countdown}<p class="small muted">Results appear when the host closes this.</p></div>`;
    return;
  }

  let controls = '';
  if (moment.type === 'poll' || moment.type === 'quiz') {
    controls = `<div class="moment-options">${moment.options.map((o, i) => `<button data-answer="${i}">${esc(o)}</button>`).join('')}</div>`;
  } else if (moment.type === 'pulse') {
    controls = `<div class="scale">${[1, 2, 3, 4, 5].map((n) => `<button data-answer="${n}" aria-label="${n} out of 5">${n}</button>`).join('')}</div><div class="row spread small muted"><span>Not great</span><span>Great</span></div>`;
  } else {
    const mine = Array.isArray(moment.mine) ? moment.mine : [];
    controls = `<form id="word-form" class="row" autocomplete="off"><input id="word-input" class="grow" type="text" maxlength="24" placeholder="One word" aria-label="Your word" ${mine.length >= 3 ? 'disabled' : ''}><button class="primary" ${mine.length >= 3 ? 'disabled' : ''}>Send</button></form>${mine.length ? `<p class="small muted">You sent: ${esc(mine.join(', '))}</p>` : ''}`;
  }
  box.innerHTML = `<div class="stack">${head}${controls}${countdown}</div>`;
}

function renderQuestions() {
  $('#q-count').textContent = `${state.questions.filter((q) => !q.answered).length} open`;
  $('#questions').innerHTML = state.questions.length
    ? state.questions.map((q) => `
      <div class="q ${q.answered ? 'answered' : ''}">
        <button class="vote-btn ${q.voted ? 'selected' : ''}" data-vote="${esc(q.id)}" aria-pressed="${q.voted}" aria-label="Upvote"><span>▲</span><span class="n num">${q.votes}</span></button>
        <div><div>${esc(q.text)}</div><div class="meta">${q.mine ? 'You' : esc(q.author)}${q.answered ? ' · answered' : ''}</div></div>
        <span></span>
      </div>`).join('')
    : '<p class="muted small">No questions yet. Be the first.</p>';
}

function renderGames() {
  const { gamesOpen, focus, card, prediction, windows } = state;
  const playable = gamesOpen && !focus;
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
    </div>`;
  $('#recap-export').onclick = downloadNotes;
}

// ---- events ---------------------------------------------------------------

document.addEventListener('click', (event) => {
  const el = event.target.closest('button');
  if (!el) return;
  if (el.id === 'floor-go') return $('#ask-text').focus();
  if (el.dataset.tab) {
    $('#att-grid').dataset.active = el.dataset.tab;
    for (const t of $$('#att-tabs button')) t.setAttribute('aria-selected', String(t === el));
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
  if (event.target.id === 'word-form') {
    event.preventDefault();
    const input = $('#word-input');
    if (input.value.trim()) act({ t: 'respond', momentId: state.moment.id, value: input.value });
  }
});

$('#ask-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('#ask-text').value.trim();
  if (!text) return;
  act({ t: 'ask', text, anon: $('#ask-anon').checked });
  $('#ask-text').value = '';
});

$('#reactions').innerHTML = Object.entries(REACTION_LABELS).map(([kind, { emoji, label }]) =>
  `<button data-react="${kind}" aria-label="${esc(label)}"><span class="emoji" aria-hidden="true">${emoji}</span>${esc(label)}</button>`).join('');

start().catch(() => showFatal('Could not reach Engage. Check your connection and reload.'));
