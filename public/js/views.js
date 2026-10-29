import { esc } from './common.js';

const pctOf = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const bar = (label, pct, cls = '') =>
  `<div class="bar-row ${cls}"><span>${label}</span><div class="bar"><span style="width:${pct}%"></span></div><span class="num">${pct}%</span></div>`;

/** Group results for a closed moment, as an attendee sees them. */
export const resultsHtml = (moment) => {
  const r = moment.results;
  if (moment.type === 'recall') {
    const got = r.counts[moment.correct] ?? 0;
    const other = Math.max(0, r.total - got - r.missed);
    return bar('Got it', pctOf(got, r.total), 'right') + bar('Other answer', pctOf(other, r.total)) + bar('Missed that', pctOf(r.missed, r.total), 'miss');
  }
  if (moment.type === 'poll' || moment.type === 'quiz') {
    return moment.options.map((option, i) => {
      const right = moment.type === 'quiz' && moment.correct === i;
      return bar(`${esc(option)}${right ? ' ✓' : ''}`, pctOf(r.counts[i], r.total), right ? 'right' : '');
    }).join('');
  }
  if (moment.type === 'pulse') {
    return `<p class="num" style="font-size: 22px; font-weight: 650">${r.average ?? '–'} <span class="small muted">group average of 5</span></p>`;
  }
  const max = Math.max(1, ...r.words.map((w) => w.n));
  return `<div class="words">${r.words.map((w) => `<span style="font-size:${14 + (w.n / max) * 18}px">${esc(w.word)}</span>`).join('')}</div>`;
};

const verdictHtml = (moment) => {
  if (moment.mine === null || moment.mine === undefined) return '';
  if (moment.type === 'recall') {
    if (moment.mine === -1) return '<p class="chip" style="width:fit-content">You said you missed it. That helps the host.</p>';
    return moment.mine === moment.correct ? '<p class="chip ok" style="width:fit-content">You got it right</p>' : '<p class="chip warn" style="width:fit-content">Not this time</p>';
  }
  if (moment.type === 'quiz') {
    return moment.mine === moment.correct ? '<p class="chip ok" style="width:fit-content">You got it right</p>' : '<p class="chip warn" style="width:fit-content">Not this time</p>';
  }
  return '';
};

/** The "right now" prompt panel. Used by the main page and the mini window. */
export const momentHtml = (state) => {
  const moment = state.moment;
  if (!moment) return '<p class="muted">Nothing to answer right now. Stay with the meeting.</p>';

  const head = `<p><b>${esc(moment.prompt)}</b></p>`;
  const countdown = moment.status === 'open' && moment.closesAt
    ? `<p class="small muted">Closes in <span class="num" data-countdown="${moment.closesAt}"></span></p>` : '';

  if (moment.status === 'closed') {
    return `<div class="stack">${head}${verdictHtml(moment)}${resultsHtml(moment)}<p class="small muted">Closed. Results are for the whole group.</p></div>`;
  }
  if (state.focus) {
    return `<div class="stack">${head}<p class="muted">Paused while the host has Focus on. You can answer when it resumes.</p></div>`;
  }
  if (moment.mine !== null && moment.type !== 'wordcloud') {
    return `<div class="stack">${head}<p class="chip ok" style="width:fit-content">Answer recorded</p>${countdown}<p class="small muted">Results appear when the host closes this.</p></div>`;
  }

  let controls = '';
  if (moment.type === 'poll' || moment.type === 'quiz' || moment.type === 'recall') {
    controls = `<div class="moment-options">${moment.options.map((o, i) => `<button data-answer="${i}">${esc(o)}</button>`).join('')}${
      moment.type === 'recall' ? '<button class="missed" data-answer="missed" title="Not sure? That is useful for the host to know.">Missed that</button>' : ''}</div>`;
  } else if (moment.type === 'pulse') {
    controls = `<div class="scale">${[1, 2, 3, 4, 5].map((n) => `<button data-answer="${n}" aria-label="${n} out of 5">${n}</button>`).join('')}</div><div class="row spread small muted"><span>Not great</span><span>Great</span></div>`;
  } else {
    const mine = Array.isArray(moment.mine) ? moment.mine : [];
    controls = `<form class="word-form row" autocomplete="off"><input class="word-input grow" type="text" maxlength="24" placeholder="One word" aria-label="Your word" ${mine.length >= 3 ? 'disabled' : ''}><button class="primary" ${mine.length >= 3 ? 'disabled' : ''}>Send</button></form>${mine.length ? `<p class="small muted">You sent: ${esc(mine.join(', '))}</p>` : ''}`;
  }
  return `<div class="stack">${head}${controls}${countdown}</div>`;
};

