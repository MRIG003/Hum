process.on('unhandledRejection', (e) => console.log('unhandled', e?.message));
// Records a walkthrough of a real Engage meeting: host panel plus two participant panels on a
// tutorial stage, with four more attendees joined in the background. Output: CFR 30 fps H.264.
import pw from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const { chromium } = pw;
const B = process.env.BASE ?? 'http://localhost:3100';
const DIR = new URL('.', import.meta.url).pathname;
const OUT = process.argv[2] ?? `${DIR}/raw.mp4`;
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- recorder: CDP screencast -> constant frame rate -> ffmpeg ----------
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
let latest = null, emitted = 0, started = 0, pausedAt = 0, pausedTotal = 0, recording = false;
const tick = setInterval(() => {
  if (!recording || !latest) return;
  const target = Math.floor((Date.now() - started - pausedTotal) / (1000 / FPS));
  while (emitted < target) { ff.stdin.write(latest); emitted += 1; }
}, 8);
const pause = () => { recording = false; pausedAt = Date.now(); };
const resume = () => { pausedTotal += Date.now() - pausedAt; recording = true; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
await ctx.route(`${B}/__stage`, (r) => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(`${DIR}/stage.html`, 'utf8') }));
const page = await ctx.newPage();
await page.goto(`${B}/__stage`);
await page.waitForTimeout(800);
const cdp = await ctx.newCDPSession(page);
cdp.on('Page.screencastFrame', async (f) => {
  latest = Buffer.from(f.data, 'base64');
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* closing */ }
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
// The screencast only sends frames on change; nudge one so there is a first frame.
await page.evaluate(() => document.body.style.setProperty('--n', '1'));
await sleep(300);
started = Date.now(); recording = true;

// ---------- stage helpers ----------
const st = (fn, arg) => page.evaluate(fn, arg);
const step = (n) => st((n) => setStep(n), n);
const cap = (t, s) => st(([t, s]) => cap(t, s), [t, s]);
const hl = (id) => st((id) => hl(id), id);
const host = page.frameLocator('#f-host');
const p1 = page.frameLocator('#f-p1');
const p2 = page.frameLocator('#f-p2');

async function point(loc) {
  await loc.scrollIntoViewIfNeeded();
  const bb = await loc.boundingBox();
  const x = bb.x + Math.min(bb.width / 2, 80), y = bb.y + bb.height / 2;
  await st(([x, y]) => moveCursor(x, y), [x, y]);
  await sleep(800);
  return [x, y];
}
async function click(loc, { pauseAfter = 500 } = {}) {
  loc = loc.first();
  const [x, y] = await point(loc);
  await st(([x, y]) => ripple(x, y), [x, y]);
  await loc.click();
  await sleep(pauseAfter);
}
async function choose(loc, value) {
  const [x, y] = await point(loc);
  await st(([x, y]) => ripple(x, y), [x, y]);
  await loc.selectOption(value);
  await sleep(600);
}
async function type(loc, text) {
  await click(loc, { pauseAfter: 150 });
  await loc.pressSequentially(text, { delay: 45 });
  await sleep(300);
}
const tool = (v) => choose(host.locator('#feature'), v);

// ---------- background attendees (not on screen) ----------
async function attendee(code, name) {
  const c = await browser.newContext({ viewport: { width: 430, height: 800 } });
  const p = await c.newPage();
  await p.goto(`${B}/j/${code}?embed=1&name=${encodeURIComponent(name)}`);
  return p;
}
const answer = async (p, idx, delay = 0) => {
  await sleep(delay);
  const b = p.locator(`[data-answer="${idx}"]`).first();
  try { await b.waitFor({ timeout: 15000 }); await b.click(); } catch (e) { log('answer failed', idx, e.message.slice(0, 80)); }
};
// Colour tap: read "Tap RED" and press the matching colour. `miss` taps a wrong one.
async function playColours(p, { delays, miss = [], onScreen = false }) {
  for (let round = 0; round < delays.length; round += 1) {
    const choices = p.locator('[data-game-choice]:not([disabled])');
    try { await choices.first().waitFor({ timeout: 20000 }); } catch { return; }
    const text = await p.locator('#moment').innerText();
    const want = (text.match(/Tap\s+([A-Z]+)/) ?? [])[1] ?? '';
    await sleep(delays[round]);
    const n = await choices.count();
    let pick = 0;
    for (let i = 0; i < n; i += 1) {
      const label = ((await choices.nth(i).getAttribute('aria-label')) ?? '').toUpperCase();
      if ((label === want) !== miss.includes(round)) { pick = i; break; }
    }
    const b = choices.nth(pick);
    if (onScreen) await click(b, { pauseAfter: 100 }); else await b.click().catch(() => {});
    // wait for this round to finish before looking for the next one
    await p.locator('[data-game-choice]:not([disabled])').first().waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    await sleep(400);
  }
}

// =====================================================================================
log('meeting');
const m = await (await fetch(`${B}/api/meetings`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Leadership workshop: giving feedback', platform: 'meet', expected: 6,
    agenda: 'Welcome, 5\nThe feedback model, 20\nPractice in pairs, 25\nWrap up, 10' }),
})).json();

