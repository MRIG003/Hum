import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { ActionError, Meeting } from '../server/meeting.js';
import { meetingCsv } from '../server/export.js';
import { createApp } from '../server/index.js';
import { openSqliteStore } from '../server/store.js';

const make = (agenda = 'Intro, 5\nDemo, 10') => {
  let now = 1_000_000;
  const meeting = new Meeting({ code: 'TEST42', title: 'Plan', agenda, clock: () => now, sampleMs: 30_000 });
  return { meeting, advance: (ms) => { now += ms; } };
};

// ---- persistence -----------------------------------------------------------

test('serialize and restore round-trips a meeting, and tokens survive as hashes only', () => {
  const { meeting, advance } = make();
  const a = meeting.join({ name: 'Priya' });
  meeting.react(a.id, 'agree');
  meeting.ask(a.id, 'When is launch?');
  meeting.launchMoment({ type: 'pulse', prompt: 'How is it?', durationSec: 30 });
  meeting.respond(a.id, meeting.moment.id, 4);
  advance(31_000);
  meeting.tick();
  const saved = JSON.parse(JSON.stringify(meeting.serialize()));
  const raw = JSON.stringify(saved);
  assert.ok(!raw.includes(a.token), 'participant token must not be stored');
  assert.ok(!raw.includes(meeting.hostToken), 'host token must not be stored');

  const back = Meeting.restore(saved, { clock: () => 1_100_000 });
  assert.equal(back.hostToken, null);
  assert.ok(back.checkHostToken(meeting.hostToken));
  assert.ok(!back.checkHostToken('wrong'));
  assert.equal(back.participants.size, 1);
  assert.equal(back.questions[0].text, 'When is launch?');
  assert.equal(back.hostSnapshot().series.length, meeting.series.length);
  const again = back.join({ pid: a.id, token: a.token });
  assert.equal(again.id, a.id);
});

test('anonymous question authors are not stored with the question', () => {
  const { meeting } = make();
  const a = meeting.join({ name: 'Priya' });
  meeting.ask(a.id, 'Is my job safe?', true);
  const q = meeting.serialize().questions[0];
  assert.equal(q.authorPid, null);
  assert.equal(q.author, 'Anonymous');
});

