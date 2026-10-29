// Home page interactions: a 3D hero that follows the pointer, cards that tilt, the screens
// gallery, and a small playable demo of what participants see. Everything here is local to the
// page; nothing is sent to the server.
import { $, $$, esc } from './common.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(pointer: fine)').matches;

// ---- 3D hero ---------------------------------------------------------------------
const stage = $('#stage');
const scene = $('#scene');
if (stage && scene && !reduceMotion) {
  let frame = 0;
  const aim = (rx, ry) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      scene.style.setProperty('--rx', `${rx}deg`);
      scene.style.setProperty('--ry', `${ry}deg`);
    });
  };
  if (finePointer) {
    document.querySelector('.hero-3d').addEventListener('pointermove', (event) => {
      const box = stage.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      aim(10 - y * 14, -16 + x * 22);
    });
    document.querySelector('.hero-3d').addEventListener('pointerleave', () => aim(10, -16));
  } else {
    // On touch screens, a slow sway instead.
    let t = 0;
    setInterval(() => { t += 0.05; aim(10 + Math.sin(t) * 3, -16 + Math.cos(t * 0.8) * 6); }, 120);
  }
}

// ---- tilting cards -------------------------------------------------------------------
if (finePointer && !reduceMotion) {
  for (const card of $$('.tilt, .tilt-soft .demo-phone')) {
    card.addEventListener('pointermove', (event) => {
      const box = card.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      card.style.setProperty('--tx', `${(-y * 8).toFixed(2)}deg`);
      card.style.setProperty('--ty', `${(x * 10).toFixed(2)}deg`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.removeProperty('--tx');
      card.style.removeProperty('--ty');
    });
  }
}

// ---- screens gallery -------------------------------------------------------------------
for (const tab of $$('.screen-tabs [data-set]')) {
  tab.addEventListener('click', () => {
    for (const t of $$('.screen-tabs [data-set]')) t.setAttribute('aria-selected', String(t === tab));
    for (const set of $$('.screens')) set.hidden = set.dataset.set !== tab.dataset.set;
  });
}

// ---- playable demo ---------------------------------------------------------------------
const body = $('#demo-body');
const caption = $('#demo-caption');
const burst = $('#burst');
const REACTIONS = [['agree', '👍', 'Agree'], ['question', '❓', 'Question'], ['lost', '😵', 'Lost me'], ['fast', '⏩', 'Too fast'], ['move_on', '⏭️', 'Move on']];
const COLORS = [['Red', '#d93025'], ['Blue', '#1a73e8'], ['Yellow', '#f9ab00'], ['Green', '#1e8e3e'], ['Purple', '#8e24aa'], ['Orange', '#f4511e']];
const shuffle = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
let gameTimer = null;

const demos = {
  poll() {
    caption.textContent = 'Pick an answer and watch the room\'s results come in.';
    const options = ['Too slow', 'About right', 'Too fast'];
    body.innerHTML = `<div class="dp-card"><span class="dp-label">Right now · poll</span><p class="dp-q">Is the pace of this meeting right?</p>
      ${options.map((o, i) => `<button class="dp-opt" data-pick="${i}"><i class="fill"></i><span>${o}</span><span class="pc"></span></button>`).join('')}
      <p class="small muted" id="dp-note">Closes in 0:45</p></div>`;
    body.onclick = (event) => {
      const btn = event.target.closest('[data-pick]');
      if (!btn) return;
      body.onclick = null;
      const mine = Number(btn.dataset.pick);
      const votes = [2, 9, 4].map((v, i) => v + (i === mine ? 1 : 0) + Math.floor(Math.random() * 3));
      const total = votes.reduce((a, b) => a + b, 0);
      $$('.dp-opt', body).forEach((el, i) => {
        el.disabled = true;
        el.classList.toggle('mine', i === mine);
        const pct = Math.round((votes[i] / total) * 100);
        requestAnimationFrame(() => { el.querySelector('.fill').style.width = `${pct}%`; });
        el.querySelector('.pc').textContent = `${pct}%`;
      });
      $('#dp-note').innerHTML = `<b>Thanks, you are done.</b> ${total} people answered. Back to the meeting.`;
    };
  },

  react() {
    caption.textContent = 'The host opened the floor: send each reaction once and watch the counts.';
    const counts = { agree: 6, question: 2, lost: 1, fast: 0, move_on: 1 };
    const sent = new Set();
    const draw = () => {
      body.innerHTML = `<div class="dp-card"><span class="dp-label">The floor is open · one of each</span>
        <div class="dp-react">${REACTIONS.map(([k, e, l]) => `<button data-r="${k}" class="${sent.has(k) ? 'sent' : ''}" ${sent.has(k) ? 'disabled' : ''}><span class="e">${e}</span>${l}</button>`).join('')}</div></div>
        <div class="dp-card"><span class="dp-label">What the host sees</span><div class="dp-counts">${REACTIONS.map(([k, e]) => `<div><b>${counts[k]}</b>${e}</div>`).join('')}</div></div>`;
    };
    draw();
    body.onclick = (event) => {
      const btn = event.target.closest('[data-r]');
      if (!btn) return;
      const kind = btn.dataset.r;
      if (sent.has(kind)) return;
      sent.add(kind);
      counts[kind] += 1;
      const emoji = REACTIONS.find(([k]) => k === kind)[1];
      if (!reduceMotion) {
        for (let i = 0; i < 6; i++) {
          const s = document.createElement('span');
          s.textContent = emoji;
          s.style.left = `${20 + Math.random() * 60}%`;
          s.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
          s.style.animationDelay = `${i * 70}ms`;
          burst.append(s);
          setTimeout(() => s.remove(), 1700);
        }
      }
      draw();
    };
  },

  game() {
    caption.textContent = 'Colour tap: three quick rounds. Tap the colour named, fast.';
    let round = 0;
    let score = 0;
    let right = 0;
    const next = () => {
      round += 1;
      if (round > 3) {
        body.innerHTML = `<div class="dp-card"><span class="dp-label">Colour tap · finished</span><p class="dp-q">Game over</p>
          <p>You got <b>${right} of 3</b> right and scored <b>${score}</b> points.</p><p class="small muted">Your score is private. Back to the meeting.</p>
          <button class="primary" id="dp-again">Play again</button></div>`;
        $('#dp-again').onclick = () => demos.game();
        return;
      }
      const four = shuffle(COLORS).slice(0, 4);
      const target = four[Math.floor(Math.random() * 4)];
      const started = performance.now();
      const ms = 6000;
      body.innerHTML = `<div class="dp-card"><span class="dp-label">Colour tap · round ${round} of 3</span><p class="dp-q">Tap ${target[0].toUpperCase()}</p>
        <div class="dp-grid">${four.map(([name, hex]) => `<button class="dp-tile" style="--swatch:${hex}" data-c="${esc(name)}">${esc(name)}</button>`).join('')}</div>
        <div class="dp-timer"><span id="dp-bar"></span></div><div class="dp-score"><span id="dp-msg" class="muted">Go!</span><b>${score} pts</b></div></div>`;
      requestAnimationFrame(() => { const bar = $('#dp-bar'); bar.style.transitionDuration = `${ms}ms`; bar.style.width = '0%'; });
      const finish = (picked) => {
        clearTimeout(gameTimer);
        const ok = picked === target[0];
        const gained = ok ? 100 + Math.round(50 * Math.max(0, 1 - (performance.now() - started) / ms)) : 0;
        score += gained;
        right += ok ? 1 : 0;
        for (const tile of $$('.dp-tile', body)) {
          tile.disabled = true;
          tile.classList.toggle('right', tile.dataset.c === target[0]);
          tile.classList.toggle('wrong', tile.dataset.c === picked && !ok);
        }
        $('#dp-msg').innerHTML = picked === null ? 'No answer this round.' : ok ? `<b style="color:var(--ok)">Right! +${gained}</b>` : 'Not this time.';
        gameTimer = setTimeout(next, 1400);
      };
      body.onclick = (event) => {
        const tile = event.target.closest('[data-c]');
        if (tile && !tile.disabled) finish(tile.dataset.c);
      };
      gameTimer = setTimeout(() => finish(null), ms);
    };
    next();
  },
};

const show = (name) => {
  clearTimeout(gameTimer);
  body.onclick = null;
  for (const t of $$('.demo-switch [data-demo]')) t.setAttribute('aria-selected', String(t.dataset.demo === name));
  demos[name]();
};
for (const tab of $$('.demo-switch [data-demo]')) tab.addEventListener('click', () => show(tab.dataset.demo));
if (body) show('poll');
