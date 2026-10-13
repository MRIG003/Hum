// Smoke test for a running Engage server (local or deployed).
//   node scripts/smoke.mjs https://your-engage-url
//   npm run smoke -- http://localhost:3000
// It creates one throwaway meeting, plays host and attendee over a real WebSocket,
// and prints PASS or FAIL for every check. Exit code is 1 if anything fails.
import { WebSocket } from 'ws';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const wsUrl = `${base.replace(/^http/, 'ws')}/ws`;
let failures = 0;
const results = [];

const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const openSocket = (hello) => new Promise((resolve, reject) => {
  const ws = new WebSocket(wsUrl);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    inbox.push(JSON.parse(raw));
    for (const w of waiters.splice(0)) w();
  });
  ws.on('error', reject);
  ws.on('open', () => {
    ws.send(JSON.stringify(hello));
    resolve({
      ws,
      inbox,
      send: (m) => ws.send(JSON.stringify(m)),
      until: async (predicate, ms = 5000) => {
        const deadline = Date.now() + ms;
        for (;;) {
          const hit = inbox.findLast(predicate);
          if (hit) return hit;
          if (Date.now() > deadline) return null;
          await new Promise((r) => { waiters.push(r); setTimeout(r, 100); });
        }
      },
    });
  });
});

const getStatus = async (path) => {
  const response = await fetch(base + path);
  return { status: response.status, headers: response.headers, text: await response.text() };
};

console.log(`Engage smoke test against ${base}\n`);

// ---- 1. server and pages
try {
  const health = await getStatus('/healthz');
  check('Health check answers', health.status === 200 && JSON.parse(health.text).ok === true);
} catch (error) {
  check('Server is reachable', false, error.message);
  console.log('\nCannot continue. Check the URL and that the server is running.');
  process.exit(1);
}

for (const path of ['/', '/privacy.html', '/css/styles.css', '/js/host.js', '/js/attendee.js', '/js/mini.js', '/js/views.js', '/favicon.svg']) {
  const r = await getStatus(path);
  check(`Page or file loads: ${path}`, r.status === 200, `status ${r.status}`);
}
const home = await getStatus('/');
check('Security headers are set', Boolean(home.headers.get('content-security-policy')) && home.headers.get('x-content-type-options') === 'nosniff');
check('Config endpoint answers', (await getStatus('/api/config')).status === 200);
check('Unknown meeting code gives 404', (await getStatus('/api/meetings/ZZZZZZ')).status === 404);

// ---- 2. create a meeting
const created = await fetch(`${base}/api/meetings`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Smoke test', expected: 2, agenda: 'Intro, 5\nBudget, 10' }),
});
check('Meeting can be created', created.status === 201, `status ${created.status}${created.status === 429 ? ', rate limited: wait and retry' : ''}`);
if (created.status !== 201) process.exit(1);
const { code, hostToken } = await created.json();
check('Meeting code has six characters', /^[A-Z0-9]{6}$/.test(code), code);
check('Meeting can be looked up', (await getStatus(`/api/meetings/${code}`)).status === 200);
check('Host page and join page load for this code', (await getStatus(`/h/${code}`)).status === 200 && (await getStatus(`/j/${code}`)).status === 200);

// ---- 3. realtime
let host;
let attendee;
try {
  const bad = await openSocket({ t: 'hello', role: 'host', code, hostToken: 'wrong' });
  check('Wrong host token is refused', Boolean(await bad.until((m) => m.t === 'fatal', 3000)));
  bad.ws.close();

  host = await openSocket({ t: 'hello', role: 'host', code, hostToken });
  const first = await host.until((m) => m.t === 'state');
  check('Host connects over WebSocket and gets state', Boolean(first));
  check('Agenda from creation is present', first?.state.agenda.segments.length === 2);

  attendee = await openSocket({ t: 'hello', role: 'attendee', code, name: 'Smoke' });
  const joined = await host.until((m) => m.t === 'state' && m.state.counts.connected === 1);
  check('Attendee joins and host sees them', Boolean(joined));

  const t0 = Date.now();
  attendee.send({ t: 'ask', text: 'Is this working?', anon: false });
  const asked = await host.until((m) => m.t === 'state' && m.state.questions.length === 1);
  const latency = Date.now() - t0;
  check('Question reaches the host', Boolean(asked), `${latency} ms`);
  check('Update arrives in under 1.5 seconds', Boolean(asked) && latency < 1500, `${latency} ms`);

  host.send({ t: 'launchMoment', type: 'recall', prompt: 'Which?', options: ['A', 'B'], correct: 1 });
  const open = await attendee.until((m) => m.t === 'state' && m.state.moment?.type === 'recall' && m.state.moment.status === 'open');
  check('Recall check reaches the attendee', Boolean(open));
  attendee.send({ t: 'respond', momentId: open?.state.moment.id, value: 'missed' });
  check('"Missed that" is counted for the host', Boolean(await host.until((m) => m.t === 'state' && m.state.moment?.results.missed === 1)));
  host.send({ t: 'closeMoment' });
  check('Closed result is shown to the attendee', Boolean(await attendee.until((m) => m.t === 'state' && m.state.moment?.status === 'closed' && m.state.moment.results)));

  host.send({ t: 'launchMoment', type: 'pulse', prompt: 'How is it going?', durationSec: 30 });
  const pulse = await attendee.until((m) => m.t === 'state' && m.state.moment?.type === 'pulse' && m.state.moment.status === 'open');
  host.send({ t: 'focus', on: true });
  await attendee.until((m) => m.t === 'state' && m.state.focus === true);
  attendee.send({ t: 'respond', momentId: pulse?.state.moment.id, value: 4 });
  check('Focus moment blocks answers', Boolean(await attendee.until((m) => m.t === 'error', 3000)));
  host.send({ t: 'focus', on: false });

  host.send({ t: 'end' });
  const ended = await host.until((m) => m.t === 'state' && m.state.status === 'ended');
  check('Meeting ends and the host gets a summary', Boolean(ended?.state.summary));
  check('Coach summary is included', Array.isArray(ended?.state.summary.coach.insights));
  check('Attendee gets a recap', Boolean(await attendee.until((m) => m.t === 'state' && m.state.status === 'ended' && m.state.recap)));
  check('Recap does not contain the host-only coach summary', !JSON.stringify(attendee.inbox.at(-1)).includes('"coach"'));

  const late = await openSocket({ t: 'hello', role: 'attendee', code, name: 'Late' });
  check('Joining after the meeting ended is refused', Boolean(await late.until((m) => m.t === 'fatal', 3000)));
  late.ws.close();
} catch (error) {
  check('Realtime flow completes', false, error.message);
} finally {
  host?.ws.close();
  attendee?.ws.close();
  await sleep(100);
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed} of ${results.length} checks passed.`);
console.log(failures === 0 ? 'ALL CHECKS PASSED. The server is working.' : `${failures} CHECK(S) FAILED. See the FAIL lines above and docs/START-HERE.md, section 6.`);
process.exit(failures === 0 ? 0 : 1);