/** Is there something the attendee has not dealt with yet? */
export const hasWaiting = (state) => {
  if (!state || state.status !== 'live' || state.focus) return false;
  const m = state.moment;
  const openPrompt = m && m.status === 'open' && m.mine === null;
  const gameRound = state.game?.status === 'playing' && !state.game.mine;
  return Boolean(openPrompt || state.floorOpen || gameRound);
};

/** Reactions: open only while the host has opened the floor, one of each emoji per opening. */
export const reactionsHtml = (state, labels) => {
  const floor = state.floor ?? { open: false };
  const open = floor.open && !state.focus;
  const mine = floor.mine ?? [];
  const note = open
    ? `<p class="small muted">The floor is open: send each reaction once. Closes in <span class="num" data-countdown="${floor.closesAt}"></span>.</p>`
    : '<p class="small muted">Reactions open when the host opens the floor.</p>';
  const buttons = Object.entries(labels).map(([kind, { emoji, label }]) => {
    const sent = mine.includes(kind);
    return `<button data-react="${kind}" class="${sent ? 'selected' : ''}" aria-label="${esc(label)}${sent ? ', sent' : ''}" ${open && !sent ? '' : 'disabled'}><span class="emoji" aria-hidden="true">${emoji}</span>${esc(label)}</button>`;
  }).join('');
  return `${note}<div class="react-bar ${open ? '' : 'closed'}">${buttons}</div>`;
};

/** One round of a quick game, as a participant sees and plays it. */
export const gameHtml = (state) => {
  const g = state.game;
  if (!g) return '';
  const head = `<p class="game-label">${esc(g.label)} · round ${g.roundNo} of ${g.rounds}</p>`;
  if (g.status === 'done') {
    const s = g.score;
    return `<div class="stack game"><p class="game-label">${esc(g.label)} · finished</p><p class="game-prompt">Game over</p>
      <p>You got <b>${s.correct} of ${g.rounds}</b> right${s.points ? ` and scored <b class="num">${s.points}</b> points` : ''}.</p>
      ${g.accuracy === null ? '' : `<p class="small muted">The whole group got ${g.accuracy}% right.</p>`}
      <p class="small muted">Your score is private. Back to the meeting.</p></div>`;
  }
  const reveal = g.status === 'reveal';
  const mine = g.mine;
  const tiles = g.question.options.map((o, i) => {
    const picked = mine?.choice === i;
    const right = reveal && i === g.question.correct;
    const wrong = reveal && picked && !right;
    const cls = ['game-tile', o.color ? 'color' : '', picked ? 'picked' : '', right ? 'right' : '', wrong ? 'wrong' : ''].filter(Boolean).join(' ');
    const style = o.color ? ` style="--swatch:${esc(o.color)}"` : '';
    const mark = right ? '<span class="mark" aria-hidden="true">✓</span>' : wrong ? '<span class="mark" aria-hidden="true">✗</span>' : '';
    return `<button class="${cls}"${style} data-game-choice="${i}" aria-label="${esc(o.label)}" ${mine || reveal ? 'disabled' : ''}>${esc(o.label)}${mark}</button>`;
  }).join('');
  let status;
  if (reveal) {
    status = !mine ? '<p class="game-result">No answer this round.</p>'
      : mine.correct ? `<p class="game-result good">Right! +${mine.points}</p>` : '<p class="game-result">Not this time.</p>';
    if (g.question.hint) status += `<p class="small muted">${esc(g.question.hint)}</p>`;
  } else {
    status = `<p class="small muted">${mine ? 'Locked in. ' : ''}<span class="num" data-countdown="${g.roundEndsAt}"></span> left</p>`;
  }
  return `<div class="stack game">${head}<p class="game-prompt">${esc(g.question.prompt)}</p><div class="game-grid">${tiles}</div>${status}</div>`;
};
