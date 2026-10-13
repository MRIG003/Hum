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
  return Boolean(openPrompt || state.floorOpen);
};