// Intro card
await sleep(3800);
await st(() => card('intro', false));
await sleep(900);

// 1. Start Engage
await step(0); await hl('c-host');
await cap('1 · Start Engage from your meeting', 'In Google Meet™: <b>Activities → Engage → Start Engage</b>. On Zoom or Teams, create a meeting at engage.neuronlab.in.');
await st(([c, t]) => { document.getElementById('f-host').src = `/h/${c}?embed=1&tool=invite#t=${t}`; }, [m.code, m.hostToken]);
await sleep(4500);
await cap('1 · Start Engage from your meeting', 'Your host panel opens beside the call. Pick one tool at a time from <b>Host tools</b>.');
await point(host.locator('#feature'));
await sleep(3000);

// 2. Invite everyone
await step(1);
await cap('2 · Invite everyone', 'Copy the chat message and paste it in the meeting chat. In Meet, people can also open Engage from Activities.');
await click(host.getByRole('button', { name: 'Copy chat message' }));
await sleep(1800);
await st(([c]) => { document.getElementById('f-p1').src = `/j/${c}?embed=1`; document.getElementById('f-p2').src = `/j/${c}?embed=1`; }, [m.code]);
await sleep(1500);
await hl('c-p1');
await cap('2 · Invite everyone', 'Participants type their name and join. <b>No account, nothing to install.</b> They see exactly what the host can see.');
await type(p1.locator('#name'), 'Mei Chen');
await sleep(1200);
await click(p1.locator('#join-form button'));
await hl('c-p2');
await type(p2.locator('#name'), 'Sam Okafor');
await click(p2.locator('#join-form button'));
const bg = {};
for (const n of ['Tom Becker', 'Aisha Khan', 'Lena Fischer', 'Arjun Rao']) bg[n] = await attendee(m.code, n);
const bgJoined = Date.now();
await hl('c-host');
await cap('2 · Invite everyone', 'Six people have joined. Your panel shows who is connected and how many have taken part.');
await sleep(4000);

// 3. Ask the room (poll)
await step(2);
await cap('3 · Ask the room', 'Choose <b>Ask the room</b>, start from a ready-made question or write your own, then <b>Launch</b>.');
await tool('ask');
await choose(host.locator('#f-library'), { label: 'Is the pace of this meeting right?' });
await sleep(1200);
await choose(host.locator('#f-duration'), '20');
await click(host.locator('#f-submit'));
await hl('c-p1');
await cap('3 · Ask the room', 'The question fills everyone\'s panel at the same moment. One tap to answer, then back to the meeting.');
await sleep(1800);
await click(p1.locator('[data-answer="1"]'));
answer(bg['Tom Becker'], 1, 600); answer(bg['Aisha Khan'], 1, 1500);
await hl('c-p2');
await click(p2.locator('[data-answer="2"]'));
await hl('c-host');
await cap('3 · Ask the room', 'Results fill in live on your panel. Poll answers are never tied to names.');
await host.locator('#moment-card').scrollIntoViewIfNeeded().catch(() => {});
await sleep(9000);