test('SQLite store keeps meetings across a restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'engage-'));
  const file = join(dir, 'engage.db');
  try {
    let store = await openSqliteStore(file);
    let app = createApp({ store });
    await new Promise((r) => app.server.listen(0, r));
    let base = `http://127.0.0.1:${app.server.address().port}`;
    const created = await (await fetch(`${base}/api/meetings`, { method: 'POST', body: JSON.stringify({ title: 'Survives' }) })).json();
    await app.close(); // flushes
    store = await openSqliteStore(file);
    app = createApp({ store });
    await new Promise((r) => app.server.listen(0, r));
    base = `http://127.0.0.1:${app.server.address().port}`;
    const info = await (await fetch(`${base}/api/meetings/${created.code}`)).json();
    assert.equal(info.title, 'Survives');
    assert.ok(app.meetings.get(created.code).checkHostToken(created.hostToken));
    await app.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- prompts per topic -----------------------------------------------------

test('prepared prompts attach to topics, follow the topic on agenda edits, and nudge at topic end', () => {
  const { meeting, advance } = make();
  meeting.addPrompt({ topic: 'demo', type: 'recall', prompt: 'What changed?', options: ['A', 'B'], correct: 0 });
  assert.throws(() => meeting.addPrompt({ topic: 'nope', type: 'pulse', prompt: 'x' }), ActionError);
  assert.equal(meeting.hostSnapshot().agenda.segments[1].prompts.length, 1);
  assert.equal(meeting.topicNudge(), null);

  advance(14 * 60_000 + 30_000); // 30s before Demo ends at minute 15
  const nudge = meeting.topicNudge();
  assert.equal(nudge.topic, 'Demo');

  meeting.setAgenda('Intro, 5\nDemo, 10\nWrap up, 5');
  assert.equal(meeting.prompts.length, 1);
  meeting.launchPrepared(nudge.promptId);
  assert.equal(meeting.moment.type, 'recall');
  assert.equal(meeting.prompts[0].used, true);
  meeting.closeMoment();
  assert.equal(meeting.topicNudge(), null);

  meeting.setAgenda('Intro, 5');
  assert.equal(meeting.prompts.length, 0);
});

test('topic nudge ignores the post-prompt suppression window but not focus mode', () => {
  const { meeting, advance } = make();
  meeting.addPrompt({ topic: 'intro', type: 'pulse', prompt: 'Clear so far?' });
  meeting.launchMoment({ type: 'poll', prompt: 'Warm up', options: ['a', 'b'] });
  meeting.closeMoment();
  advance(4 * 60_000 + 30_000);
  assert.equal(meeting.topicNudge().topic, 'Intro');
  meeting.setFocus(true);
  assert.equal(meeting.topicNudge(), null);
});

test('prepared prompts are host-only and the cap per topic holds', () => {
  const { meeting } = make();
  for (let i = 0; i < 3; i++) meeting.addPrompt({ topic: 'Intro', type: 'pulse', prompt: `p${i}` });
  assert.throws(() => meeting.addPrompt({ topic: 'Intro', type: 'pulse', prompt: 'p4' }), ActionError);
  const a = meeting.join({ name: 'A' });
  assert.equal(JSON.stringify(meeting.attendeeSnapshot(a.id)).includes('p0'), false);
});

// ---- pin and merge ---------------------------------------------------------

test('pinned questions sort first and are capped at three', () => {
  const { meeting } = make();
  const a = meeting.join({ name: 'A' });
  for (const t of ['q1', 'q2', 'q3', 'q4']) meeting.ask(a.id, t);
  const ids = meeting.questions.map((q) => q.id);
  for (const id of ids.slice(0, 3)) meeting.pinQuestion(id, true);
  assert.throws(() => meeting.pinQuestion(ids[3], true), ActionError);
  meeting.upvote(a.id, ids[3]);
  assert.equal(meeting.attendeeSnapshot(a.id).questions[0].pinned, true);
  meeting.pinQuestion(ids[0], false);
  meeting.pinQuestion(ids[3], true);
  assert.ok(meeting.hostSnapshot().questions.slice(0, 3).every((q) => q.pinned));
});

test('merging combines votes without double counting and removes the duplicate', () => {
  const { meeting } = make();
  const a = meeting.join({ name: 'A' });
  const b = meeting.join({ name: 'B' });
  const c = meeting.join({ name: 'C' });
  meeting.ask(a.id, 'When is launch?');
  meeting.ask(b.id, 'Launch date?');
  const [first, second] = meeting.questions.map((q) => q.id);
  meeting.upvote(c.id, first);
  meeting.upvote(c.id, second);
  meeting.upvote(a.id, second);
  meeting.mergeQuestions(second, first);
  assert.equal(meeting.questions.length, 1);
  assert.equal(meeting.questions[0].votes.size, 2);
  assert.equal(meeting.hostSnapshot().questions[0].merged, 1);
  assert.throws(() => meeting.mergeQuestions(first, first), ActionError);
});

// ---- CSV -------------------------------------------------------------------

test('CSV export has results, neutralises formulas and never holds names', () => {
  const { meeting } = make();
  const a = meeting.join({ name: 'Priya Sharma' });
  const b = meeting.join({ anon: true });
  meeting.ask(a.id, '=HYPERLINK("http://evil","x"), is this ok?');
  meeting.ask(b.id, 'Anonymous worry', true);
  meeting.launchMoment({ type: 'recall', prompt: 'What changed?', options: ['A', 'B'], correct: 0 });
  meeting.respond(a.id, meeting.moment.id, 'missed');
  meeting.closeMoment();
  meeting.end();
  const csv = meetingCsv(meeting);
  assert.ok(csv.startsWith('section,item,metric,value'));
  assert.ok(csv.includes('missed_that,1'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"",""x""), is this ok?"`));
  assert.ok(!csv.includes('Priya'));
  assert.ok(!csv.includes(a.id));
});

// ---- accounts and ownership over HTTP/WS -----------------------------------

let app;
let base;
const sockets = [];
before(async () => {
  app = createApp();
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => {
  for (const ws of sockets) ws.terminate();
  await app.close();
});

const post = (path, body, cookie) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (res) => res.headers.get('set-cookie').split(';')[0];

const wsHost = (code, hostToken, cookie) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/ws`, { headers: cookie ? { cookie } : {} });
    sockets.push(ws);
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      if (msg.t === 'welcome' || msg.t === 'fatal') resolve(msg);
    });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', role: 'host', code, hostToken })));
  });

test('register, login, me and logout', async () => {
  assert.equal((await (await fetch(`${base}/api/auth/me`)).json()).email, null);
  assert.equal((await post('/api/auth/register', { email: 'nope', password: 'longenough1' })).status, 400);
  assert.equal((await post('/api/auth/register', { email: 'a@b.co', password: 'short' })).status, 400);
  const reg = await post('/api/auth/register', { email: 'Host@Example.com', password: 'correct horse' });
  assert.equal(reg.status, 201);
  const setCookie = reg.headers.get('set-cookie');
  assert.ok(setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Lax'));
  const cookie = cookieOf(reg);
  assert.equal((await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json()).email, 'host@example.com');
  assert.equal((await post('/api/auth/register', { email: 'host@example.com', password: 'correct horse' })).status, 409);
  assert.equal((await post('/api/auth/login', { email: 'host@example.com', password: 'wrong password' })).status, 401);
  const login = await post('/api/auth/login', { email: 'host@example.com', password: 'correct horse' });
  assert.equal(login.status, 200);
  await post('/api/auth/logout', {}, cookie);
  assert.equal((await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json()).email, null);
});

test('owned meetings are listed, claimable, openable by cookie, and deletable only by the host', async () => {
  const cookie = cookieOf(await post('/api/auth/register', { email: 'owner@example.com', password: 'correct horse' }));
  const other = cookieOf(await post('/api/auth/register', { email: 'other@example.com', password: 'correct horse' }));

  const made = await (await post('/api/meetings', { title: 'Owned' }, cookie)).json();
  const list = await (await fetch(`${base}/api/my/meetings`, { headers: { cookie } })).json();
  assert.ok(list.meetings.some((m) => m.code === made.code));
  assert.equal((await (await fetch(`${base}/api/my/meetings`, { headers: { cookie: other } })).json()).meetings.length, 0);

  assert.equal((await wsHost(made.code, undefined, cookie)).t, 'welcome', 'owner opens with cookie only');
  assert.equal((await wsHost(made.code, undefined, other)).t, 'fatal');
  assert.equal((await wsHost(made.code, undefined)).t, 'fatal');

  const anon = await (await post('/api/meetings', { title: 'Anon then claimed' })).json();
  assert.equal((await wsHost(anon.code, anon.hostToken, cookie)).t, 'welcome');
  assert.ok((await (await fetch(`${base}/api/my/meetings`, { headers: { cookie } })).json()).meetings.some((m) => m.code === anon.code));

  assert.equal((await fetch(`${base}/api/meetings/${made.code}`, { method: 'DELETE' })).status, 403);
  assert.equal((await fetch(`${base}/api/meetings/${made.code}`, { method: 'DELETE', headers: { cookie: other } })).status, 403);
  assert.equal((await fetch(`${base}/api/meetings/${made.code}`, { method: 'DELETE', headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${base}/api/meetings/${made.code}`)).status, 404);
  assert.equal((await fetch(`${base}/api/meetings/${anon.code}`, { method: 'DELETE', headers: { 'x-host-token': anon.hostToken } })).status, 200);
});

