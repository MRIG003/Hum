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
await ctx.route(`${B}/__stage`, (r) => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(`${DIR}/stage90.html`, 'utf8') }));
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
  await sleep(520);
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
  await loc.pressSequentially(text, { delay: 18 });
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
const frameOf = async (sel) => (await page.locator(sel).elementHandle()).contentFrame();

// Intro card
await sleep(3200);
await st(() => card('intro', false));
await sleep(700);

// 1. Start Engage
await step(0); await hl('c-host');
await cap('Start Engage from your Google Meet™ call', 'Open <b>Activities → Engage → Start Engage</b>. Your host panel opens beside the call.');
await st(([c, t]) => { document.getElementById('f-host').src = `/h/${c}?embed=1&tool=invite#t=${t}`; }, [m.code, m.hostToken]);
await sleep(3800);

// 2. Join
await step(1);
await cap('Everyone joins in one tap', 'They open Engage from Activities, or the link in chat. <b>No account, nothing recorded.</b>');
await st(([c]) => { document.getElementById('f-p1').src = `/j/${c}?embed=1`; document.getElementById('f-p2').src = `/j/${c}?embed=1`; }, [m.code]);
await sleep(1000);
await hl('c-p1');
await type(p1.locator('#name'), 'Mei Chen');
await click(p1.locator('#join-form button'), { pauseAfter: 200 });
await hl('c-p2');
await type(p2.locator('#name'), 'Sam Okafor');
await click(p2.locator('#join-form button'), { pauseAfter: 200 });
const bg = {};
for (const n of ['Tom Becker', 'Aisha Khan', 'Lena Fischer', 'Arjun Rao']) bg[n] = await attendee(m.code, n);
const bgJoined = Date.now();
await hl('c-host');
await sleep(1800);

// 3. Ask the room
await step(2);
await cap('Ask the room in one tap', 'Pick a ready-made question and launch it. Everyone answers in their own panel.');
await tool('ask');
await choose(host.locator('#f-library'), { label: 'Is the pace of this meeting right?' });
await choose(host.locator('#f-duration'), '20');
await click(host.locator('#f-submit'), { pauseAfter: 300 });
await hl('c-p1');
await click(p1.locator('[data-answer="1"]'), { pauseAfter: 200 });
answer(bg['Tom Becker'], 1, 300); answer(bg['Aisha Khan'], 1, 700);
await hl('c-p2');
await click(p2.locator('[data-answer="2"]'), { pauseAfter: 200 });
await hl('c-host');
await cap('Ask the room in one tap', 'Results fill in live. Answers are never tied to names.');
await host.locator('#moment-card').scrollIntoViewIfNeeded().catch(() => {});
await sleep(4200);

// 4. Recall check
await step(3);
await cap('Check the point landed', 'A <b>recall check</b> asks about what was just said, with an honest <b>Missed that</b> option.');
await click(host.locator('#moment-tabs [data-kind="recall"]'));
await choose(host.locator('#f-library'), { label: 'Which of these did we just cover?' });
const opts = host.locator('#f-option-list .opt-input');
await type(opts.nth(0), 'Situation, behaviour, impact');
await type(opts.nth(1), 'Praise first, then criticism');
await type(opts.nth(2), 'Wait for the annual review');
await click(host.locator('#f-option-list .opt-correct').nth(0), { pauseAfter: 200 });
await choose(host.locator('#f-duration'), '20');
await click(host.locator('#f-submit'), { pauseAfter: 300 });
await hl('c-p1');
await click(p1.locator('[data-answer="0"]'), { pauseAfter: 200 });
answer(bg['Tom Becker'], 0, 300); answer(bg['Aisha Khan'], 'missed', 700);
await hl('c-p2');
await click(p2.locator('[data-answer="missed"]'), { pauseAfter: 200 });
await hl('c-host');
await cap('Check the point landed', 'Half the room missed it, so recap before you move on.');
await host.locator('#moment-card').scrollIntoViewIfNeeded().catch(() => {});
await sleep(4200);

// 5. Quick game
await step(4);
await cap('Wake the room up', 'A one-minute game everyone plays at once. Scores stay private, nobody is ranked.');
await tool('games');
await click(host.locator('[data-game-kind="colors"]'), { pauseAfter: 200 });
await choose(host.locator('#game-rounds'), '3');
await choose(host.locator('#game-seconds'), '5');
await click(host.locator('#game-start'), { pauseAfter: 200 });
const fMei = await frameOf('#f-p1'), fSam = await frameOf('#f-p2');
const onScreen = (f, delays, miss = []) => playColours(f, { delays, miss, onScreen: true });
const bgGames = [
  playColours(bg['Tom Becker'], { delays: [600, 900, 500] }),
  playColours(bg['Aisha Khan'], { delays: [1100, 700, 1200], miss: [1] }),
];
for (let r = 0; r < 3; r += 1) {
  await hl('c-p1');
  await onScreen(fMei, [150]);
  await hl('c-p2');
  await onScreen(fSam, [50], r === 1 ? [0] : []);
}
await Promise.allSettled(bgGames);
await hl('c-host');
await sleep(2000);

// 6. Who has been quiet (the wait for 3 minutes of inactivity is paused out of the video)
await step(5);
pause();
log('waiting for quiet threshold', Math.round((Date.now() - bgJoined) / 1000), 's since join');
await tool('people');
await host.locator('#quiet-after').selectOption('3');
await sleep(Math.max(0, 188_000 - (Date.now() - bgJoined)));
resume();
await cap('See who has gone quiet, while there is still time', 'Only you see it. Names and minutes since they last took part in Engage.');
await point(host.locator('[data-person]').first());
await sleep(3500);
await cap('Then invite them in, kindly', 'Ask the whole room something quick. Lena answers, and she is back in.');
await tool('ask');
await click(host.locator('#moment-tabs [data-kind="pulse"]'), { pauseAfter: 200 });
await choose(host.locator('#f-library'), { label: 'How is your energy right now?' });
await choose(host.locator('#f-duration'), '20');
await click(host.locator('#f-submit'), { pauseAfter: 300 });
answer(bg['Lena Fischer'], 3, 500); answer(bg['Tom Becker'], 4, 300); answer(bg['Aisha Khan'], 3, 800);
await hl('c-p1');
await click(p1.locator('[data-answer="4"]'), { pauseAfter: 200 });
await hl('c-host');
await tool('people');
await sleep(3200);

// 7. Coach summary
await step(6);
await cap('End the meeting, get a coach summary', 'What happened, where people got lost, and <b>one thing to try next time</b>.');
await click(host.locator('#end'), { pauseAfter: 300 });
await click(host.locator('#confirm-yes'), { pauseAfter: 1500 });
const hf = await frameOf('#f-host');
await hf.evaluate(() => window.scrollBy({ top: 120, behavior: 'smooth' }));
await sleep(5200);
await hl('c-p1');
await cap('End the meeting, get a coach summary', 'Participants get their own recap: results, questions and private notes.');
await sleep(3500);
await hl('');

// Outro
await st(() => card('outro', true));
await sleep(6000);

recording = false;
clearInterval(tick);
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
log('done', emitted, 'frames', (emitted / FPS).toFixed(1), 's');
