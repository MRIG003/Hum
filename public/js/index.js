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
      body: JSON.stringify({ title: $('#title').value, expected: $('#expected').value, agenda: $('#agenda').value }),
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

$('#join').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = $('#code').value.trim().toUpperCase();
  if (/^[A-Z0-9]{6}$/.test(code)) location.href = `/j/${code}`;
});