// 4. Recall check
await step(3);
await cap('4 · Check the point landed', 'A <b>Recall check</b> asks about what was just said. Mark the right answer before you launch.');
await click(host.locator('#moment-tabs [data-kind="recall"]'));
await choose(host.locator('#f-library'), { label: 'Which of these did we just cover?' });
const opts = host.locator('#f-option-list .opt-input');
await type(opts.nth(0), 'Situation, behaviour, impact');
await type(opts.nth(1), 'Praise first, then criticism');
await type(opts.nth(2), 'Wait for the annual review');
await click(host.locator('#f-option-list .opt-correct').nth(0));
await choose(host.locator('#f-duration'), '20');
await click(host.locator('#f-submit'));
await hl('c-p1');
await cap('4 · Check the point landed', 'Participants can answer honestly with <b>Missed that</b>. No penalty, and it tells you what to repeat.');
await sleep(1500);
await click(p1.locator('[data-answer="0"]'));
answer(bg['Tom Becker'], 0, 500); answer(bg['Aisha Khan'], 'missed', 1200);
await hl('c-p2');
await click(p2.locator('[data-answer="missed"]'));
await hl('c-host');
await cap('4 · Check the point landed', 'Two of four missed it: recap the model in one sentence before moving on.');
await host.locator('#moment-card').scrollIntoViewIfNeeded().catch(() => {});
await sleep(9000);

// 5. Questions
await step(4);
await hl('c-p2');
await cap('5 · Take questions', 'Anyone can ask a question at any time, with their name or anonymously. Others upvote what they want answered.');
await type(p2.locator('input[placeholder="Type a question"]'), 'How do we give feedback to a manager?');
await click(p2.getByRole('button', { name: 'Ask', exact: true }));
await hl('c-p1');
await sleep(1200);
await click(p1.locator('[data-vote]'));
await hl('c-host');
await cap('5 · Take questions', 'You get a quiet cue. Open <b>Questions</b> to pin, merge duplicates, or mark one answered.');
await tool('questions');
await sleep(2500);
await click(host.locator('[data-answered]'));
await sleep(3500);

// 6. Open the floor
await step(5);
await cap('6 · Open the floor', 'Choose <b>Reactions → Open the floor</b> for a set time. Each person can send each reaction once.');
await tool('reactions');
await click(host.locator('#floor-open'));
await hl('c-p1');
await sleep(800);
await click(p1.locator('[data-react]').nth(0));
for (const n of ['Tom Becker', 'Aisha Khan']) bg[n].locator('[data-react]').nth(0).click().catch(() => {});
await hl('c-p2');
await click(p2.locator('[data-react]').nth(0));
await click(p2.locator('[data-react]').nth(3));
bg['Tom Becker'].locator('[data-react]').nth(1).click().catch(() => {});
await hl('c-host');
await cap('6 · Open the floor', 'Counts only, no names. A few "Too fast" taps? Slow down.');
await sleep(6000);
await click(host.locator('#floor-close')).catch(() => {});

