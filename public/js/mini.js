import { esc, REACTION_LABELS, storage } from './common.js';
import { momentHtml, hasWaiting } from './views.js';

const NOTE_KEY = 'engage.mini.noteSeen';
const AUTO_KEY = 'engage.mini.autoOpen';
const SIZES = { pill: [340, 84], card: [360, 580] };
const COLLAPSE_AFTER_MS = 6000;

const ICON_PRESENT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
const ICON_MIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';

export const miniSupported = () => ({ pip: 'documentPictureInPicture' in window });

/**
 * A small window the attendee can place over the meeting. It uses Document
 * Picture-in-Picture where the browser has it and a small pop-up otherwise.
 * It shows the same state as the main page and sends actions through it.
 */
export const createMini = ({ send, now, onClosed, onPresent }) => {
  let win = null;
  let root = null;
  let mode = 'pill';
  let tab = 'live';
  let state = null;
  let noteOpen = false;
  let autoOpened = false;
  let collapseAt = 0;
  let lastMomentId = null;
  let lastKey = '';
  let timer = null;

  const isOpen = () => Boolean(win && !win.closed);
  const autoPref = () => storage.get(AUTO_KEY) !== false;

  const resize = () => {
    if (!isOpen()) return;
    const [w, h] = SIZES[mode];
    try {
      const dw = win.outerWidth - win.innerWidth;
      const dh = win.outerHeight - win.innerHeight;
      win.resizeTo(w + dw, h + dh);
    } catch {
      /* some browsers refuse to resize. The layout still works. */
    }
  };

  const statusLabel = () => {
    if (!state) return { text: '', attn: false };
    if (state.focus) return { text: 'Paused', attn: false };
    const m = state.moment;
    if (m && m.status === 'open' && m.mine === null) {
      return { text: m.type === 'recall' ? 'Quick check' : 'New prompt', attn: true, countdown: m.closesAt };
    }
    if (state.floorOpen) return { text: 'Invitation', attn: true };
    return { text: '', attn: false };
  };

  const pillHtml = () => {
    const s = statusLabel();
    return `<div class="mini-pill">
      <button class="mini-open" data-m="open" aria-label="Open Engage">
        <span class="mark" aria-hidden="true"></span><b>Engage</b>
        ${s.text ? `<span class="mini-status ${s.attn ? 'attn' : ''}">${esc(s.text)}${s.countdown ? ` <span class="num" data-countdown="${s.countdown}"></span>` : ''}</span>` : ''}
        ${hasWaiting(state) ? '<span class="dot new" aria-hidden="true"></span>' : ''}
      </button>
      <button class="icon-btn" data-m="present" aria-label="I'm presenting. Close Engage" title="I'm presenting">${ICON_PRESENT}</button>
    </div>`;
  };

  const gamesHtml = () => {
    if (state.focus) return '<div class="banner focus"><b>Paused.</b> The host started a Focus moment.</div>';
    if (!state.gamesOpen) return '<div class="mini-box"><p class="muted">Games are closed. The host opens them during breaks.</p></div>';
    const { card, prediction } = state;
    const open = prediction.status === 'open';
    return `<div class="mini-box"><b>Bingo</b><div class="bingo">${card.words.map((w, i) =>
      `<button data-bingo="${esc(w)}" class="${card.marks.includes(i) ? 'on' : ''}" aria-pressed="${card.marks.includes(i)}">${esc(w)}</button>`).join('')}</div></div>
      <div class="mini-box"><b>${esc(prediction.question)}</b><div class="row">${['yes', 'no'].map((c) =>
        `<button data-predict="${c}" class="${prediction.mine === c ? 'selected' : ''}" ${open ? '' : 'disabled'}>${c === 'yes' ? 'Yes' : 'No'}</button>`).join('')}</div>
      <p class="small muted">Your points are private: ${state.me.points} pts.</p></div>`;
  };

  const liveHtml = () => {
    const parts = [];
    if (state.focus) parts.push('<div class="banner focus" role="status"><b>Focus moment.</b> The host paused prompts and games. Back to the meeting.</div>');
    if (state.floorOpen && !state.focus) parts.push('<div class="banner" role="status"><b>The host invites your view</b> on the next topic. Write a question below.</div>');
    parts.push(`<div class="mini-box" aria-live="polite">${momentHtml(state)}</div>`);
    parts.push(`<div class="react-bar">${Object.entries(REACTION_LABELS).map(([k, r]) =>
      `<button data-react="${k}" aria-label="${esc(r.label)}"><span class="emoji" aria-hidden="true">${r.emoji}</span>${esc(r.label)}</button>`).join('')}</div>`);
    parts.push('<div class="row"><input class="mini-ask grow" type="text" maxlength="280" placeholder="Ask the host a question" aria-label="Ask the host a question"><button class="primary" data-m="ask">Ask</button></div>');
    return parts.join('');
  };

  const cardHtml = () => {
    const note = noteOpen
      ? `<div class="mini-note" role="dialog" aria-label="Before you share your screen"><h3>Sharing your whole screen?</h3>
         <p class="small">Everyone would see this window. Share a single window or tab instead, or turn on presenting and Engage closes.</p>
         <div class="row"><button class="primary" data-m="note-ok">Got it</button><button data-m="present">Turn on presenting</button></div></div>` : '';
    return `<div class="mini-card">${note}
      <div class="mini-head"><span class="mark" aria-hidden="true"></span><span class="t">${esc(state.title)}</span>
        <button class="icon-btn" data-m="present" aria-label="I'm presenting. Close Engage" title="I'm presenting">${ICON_PRESENT}</button>
        <button class="icon-btn" data-m="min" aria-label="Shrink to a pill" title="Shrink">${ICON_MIN}</button></div>
      <div class="mini-tabs" role="tablist"><button role="tab" aria-selected="${tab === 'live'}" data-tab="live">Live</button><button role="tab" aria-selected="${tab === 'play'}" data-tab="play">Games</button></div>
      <div class="mini-body">${tab === 'live' ? liveHtml() : gamesHtml()}</div>
      <label class="check mini-auto"><input type="checkbox" data-m="auto" ${autoPref() ? 'checked' : ''}> Open for quick checks</label></div>`;
  };

  const render = () => {
    if (!isOpen() || !root || !state) return;
    const ask = root.querySelector('.mini-ask');
    const askValue = ask ? ask.value : '';
    const focusedAsk = ask && root.ownerDocument.activeElement === ask;
    root.innerHTML = mode === 'pill' ? pillHtml() : cardHtml();
    const next = root.querySelector('.mini-ask');
    if (next) {
      next.value = askValue;
      if (focusedAsk) next.focus();
    }
    win.document.title = hasWaiting(state) ? '● Engage' : 'Engage';
    tick();
  };

  const key = () => JSON.stringify([mode, tab, noteOpen, state?.moment, state?.focus, state?.floorOpen, state?.gamesOpen,
    state?.card, state?.prediction, state?.me?.points, state?.title]);

  const setMode = (next, auto = false) => {
    mode = next;
    autoOpened = auto;
    collapseAt = 0;
    if (next === 'card' && !auto && !storage.get(NOTE_KEY)) noteOpen = true;
    resize();
    lastKey = '';
    render();
    const target = root?.querySelector(next === 'pill' ? '.mini-open' : '.mini-head .icon-btn');
    if (!auto) target?.focus();
  };

  const tick = () => {
    if (!isOpen()) return stop();
    for (const el of root.querySelectorAll('[data-countdown]')) {
      const ms = Math.max(0, Number(el.dataset.countdown) - now());
      const total = Math.floor(ms / 1000);
      el.textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }
    if (collapseAt && Date.now() >= collapseAt && mode === 'card' && autoOpened) setMode('pill', false);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };

  const onClick = (event) => {
    const el = event.target.closest('button, input[data-m]');
    if (!el) return;
    const m = el.dataset.m;
    if (m === 'open') setMode('card');
    else if (m === 'min') setMode('pill');
    else if (m === 'present') onPresent();
    else if (m === 'note-ok') {
      storage.set(NOTE_KEY, true);
      noteOpen = false;
      lastKey = '';
      render();
    } else if (m === 'auto') storage.set(AUTO_KEY, el.checked);
    else if (m === 'ask') {
      const input = root.querySelector('.mini-ask');
      if (input && input.value.trim()) {
        send({ t: 'ask', text: input.value, anon: false });
        input.value = '';
      }
    } else if (el.dataset.tab) {
      tab = el.dataset.tab;
      lastKey = '';
      render();
    } else if (el.dataset.answer !== undefined && state?.moment) send({ t: 'respond', momentId: state.moment.id, value: el.dataset.answer });
    else if (el.dataset.react) send({ t: 'react', kind: el.dataset.react });
    else if (el.dataset.bingo) send({ t: 'bingo', word: el.dataset.bingo });
    else if (el.dataset.predict) send({ t: 'predict', choice: el.dataset.predict });
  };

  const onSubmit = (event) => {
    if (!event.target.classList.contains('word-form')) return;
    event.preventDefault();
    const input = event.target.querySelector('.word-input');
    if (input.value.trim() && state?.moment) send({ t: 'respond', momentId: state.moment.id, value: input.value });
  };

  const onKey = (event) => {
    if (event.key === 'Escape' && mode === 'card') setMode('pill');
  };

  const build = () => {
    const doc = win.document;
    doc.title = 'Engage';
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('/css/styles.css', location.origin).href;
    doc.head.append(link);
    doc.body.className = 'mini';
    root = doc.createElement('div');
    root.id = 'mini-root';
    doc.body.append(root);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    doc.addEventListener('keydown', onKey);
    win.addEventListener('pagehide', () => {
      stop();
      win = null;
      root = null;
      onClosed?.();
    });
    timer = setInterval(tick, 500);
  };

  return {
    isOpen,
    async open() {
      if (isOpen()) {
        win.focus?.();
        return true;
      }
      mode = 'pill';
      noteOpen = false;
      const [w, h] = SIZES.pill;
      win = null;
      if ('documentPictureInPicture' in window) {
        try {
          win = await window.documentPictureInPicture.requestWindow({ width: w, height: h });
        } catch {
          win = null;
        }
      }
      if (!win) {
        const left = Math.max(0, (window.screen?.availWidth ?? 1200) - w - 24);
        const top = Math.max(0, (window.screen?.availHeight ?? 800) - h - 120);
        win = window.open('', 'engage-mini', `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
      }
      if (!win) return false;
      build();
      lastKey = '';
      render();
      return true;
    },
    close() {
      if (isOpen()) win.close();
      stop();
      win = null;
      root = null;
    },
    update(next) {
      state = next;
      if (!isOpen()) return;
      const m = next.moment;
      if (m && m.id !== lastMomentId) {
        lastMomentId = m.id;
        if (m.type === 'recall' && m.status === 'open' && m.mine === null && mode === 'pill' && autoPref() && !next.focus) {
          setMode('card', true);
          return;
        }
      }
      if (autoOpened && mode === 'card' && m && m.status === 'closed' && !collapseAt) collapseAt = Date.now() + COLLAPSE_AFTER_MS;
      const k = key();
      if (k !== lastKey) {
        lastKey = k;
        render();
      }
    },
    mode: () => mode,
  };
};