test('CSV and QR endpoints: export needs the host token, QR is an SVG, short address redirects', async () => {
  const made = await (await post('/api/meetings', { title: 'Export me' })).json();
  assert.equal((await fetch(`${base}/api/meetings/${made.code}/export.csv`)).status, 403);
  const ok = await fetch(`${base}/api/meetings/${made.code}/export.csv`, { headers: { 'x-host-token': made.hostToken } });
  assert.equal(ok.status, 200);
  assert.ok(ok.headers.get('content-type').startsWith('text/csv'));
  assert.ok((await ok.text()).includes('Export me'));

  const qr = await fetch(`${base}/api/qr/${made.code}.svg`);
  assert.equal(qr.status, 200);
  assert.equal(qr.headers.get('content-type'), 'image/svg+xml');
  assert.ok((await qr.text()).startsWith('<svg'));
  assert.equal((await fetch(`${base}/api/qr/ZZZZZZ.svg`)).status, 404);

  const short = await fetch(`${base}/${made.code.toLowerCase()}`, { redirect: 'manual' });
  assert.equal(short.status, 302);
  assert.equal(short.headers.get('location'), `/j/${made.code}`);
});

// ---- Postgres store (runs only when ENGAGE_TEST_DATABASE_URL is set) ----------------------

test('Postgres store keeps meetings and accounts across a restart', { skip: !process.env.ENGAGE_TEST_DATABASE_URL }, async () => {
  const { openPostgresStore } = await import('../server/store.js');
  let store = await openPostgresStore(process.env.ENGAGE_TEST_DATABASE_URL);
  let app = createApp({ store });
  await new Promise((r) => app.server.listen(0, r));
  let url = `http://127.0.0.1:${app.server.address().port}`;
  const email = `pg-${Date.now()}@example.com`;
  const reg = await fetch(`${url}/api/auth/register`, { method: 'POST', body: JSON.stringify({ email, password: 'correct horse' }) });
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const made = await (await fetch(`${url}/api/meetings`, { method: 'POST', headers: { cookie }, body: JSON.stringify({ title: 'In Postgres' }) })).json();
  await new Promise((r) => setTimeout(r, 3500));
  await app.close();

  store = await openPostgresStore(process.env.ENGAGE_TEST_DATABASE_URL);
  app = createApp({ store });
  await new Promise((r) => app.server.listen(0, r));
  url = `http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await (await fetch(`${url}/api/meetings/${made.code}`)).json()).title, 'In Postgres');
  assert.equal((await (await fetch(`${url}/api/auth/me`, { headers: { cookie } })).json()).email, email);
  await fetch(`${url}/api/meetings/${made.code}`, { method: 'DELETE', headers: { cookie } });
  await app.close();
});
