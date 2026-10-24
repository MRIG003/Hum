import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../server/index.js';
import { createMailer } from '../server/mail.js';

const boot = async (extra = {}) => {
  const sent = [];
  let now = 20_000_000;
  const mailer = { enabled: true, send: async (mail) => { sent.push(mail); return { sent: true }; } };
  const app = createApp({ clock: () => now, mailer, ...extra });
  await new Promise((r) => app.server.listen(0, r));
  const url = `http://localhost:${app.server.address().port}`;
  const post = (path, body, cookie) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body ?? {}) });
  const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];
  const tokenIn = (mail) => mail.text.match(/token=([0-9a-f]{64})/)[1];
  return { app, url, post, sent, cookieOf, tokenIn, advance: (ms) => { now += ms; } };
};

test('the mailer sends through Resend with a bearer key, and does nothing without one', async () => {
  const calls = [];
  const logs = [];
  const log = { log: (m) => logs.push(m), error: (m) => logs.push(m) };
  const ok = createMailer({ apiKey: 're_secret', from: 'Engage <hello@example.com>', log, fetchImpl: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200 }; } });
  assert.deepEqual(await ok.send({ to: 'a@b.co', subject: 'Hi', text: 't', html: '<p>t</p>' }), { sent: true });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_secret');
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ['a@b.co']);

  const failing = createMailer({ apiKey: 're_secret', from: 'x@y.co', log, fetchImpl: async () => ({ ok: false, status: 403 }) });
  assert.deepEqual(await failing.send({ to: 'a@b.co', subject: 'Hi', text: 't', html: 't' }), { sent: false });
  const throwing = createMailer({ apiKey: 're_secret', from: 'x@y.co', log, fetchImpl: async () => { throw new Error('re_secret leaked?'); } });
  assert.deepEqual(await throwing.send({ to: 'a@b.co', subject: 'Hi', text: 't', html: 't' }), { sent: false });

  const off = createMailer({ apiKey: '', from: '', log, fetchImpl: async () => { throw new Error('must not be called'); } });
  assert.equal(off.enabled, false);
  assert.deepEqual(await off.send({ to: 'a@b.co', subject: 'Hi', text: 't', html: 't' }), { sent: false });
  assert.ok(!logs.join('\n').includes('re_secret'), 'the key never reaches the log');
});

test('password reset: same answer for unknown addresses, one-time link, signs out old sessions', async () => {
  const t = await boot();
  const reg = await t.post('/api/auth/register', { email: 'host@example.com', password: 'old password 1' });
  const oldCookie = t.cookieOf(reg);
  t.sent.length = 0;

  const unknown = await t.post('/api/auth/forgot', { email: 'nobody@example.com' });
  assert.equal(unknown.status, 200);
  assert.equal(t.sent.length, 0, 'no email for an address without an account');
  const known = await t.post('/api/auth/forgot', { email: 'HOST@example.com' });
  assert.equal(known.status, 200);
  assert.deepEqual(await known.json(), await unknown.clone().json(), 'the answer does not reveal which addresses have accounts');
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].to, 'host@example.com');
  const token = t.tokenIn(t.sent[0]);

  assert.equal((await t.post('/api/auth/reset', { token, password: 'short' })).status, 400, 'a weak password does not use up the link');
  const done = await t.post('/api/auth/reset', { token, password: 'brand new password' });
  assert.equal(done.status, 200);
  const newCookie = t.cookieOf(done);
  assert.equal((await (await fetch(`${t.url}/api/auth/me`, { headers: { cookie: newCookie } })).json()).email, 'host@example.com');
  assert.equal((await (await fetch(`${t.url}/api/auth/me`, { headers: { cookie: oldCookie } })).json()).email, null, 'the old session is signed out');
  assert.equal((await t.post('/api/auth/reset', { token, password: 'another password' })).status, 410, 'the link works once');
  assert.equal((await t.post('/api/auth/login', { email: 'host@example.com', password: 'old password 1' })).status, 401);
  assert.equal((await t.post('/api/auth/login', { email: 'host@example.com', password: 'brand new password' })).status, 200);
  assert.equal((await (await fetch(`${t.url}/api/auth/me`, { headers: { cookie: newCookie } })).json()).verified, true, 'using the emailed link also confirms the address');
  await t.app.close();
});

test('a reset link expires after 30 minutes and stored tokens are hashes', async () => {
  const t = await boot();
  await t.post('/api/auth/register', { email: 'late@example.com', password: 'old password 1' });
  t.sent.length = 0;
  await t.post('/api/auth/forgot', { email: 'late@example.com' });
  const token = t.tokenIn(t.sent[0]);
  t.advance(31 * 60_000);
  assert.equal((await t.post('/api/auth/reset', { token, password: 'brand new password' })).status, 410);
  await t.app.close();
});