// 7. Quick game
await step(6);
await cap('7 · Wake the room up', 'Energy dipping? Choose <b>Games</b>, pick a one-minute game and start it. Everyone plays the same round at once.');
await tool('games');
await click(host.locator('[data-game-kind="colors"]'));
await choose(host.locator('#game-rounds'), '3');
await choose(host.locator('#game-seconds'), '8');
await click(host.locator('#game-start'));
await hl('c-p1');
await cap('7 · Wake the room up', 'Scores are private: each person sees only their own. Nobody is ranked.');
const frameOf = async (sel) => (await page.locator(sel).elementHandle()).contentFrame();
const fMei = await frameOf('#f-p1'), fSam = await frameOf('#f-p2');
const onScreen = (f, delays, miss = []) => playColours(f, { delays, miss, onScreen: true });
const bgGames = [
  playColours(bg['Tom Becker'], { delays: [900, 1300, 700] }),
  playColours(bg['Aisha Khan'], { delays: [1600, 900, 1800], miss: [1] }),
];
// Mei and Sam play on screen, one after the other within each round.
for (let r = 0; r < 3; r += 1) {
  await hl('c-p1');
  await onScreen(fMei, [700]);
  await hl('c-p2');
  await onScreen(fSam, [200], r === 1 ? [0] : []);
}
await Promise.allSettled(bgGames);
await hl('c-host');
await cap('7 · Wake the room up', 'You see how many got each round right, never who.');
await sleep(5000);

// 8. Who has been quiet (needs a few real minutes of inactivity; the wait is cut from the video)
await step(7);
pause();
log('waiting for quiet threshold', Math.round((Date.now() - bgJoined) / 1000), 's since join');
await tool('people');
await host.locator('#quiet-after').selectOption('3');
await sleep(Math.max(0, 190_000 - (Date.now() - bgJoined)));
resume();
await cap('8 · See who has gone quiet', 'Choose <b>Who has been quiet</b>. Only you see this: names and minutes since they last took part in Engage.');
await point(host.locator('#quiet-after'));
await sleep(5000);
await click(host.locator('[data-person]').first());
await sleep(4000);
await click(host.locator('#person-close'));
await cap('8 · See who has gone quiet', 'Invite people in kindly. Ask the whole room something quick, never call someone out.');
await tool('ask');
await click(host.locator('#moment-tabs [data-kind="pulse"]'));
await choose(host.locator('#f-library'), { label: 'How is your energy right now?' });
await choose(host.locator('#f-duration'), '20');
await click(host.locator('#f-submit'));
await hl('c-p1');
await sleep(1200);
await click(p1.locator('[data-answer="4"]'));
answer(bg['Lena Fischer'], 3, 800); answer(bg['Tom Becker'], 4, 400); answer(bg['Aisha Khan'], 3, 1500);
await hl('c-p2');
await click(p2.locator('[data-answer="3"]'));
await hl('c-host');
await sleep(3000);
await tool('people');
await cap('8 · See who has gone quiet', 'Lena answered the pulse check, so she is back in. The list updates live.');
await sleep(6000);

// 9. Focus moment
await step(8);
await cap('9 · Focus moment', 'Need full attention, or sharing your screen? <b>Focus moment</b> pauses every prompt and game for everyone.');
await click(host.locator('#focus'));
await hl('c-p1');
await sleep(4500);
await hl('c-host');
await cap('9 · Focus moment', 'Press it again to carry on. Participants can also choose <b>I\'m presenting</b> to keep their own screen clear.');
await click(host.locator('#focus'));
await sleep(3000);

// 10. End and coach summary
await step(9);
await cap('10 · End the meeting and read the coach summary', 'Choose <b>End meeting</b>. You get a summary, and participants get their own recap.');
await click(host.locator('#end'));
await sleep(700);
await click(host.locator('#confirm-yes'));
await sleep(3000);
await hl('c-host');
await cap('10 · End the meeting and read the coach summary', 'When engagement dipped, what is still open, and <b>one thing to try next time</b>. Signed-in hosts also get it by email.');
const hf = await frameOf('#f-host');
for (let y = 0; y < 6; y += 1) { await hf.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' })); await sleep(1700); }
await sleep(2000);
await hl('c-p1');
await cap('10 · End the meeting and read the coach summary', 'Each participant gets their own recap: results, their questions and private notes.');
await sleep(5000);
await hl('');

// Outro
await st(() => card('outro', true));
await sleep(7000);

recording = false;
clearInterval(tick);
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
log('done', emitted, 'frames', (emitted / FPS).toFixed(1), 's');
