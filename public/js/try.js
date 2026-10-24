import { $, formatClock } from './common.js';

let timer = null;
let expiresAt = 0;

const showError = (message) => {
  $('#try-error').textContent = message;
  $('#try-error').hidden = false;
  $('#try-stage').hidden = true;
};

// The host view asks its parent for the Meet add-on connection. There is none here, so say so at once.
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (event.origin !== location.origin || msg?.engage !== 'rpc') return;
  event.source.postMessage({ engage: 'rpc-result', id: msg.id, ok: true, ready: false }, location.origin);
});

const tick = () => {
  const left = expiresAt - Date.now();
  if (left <= 0) {
    clearInterval(timer);
    $('#try-clock').textContent = 'Ended';
    $('#try-stage').hidden = true;
    $('#try-over').hidden = false;
    $('#host-frame').removeAttribute('src');
    $('#part-frame').removeAttribute('src');
    return;
  }
  $('#try-clock').textContent = `Demo ends in ${formatClock(left)}`;
};

async function start() {
  clearInterval(timer);
  $('#try-error').hidden = true;
  $('#try-over').hidden = true;
  $('#try-clock').textContent = 'Starting…';
  try {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demo: true }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Could not start the demo.');
    // The server's clock may differ a little from this browser's, so count from now.
    expiresAt = Date.now() + (body.expiresAt - Date.now() > 0 && body.expiresAt - Date.now() < 3_600_000 ? body.expiresAt - Date.now() : 30 * 60_000);
    $('#host-frame').src = `/h/${body.code}?embed=1&tool=ask#t=${encodeURIComponent(body.hostToken)}`;
    $('#part-frame').src = `/j/${body.code}?embed=1&name=${encodeURIComponent('Priya Demo')}`;
    $('#try-stage').hidden = false;
    tick();
    timer = setInterval(tick, 1000);
  } catch (error) {
    showError(error.message);
    $('#try-clock').textContent = 'Unavailable';
  }
}

$('#try-again').addEventListener('click', start);
start();
