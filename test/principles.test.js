// Guards for the three things that make Engage different. If one of these fails, a change
// has crossed a product line (see docs/PRD.md, "What to protect"). Change the line on purpose
// or change the code, but do not just edit the test.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join as join_ } from 'node:path';
import { test } from 'node:test';
import { Meeting } from '../server/meeting.js';
import { meetingCsv } from '../server/export.js';
import { MemoryStore } from '../server/store.js';

const root = new URL('..', import.meta.url).pathname;
const files = (dir, ext) =>
  readdirSync(join_(root, dir)).filter((f) => f.endsWith(ext)).map((f) => [`${dir}/${f}`, readFileSync(join_(root, dir, f), 'utf8')]);
const clientCode = [...files('public/js', '.js'), ...files('public', '.html')];

const setup = () => {
  let now = 2_000_000;
  const meeting = new Meeting({ code: 'PRIN42', title: 'Principles', agenda: 'Intro, 10', clock: () => now });
  const named = meeting.join({ name: 'Priya Sharma' });
  const quiet = meeting.join({ name: 'Dev Patel' });
  return { meeting, named, quiet, advance: (ms) => { now += ms; } };
};

// ---- Calm --------------------------------------------------------------------

test('calm: no sound, notifications or vibration anywhere in the client', () => {
  const banned = /\bnew Audio\b|AudioContext|\bNotification\b|requestPermission|navigator\.vibrate|<audio|\.(mp3|wav|ogg)\b/;
  for (const [name, text] of clientCode) assert.ok(!banned.test(text), `${name} must not make sound, notify or vibrate`);
});

test('calm: the mini window starts as a pill and only an open recall check may expand it', () => {
  const mini = readFileSync(join_(root, 'public/js/mini.js'), 'utf8');
  assert.match(mini, /let mode = 'pill'/);
  const expands = [...mini.matchAll(/setMode\('card', true\)/g)];
  assert.equal(expands.length, 1, 'only one automatic expansion is allowed');
  assert.match(mini, /m\.type === 'recall' && m\.status === 'open'[\s\S]{0,120}setMode\('card', true\)/);
});

test('calm: the recall check keeps its cap and its "Missed that" answer', () => {
  const { meeting } = setup();
  meeting.launchMoment({ type: 'recall', prompt: 'x?', options: ['a', 'b'], correct: 0 });
  const id = meeting.moment.id;
  meeting.respond([...meeting.participants.keys()][0], id, 'missed');
  meeting.closeMoment();
  assert.equal(meeting.momentHistory[0].results.missed, 1);
  assert.throws(() => meeting.launchMoment({ type: 'recall', prompt: 'y?', options: ['a', 'b'], correct: 0 }), /recall check is available/);
});

test('calm: focus mode pauses prompts and the end-of-topic nudge', () => {
  const { meeting, named } = setup();
  meeting.setFocus(true);
  assert.throws(() => meeting.respond(named.id, 'x', 1), /Focus moment/);
  assert.equal(meeting.topicNudge(), null);
});

// ---- Privacy -----------------------------------------------------------------

test('privacy: no ranking or leaderboard, and attendees never see anyone else\'s points', () => {
  for (const [name, text] of [...clientCode, ...files('server', '.js')]) {
    assert.ok(!/leaderboard|\branking\b|\brank\b/i.test(text), `${name} must not rank people`);
  }
  const { meeting, named, quiet } = setup();
  meeting.react(named.id, 'agree');
  const view = JSON.stringify(meeting.attendeeSnapshot(quiet.id));
  assert.ok(!view.includes('Priya'), 'another attendee\'s name must not appear');
  assert.ok(!view.includes(named.id), 'another attendee\'s id must not appear');
});

test('privacy: a store never holds a plaintext token', () => {
  const { meeting, named } = setup();
  meeting.ask(named.id, 'Is this the end of my role?');
  const store = new MemoryStore();
  store.saveMeeting(meeting.code, null, meeting.serialize());
  const stored = JSON.stringify([...store.meetings.values()]);
  assert.ok(!stored.includes(meeting.hostToken));
  assert.ok(!stored.includes(named.token));
});

test('transparency: people join with real names and are told exactly what the host can see', () => {
  const join = readFileSync(join_(root, 'public/join.html'), 'utf8');
  const privacy = readFileSync(join_(root, 'public/privacy.html'), 'utf8');
  assert.ok(!/id="anon"|ask-anon/.test(join), 'there is no anonymous option');
  assert.match(join, /real name/i);
  assert.match(join, /when you last took part/i);
  assert.match(join, /What the host cannot see/);
  assert.match(privacy, /how long you have gone without any activity/i);
  const { meeting } = setup();
  assert.throws(() => meeting.join({ name: 'Anonymous' }), /real name/);
});

test('privacy: the host sees who answered a prompt, never what they chose (including "Missed that")', () => {
  const { meeting, named } = setup();
  meeting.launchMoment({ type: 'recall', prompt: 'What changed?', options: ['A', 'B'], correct: 0 });
  meeting.respond(named.id, meeting.moment.id, 'missed');
  meeting.closeMoment();
  const detail = JSON.stringify(meeting.personDetail(named.id));
  assert.ok(!/missed|wrong|correct/i.test(detail));
  assert.ok(!JSON.stringify(meeting.hostSnapshot().people).match(/missed|wrong|correct/i));
});

test('privacy: the CSV export never holds names', () => {
  const { meeting, named } = setup();
  meeting.ask(named.id, 'Who owns billing?');
  meeting.end();
  assert.ok(!meetingCsv(meeting).includes('Priya'));
});

test('privacy: coaching, engagement-over-time and the recap\'s coach stay host-only', () => {
  const { meeting, quiet } = setup();
  meeting.end();
  const attendee = meeting.attendeeSnapshot(quiet.id);
  assert.ok(attendee.recap);
  const text = JSON.stringify(attendee);
  assert.ok(!('coach' in attendee.recap) && !text.includes('"coach"'));
  assert.ok(!text.includes('"series"') && !text.includes('"suggestions"'));
  assert.ok(meeting.hostSnapshot().summary.coach);
});

// ---- Engagement over time with advice ---------------------------------------------------

test('heart of the product: samples, dips, suggestions and the coach summary still work', () => {
  let now = 3_000_000;
  const meeting = new Meeting({ code: 'HEART1', title: 'Heart', agenda: 'Intro, 5\nDeep dive, 20', clock: () => now, sampleMs: 30_000 });
  const people = Array.from({ length: 6 }, (_, i) => meeting.join({ name: `P${i}` }));
  for (let step = 0; step < 14; step++) {
    if (step < 6) for (const p of people) meeting.react(p.id, 'agree');
    now += 60_000;
    meeting.tick(now);
    meeting.tick(now + 30_000);
  }
  now += 6 * 60_000;
  meeting.tick(now);
  assert.ok(meeting.series.length >= 5, 'engagement is sampled over time');
  assert.ok(meeting.dips().length >= 1, 'a dip is detected');
  assert.ok(meeting.suggestions(now).some((s) => s.id === 'dip' && s.actions.includes('recall')), 'a dip suggestion is offered');
  meeting.end();
  const coach = meeting.hostSnapshot().summary.coach;
  assert.ok(coach.insights.some((i) => i.id === 'dip') && coach.next.length > 10, 'the coach summary gives advice');
});
