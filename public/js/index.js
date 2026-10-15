import { $, storage } from './common.js';

$('#create').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('#create-error');
  error.hidden = true;
  const button = event.target.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: $('#title').value, expected: $('#expected').value, agenda: $('#agenda').value, platform: $('#platform').value }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Could not create the meeting.');
    storage.set(`engage.host.${body.code}`, body.hostToken);
    location.href = `/h/${body.code}`;
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    button.disabled = false;
  }
});

const NOTES = {
  meet: 'Best experience: start Engage from the Activities panel inside your Meet call, and everyone joins in the same window. Creating it here also works.',
  zoom: 'Share the link in the Zoom chat. Attendees open it in a second window.',
  teams: 'Share the link in the Teams chat. Attendees open it in a second window.',
  zoho: 'Share the link in the Zoho Meeting chat. Attendees open it in a second window.',
  other: 'Share the link in your meeting chat. Attendees open it in a second window.',
};
const showNote = () => { $('#platform-note').textContent = NOTES[$('#platform').value]; };
$('#platform').value = storage.get('engage.platform') || 'meet';
showNote();
$('#platform').addEventListener('change', () => { storage.set('engage.platform', $('#platform').value); showNote(); });

$('#join').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(code)) location.href = `/j/${code}`;
});

fetch('/api/auth/me').then((r) => r.json()).then((me) => {
  if (!me.email) return;
  const a = $('#account');
  a.textContent = 'My meetings';
  a.href = '/meetings';
}).catch(() => {});