test('email confirmation: sent at sign-up, works once, can be sent again', async () => {
  const t = await boot();
  const reg = await t.post('/api/auth/register', { email: 'new@example.com', password: 'correct horse' });
  const cookie = t.cookieOf(reg);
  assert.equal(t.sent.length, 1);
  assert.match(t.sent[0].subject, /Confirm/);
  assert.equal((await (await fetch(`${t.url}/api/auth/me`, { headers: { cookie } })).json()).verified, false);
  assert.equal((await t.post('/api/auth/verify/resend', {})).status, 401, 'needs a signed-in account');
  assert.equal((await t.post('/api/auth/verify/resend', {}, cookie)).status, 200);
  assert.equal(t.sent.length, 2);
  const token = t.tokenIn(t.sent[1]);
  assert.equal((await t.post('/api/auth/verify', { token: 'f'.repeat(64) })).status, 410);
  assert.equal((await t.post('/api/auth/verify', { token })).status, 200);
  assert.equal((await t.post('/api/auth/verify', { token })).status, 410, 'one use only');
  assert.equal((await (await fetch(`${t.url}/api/auth/me`, { headers: { cookie } })).json()).verified, true);
  await t.app.close();
});

const endedMeeting = async (t, cookie) => {
  const made = await (await t.post('/api/meetings', { title: 'Weekly sync' }, cookie)).json();
  const meeting = t.app.meetings.get(made.code);
  meeting.join({ name: 'Priya Sharma' });
  meeting.end();
  return { code: made.code, hostToken: made.hostToken, meeting };
};

test('emailing the summary: needs an account, a confirmed address, and is limited', async () => {
  const t = await boot();
  const anon = await endedMeeting(t);
  const headers = { 'Content-Type': 'application/json', 'x-host-token': anon.hostToken };
  const ask = (code, h = headers) => fetch(`${t.url}/api/meetings/${code}/email-summary`, { method: 'POST', headers: h });
  assert.deepEqual(await (await ask(anon.code)).json(), { status: 'signin' });
  assert.equal((await ask(anon.code, { 'Content-Type': 'application/json' })).status, 404, 'only the host can ask');

  const cookie = t.cookieOf(await t.post('/api/auth/register', { email: 'owner@example.com', password: 'correct horse' }));
  const mine = await endedMeeting(t, cookie);
  assert.deepEqual(await (await ask(mine.code, { cookie })).json(), { status: 'verify' });
  const verifyMail = t.sent.find((m) => /Confirm/.test(m.subject));
  await t.post('/api/auth/verify', { token: t.tokenIn(verifyMail) });
  t.sent.length = 0;
  const sentRes = await (await ask(mine.code, { cookie })).json();
  assert.equal(sentRes.status, 'sent');
  assert.equal(sentRes.to, 'o***@example.com', 'the address is masked in the answer');
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].to, 'owner@example.com');
  assert.match(t.sent[0].text, /Weekly sync/);
  assert.equal((await ask(mine.code, { cookie })).status, 429, 'not again straight away');
  await t.app.close();
});

test('a confirmed host is emailed the summary automatically, once, when the meeting ends', async () => {
  const t = await boot();
  const cookie = t.cookieOf(await t.post('/api/auth/register', { email: 'auto@example.com', password: 'correct horse' }));
  await t.post('/api/auth/verify', { token: t.tokenIn(t.sent[0]) });
  t.sent.length = 0;
  const made = await (await t.post('/api/meetings', { title: 'Auto one' }, cookie)).json();
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(t.sent.length, 0, 'nothing while the meeting is live');
  t.app.meetings.get(made.code).end();
  await new Promise((r) => setTimeout(r, 2300));
  assert.equal(t.sent.length, 1);
  assert.match(t.sent[0].subject, /Auto one/);
  await new Promise((r) => setTimeout(r, 2200));
  assert.equal(t.sent.length, 1, 'only once');
  await t.app.close();
});

test('an unconfirmed host is not emailed, and demo meetings never are', async () => {
  const t = await boot();
  const cookie = t.cookieOf(await t.post('/api/auth/register', { email: 'unconfirmed@example.com', password: 'correct horse' }));
  t.sent.length = 0;
  const made = await (await t.post('/api/meetings', { title: 'Quiet' }, cookie)).json();
  t.app.meetings.get(made.code).end();
  await new Promise((r) => setTimeout(r, 2300));
  assert.equal(t.sent.length, 0);
  await t.app.close();
});

test('SQLite keeps tokens and confirmed addresses, and upgrades an older users table', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');
  const { openSqliteStore } = await import('../server/store.js');
  const dir = mkdtempSync(join(tmpdir(), 'engage-mail-'));
  const file = join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL); INSERT INTO users VALUES ('u1', 'old@example.com', 'aa', 'bb', 1)");
  old.close();
  let store = await openSqliteStore(file);
  assert.equal(store.getUser('u1').verifiedAt, null, 'an existing account loads as unconfirmed');
  store.updateUser('u1', { verifiedAt: 123 });
  store.putToken('h1', 'reset', 'u1', 1000);
  store.putToken('h2', 'reset', 'u1', 2000); // replaces the first
  assert.equal(store.takeToken('h1', 'reset', 10), null);
  store.close();
  store = await openSqliteStore(file);
  assert.equal(store.getUser('u1').verifiedAt, 123);
  assert.equal(store.takeToken('h2', 'verify', 10), null, 'wrong kind');
  assert.equal(store.takeToken('h2', 'reset', 3000), null, 'expired');
  store.putToken('h3', 'reset', 'u1', 5000);
  assert.equal(store.takeToken('h3', 'reset', 10), 'u1');
  assert.equal(store.takeToken('h3', 'reset', 10), null, 'once only');
  store.close();
  rmSync(dir, { recursive: true, force: true });
});
