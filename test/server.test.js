import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { createApp } from '../server/index.js';

let app;
let base;
const sockets = [];

before(async () => {
  app = createApp();
  await new Promise((resolve) => app.server.listen(0, resolve));
  base = `127.0.0.1:${app.server.address().port}`;
});

after(async () => {
  for (const ws of sockets) ws.terminate();
  await app.close();
});

const createMeeting = async () => {
  const response = await fetch(`http://${base}/api/meetings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Test meeting' }),
  });
  assert.equal(response.status, 201);
  return response.json();
};

const open = (hello) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${base}/ws`);
    sockets.push(ws);
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      inbox.push(msg);
      for (const w of waiters.splice(0)) w();
    });
    ws.on('error', reject);
    ws.on('open', () => {
      ws.send(JSON.stringify(hello));
      resolve({
        ws,
        send: (m) => ws.send(JSON.stringify(m)),
        inbox,
        until: async (predicate, ms = 3000) => {
          const deadline = Date.now() + ms;
          for (;;) {
            const hit = inbox.findLast(predicate);
            if (hit) return hit;
            if (Date.now() > deadline) throw new Error('timed out waiting for message');
            await new Promise((r) => {
              waiters.push(r);
              setTimeout(r, 100);
            });
          }
        },
      });
    });
  });

test('rejects a wrong host token and unknown meetings', async () => {
  const { code } = await createMeeting();
  const bad = await open({ t: 'hello', role: 'host', code, hostToken: 'nope' });
  assert.equal((await bad.until((m) => m.t === 'fatal')).t, 'fatal');
  const missing = await open({ t: 'hello', role: 'attendee', code: 'ZZZZZZ', name: 'A' });
  assert.equal((await missing.until((m) => m.t === 'fatal')).error, 'Meeting not found.');
});

test('host and attendees see each other live', async () => {
  const { code, hostToken } = await createMeeting();
  const host = await open({ t: 'hello', role: 'host', code, hostToken });
  const priya = await open({ t: 'hello', role: 'attendee', code, name: 'Priya' });
  const dev = await open({ t: 'hello', role: 'attendee', code, name: 'Dev Patel' });

  await host.until((m) => m.t === 'state' && m.state.counts.connected === 2);
  host.send({ t: 'floor', durationSec: 60 });
  await priya.until((m) => m.t === 'state' && m.state.floor?.open);
  priya.send({ t: 'react', kind: 'lost' });
  priya.send({ t: 'ask', text: 'Who owns billing?' });
  dev.send({ t: 'ask', text: 'Is this shown with my name?' });

  const state = (await host.until((m) => m.t === 'state' && m.state.questions.length === 2)).state;
  assert.equal(state.reactions.lost, 1);
  assert.equal(state.floor.counts.lost, 1);
  assert.deepEqual(state.questions.map((q) => q.author).sort(), ['Dev Patel', 'Priya']);
  assert.equal(state.engagement.pct, 100);
  assert.equal(state.counts.participated, 2);
  assert.ok(!JSON.stringify(state).includes('token'));

  host.send({ t: 'launchMoment', type: 'poll', prompt: 'Ship?', options: ['Yes', 'No'] });
  const view = (await priya.until((m) => m.t === 'state' && m.state.moment?.status === 'open')).state;
  priya.send({ t: 'respond', momentId: view.moment.id, value: 0 });
  await host.until((m) => m.t === 'state' && m.state.moment?.results.total === 1);

  host.send({ t: 'focus', on: true });
  await priya.until((m) => m.t === 'state' && m.state.focus === true);
  dev.send({ t: 'respond', momentId: view.moment.id, value: 1 });
  assert.match((await dev.until((m) => m.t === 'error')).error, /Focus/);
});

test('attendees can reconnect with their token and keep their identity', async () => {
  const { code } = await createMeeting();
  const first = await open({ t: 'hello', role: 'attendee', code, name: 'Dev' });
  const welcome = await first.until((m) => m.t === 'welcome');
  first.ws.terminate();
  const again = await open({ t: 'hello', role: 'attendee', code, pid: welcome.pid, token: welcome.token });
  const back = await again.until((m) => m.t === 'welcome');
  assert.equal(back.pid, welcome.pid);
  assert.equal(back.name, 'Dev');
});

test('ending a meeting stops joins and gives the host a summary', async () => {
  const { code, hostToken } = await createMeeting();
  const host = await open({ t: 'hello', role: 'host', code, hostToken });
  const a = await open({ t: 'hello', role: 'attendee', code, name: 'Ann Lee' });
  await a.until((m) => m.t === 'state');
  host.send({ t: 'end' });
  const ended = await host.until((m) => m.t === 'state' && m.state.status === 'ended');
  assert.equal(ended.state.summary.joined, 1);
  const late = await open({ t: 'hello', role: 'attendee', code, name: 'Late' });
  assert.equal((await late.until((m) => m.t === 'fatal')).error, 'This meeting has ended.');
});

test('static pages and security headers', async () => {
  const { code } = await createMeeting();
  for (const path of ['/', `/h/${code}`, `/j/${code}`, '/css/styles.css', '/js/host.js']) {
    const response = await fetch(`http://${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  assert.equal((await fetch(`http://${base}/../package.json`)).status, 404);
  assert.equal((await fetch(`http://${base}/api/meetings/ZZZZZZ`)).status, 404);
});

test('config endpoint exposes the survey link only when set', async () => {
  const response = await fetch(`http://${base}/api/config`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { surveyUrl: null, googleCloudProjectNumber: null, build: 'dev' });
});

test('host can set an agenda and attendees see the current topic', async () => {
  const { code, hostToken } = await createMeeting();
  const host = await open({ t: 'hello', role: 'host', code, hostToken });
  const a = await open({ t: 'hello', role: 'attendee', code, name: 'Ann Lee' });
  await a.until((m) => m.t === 'state');
  host.send({ t: 'setAgenda', text: 'Intro, 5\nBudget, 20' });
  const state = (await host.until((m) => m.t === 'state' && m.state.agenda.segments.length === 2)).state;
  assert.deepEqual(state.agenda.segments.map((s) => s.title), ['Intro', 'Budget']);
  const view = (await a.until((m) => m.t === 'state' && m.state.agenda.segments.length === 2)).state;
  assert.equal(view.agenda.current, 'Intro');
});

test('recall check over the socket: missed answer, group result, cap error', async () => {
  const { code, hostToken } = await createMeeting();
  const host = await open({ t: 'hello', role: 'host', code, hostToken });
  const a = await open({ t: 'hello', role: 'attendee', code, name: 'Ann Lee' });
  await a.until((m) => m.t === 'state');
  const recall = { t: 'launchMoment', type: 'recall', prompt: 'Which?', options: ['X', 'Y'], correct: 1 };
  host.send(recall);
  const open1 = (await a.until((m) => m.t === 'state' && m.state.moment?.type === 'recall')).state;
  a.send({ t: 'respond', momentId: open1.moment.id, value: 'missed' });
  await host.until((m) => m.t === 'state' && m.state.moment?.results.missed === 1);
  host.send({ t: 'closeMoment' });
  host.send(recall);
  assert.match((await host.until((m) => m.t === 'error')).error, /available in/);
});
