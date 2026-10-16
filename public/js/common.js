export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export const storage = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage can be blocked; the app still works for this session */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export const formatClock = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export const codeFromPath = () => location.pathname.split('/').pop().toUpperCase();

export const toast = (message) => {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2800);
};

export const REACTION_LABELS = {
  agree: { emoji: '👍', label: 'Agree' },
  question: { emoji: '❓', label: 'Question' },
  lost: { emoji: '😵', label: 'Lost me' },
  fast: { emoji: '⏩', label: 'Too fast' },
  move_on: { emoji: '⏭️', label: 'Move on' },
};

/**
 * Open a websocket that reconnects with backoff and re-sends `hello` each time.
 * Keeps a server clock offset so timers match the server.
 */
export const connect = ({ hello, onState, onWelcome, onFatal, onError, onStatus, onMessage }) => {
  let ws = null;
  let attempt = 0;
  let closedByUs = false;
  let fatal = false;
  const clock = { offset: 0 };

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.addEventListener('open', () => {
      attempt = 0;
      onStatus?.('online');
      ws.send(JSON.stringify(hello()));
    });
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.t === 'state') {
        clock.offset = msg.state.now - Date.now();
        onState(msg.state);
      } else if (msg.t === 'welcome') onWelcome?.(msg);
      else if (msg.t === 'fatal') {
        fatal = true;
        onFatal?.(msg.error);
      } else if (msg.t === 'error') onError?.(msg.error);
      else onMessage?.(msg);
    });
    ws.addEventListener('close', () => {
      if (closedByUs || fatal) return;
      onStatus?.('offline');
      attempt += 1;
      setTimeout(open, Math.min(8000, 500 * 2 ** attempt));
    });
  };
  open();

  return {
    send: (message) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    },
    isOpen: () => ws?.readyState === WebSocket.OPEN,
    now: () => Date.now() + clock.offset,
    close: () => {
      closedByUs = true;
      ws?.close();
    },
  };
};

export const brandHtml = '<span class="brand"><span class="brand-mark" aria-hidden="true"></span>Engage</span>';
