import { $ } from './common.js';

let registering = false;

// Only same-site paths are allowed as a destination after signing in.
const next = () => {
  const target = new URLSearchParams(location.search).get('next');
  return target && /^\/[^/\\]/.test(target) ? target : '/meetings';
};

const sync = () => {
  $('#auth-title').textContent = registering ? 'Create a host account' : 'Sign in';
  $('#auth-submit').textContent = registering ? 'Create account' : 'Sign in';
  $('#auth-toggle').textContent = registering ? 'I already have an account' : 'Create an account instead';
  $('#password').autocomplete = registering ? 'new-password' : 'current-password';
  $('#pw-hint').hidden = !registering;
  $('#forgot-link').hidden = registering;
};

$('#auth-toggle').addEventListener('click', () => {
  registering = !registering;
  sync();
});

$('#auth').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = $('#auth-error');
  error.hidden = true;
  $('#auth-submit').disabled = true;
  try {
    const res = await fetch(`/api/auth/${registering ? 'register' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('#email').value, password: $('#password').value }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Something went wrong.');
    location.href = next();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
    $('#auth-submit').disabled = false;
  }
});
sync();
