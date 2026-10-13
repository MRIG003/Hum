import { $, $$, codeFromPath, connect, esc, formatClock, REACTION_LABELS, storage, toast } from './common.js';
import { renderChart } from './chart.js';

const code = codeFromPath();
const hashToken = new URLSearchParams(location.hash.slice(1)).get('t');
if (hashToken) {
  storage.set(`engage.host.${code}`, hashToken);
  history.replaceState(null, '', location.pathname);
}
const hostToken = storage.get(`engage.host.${code}`);

let state = null;
let momentKind = 'poll';
let dirty = { bingo: false, prediction: false, agenda: false };
let overrideArmed = false;

const live = $('#live');
const ended = $('#ended');

const link = () => `${location.origin}/j/${code}`;
const chatMessage = () =>
  `Join "${state?.title ?? 'our meeting'}" on Engage: ${link()}\n` +
  `Code: ${code}. Open it in a second window or on your phone. No sign-up. ` +
  `Reactions, questions and quick polls only. The host sees group results, not who is idle.`;

if (!hostToken) {
  $('#fatal').textContent = 'This browser did not create this meeting, so it cannot host it. Start a new meeting from the home page.';
  $('#fatal').hidden = false;
  throw new Error('Missing host token');
}

const socket = connect({
  hello: () => ({ t: 'hello', role: 'host', code, hostToken }),
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
  renderMoment();
  renderQuestions();
  renderReactions();
  renderGames();
  renderQuiet();
  renderAgenda();
}

function renderTop() {
  $('#link').textContent = link();
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
  $('#questions').innerHTML = state.questions.length
    ? state.questions.map((q) => `
      <div class="q ${q.answered ? 'answered' : ''}">
        <div class="votes"><b class="num">${q.votes}</b><div class="meta">votes</div></div>
        <div><div>${esc(q.text)}</div><div class="meta">${esc(q.author)}</div></div>
        <div class="row">
          <button data-answered="${esc(q.id)}" data-value="${q.answered ? '' : '1'}" class="small">${q.answered ? 'Reopen' : 'Answered'}</button>
          <button data-remove-q="${esc(q.id)}" class="ghost small" aria-label="Remove question">✕</button>
        </div>
      </div>`).join('')
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
    ? segs.map((s) => `<div class="row spread"><span><b>${esc(s.title)}</b> <span class="muted num">${s.startMin} to ${s.endMin} min</span></span><span class="num muted">${s.avg === null ? 'no data yet' : `${s.avg}% avg`}</span></div>`).join('')
    : '<p class="muted">No agenda yet. Add topics to see engagement by topic.</p>';
  syncMomentForm();
}

function renderQuiet() {
  if (document.activeElement !== $('#quiet-on')) $('#quiet-on').checked = state.quiet.on;
  if (document.activeElement !== $('#quiet-every')) $('#quiet-every').value = String(state.quiet.everyMin);
}

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

  ended.innerHTML = `
    <div class="row spread"><div><h1>Meeting summary</h1><p class="muted">${esc(state.title)}</p></div>
      <div class="row"><button id="copy-summary">Copy as text</button><button id="download-summary" class="primary">Download .md</button><a href="/"><button>New meeting</button></a></div></div>
    <div class="summary-grid">${tiles}</div>
    ${coach}
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
    toast(message);
  } catch {
    toast('Copy failed. Select the text and copy it manually.');
  }
}

$('#copy-link').addEventListener('click', () => copy(link(), 'Link copied'));
$('#copy-message').addEventListener('click', () => copy(chatMessage(), 'Chat message copied'));
$('#copy-host-link').addEventListener('click', () => copy(`${location.origin}/h/${code}#t=${hostToken}`, 'Private host link copied. Anyone with it can control the meeting.'));
$('#clock-reset').addEventListener('click', () => {
  if (confirm('Restart the meeting clock and the engagement chart from now?')) act({ t: 'resetClock' });
});

document.addEventListener('click', (event) => {
  const el = event.target.closest('button');
  if (!el) return;
  const { action, quick } = el.dataset;

  if (action === 'focus') act({ t: 'focus', on: el.dataset.on === '1' });
  else if (action === 'games') act({ t: 'games', on: el.dataset.on === '1' });
  else if (action === 'floor') act({ t: 'floor' });
  else if (action === 'closeMoment') act({ t: 'closeMoment' });
  else if (action === 'dismissMoment') act({ t: 'dismissMoment' });
  else if (action === 'end') {
    if (confirm('End the meeting for everyone and build the summary?')) act({ t: 'end' });
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
  $('#moment-form button[type="submit"]').textContent = 'Launch';
  $('#f-duration').value = momentKind === 'recall' ? '20' : '60';
  for (const t of $$('#moment-tabs button')) t.setAttribute('aria-selected', String(t === tab));
  syncMomentForm();
});
$('#f-options').addEventListener('input', syncMomentForm);

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

syncMomentForm();
