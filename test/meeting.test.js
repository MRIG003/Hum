import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActionError, Meeting } from '../server/meeting.js';

const makeMeeting = () => {
  let now = 1_000_000;
  const meeting = new Meeting({ code: 'TEST42', title: 'Q3 roadmap review', clock: () => now, sampleMs: 30_000 });
  return { meeting, advance: (ms) => { now += ms; }, now: () => now };
};

const join = (meeting, name) => meeting.join({ name });

test('join requires a name unless anonymous', () => {
  const { meeting } = makeMeeting();
  assert.throws(() => meeting.join({ name: '  ' }), ActionError);
  assert.equal(meeting.join({ anon: true }).name, 'Anonymous');
});

test('rejoin with the same token keeps the participant', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'Priya');
  const again = meeting.join({ pid: a.id, token: a.token });
  assert.equal(again.id, a.id);
  const other = meeting.join({ pid: a.id, token: 'wrong', name: 'Intruder' });
  assert.notEqual(other.id, a.id);
});

test('engagement counts connected participants with an action in the last 5 minutes', () => {
  const { meeting, advance } = makeMeeting();
  const a = join(meeting, 'A');
  join(meeting, 'B');
  assert.equal(meeting.engagement().pct, 0);
  meeting.react(a.id, 'agree');
  assert.equal(meeting.engagement().pct, 50);
  advance(5 * 60_000 + 1);
  assert.equal(meeting.engagement().pct, 0);
});

test('disconnected participants are excluded from engagement', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  const b = join(meeting, 'B');
  meeting.react(a.id, 'agree');
  meeting.setConnected(b.id, false);
  assert.deepEqual(meeting.engagement(), { connected: 1, active: 1, pct: 100 });
});

test('reactions are rate limited per kind', () => {
  const { meeting, advance } = makeMeeting();
  const a = join(meeting, 'A');
  meeting.react(a.id, 'lost');
  meeting.react(a.id, 'lost');
  assert.equal(meeting.reactionLog.length, 1);
  advance(3001);
  meeting.react(a.id, 'lost');
  assert.equal(meeting.reactionLog.length, 2);
  assert.throws(() => meeting.react(a.id, 'nope'), ActionError);
});

test('questions: anonymous author hidden, upvotes toggle, answered sinks', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'Priya');
  const b = join(meeting, 'Dev');
  meeting.ask(a.id, 'When is the freeze?', true);
  meeting.ask(b.id, 'Who owns billing?');
  const [first, second] = meeting.questions;
  assert.equal(first.author, 'Anonymous');
  assert.equal(second.author, 'Dev');
  meeting.upvote(a.id, second.id);
  meeting.upvote(b.id, second.id);
  assert.equal(meeting.hostSnapshot().questions[0].id, second.id);
  meeting.upvote(b.id, second.id);
  assert.equal(meeting.questions[1].votes.size, 1);
  meeting.setQuestionAnswered(second.id);
  assert.equal(meeting.hostSnapshot().questions.at(-1).id, second.id);
});

test('anonymous question author is never exposed in host or attendee snapshots', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'Priya');
  const b = join(meeting, 'Dev');
  meeting.ask(a.id, 'Secret?', true);
  const host = JSON.stringify(meeting.hostSnapshot());
  const other = JSON.stringify(meeting.attendeeSnapshot(b.id));
  assert.ok(!host.includes('Priya'));
  assert.ok(!other.includes('Priya'));
  assert.ok(!host.includes(a.id));
  assert.ok(!other.includes(a.id));
});

test('poll: one answer each, results hidden from attendees until closed', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  meeting.launchMoment({ type: 'poll', prompt: 'Ship Friday?', options: ['Yes', 'No'] });
  const id = meeting.moment.id;
  meeting.respond(a.id, id, 0);
  assert.throws(() => meeting.respond(a.id, id, 1), ActionError);
  assert.equal(meeting.attendeeSnapshot(a.id).moment.results, undefined);
  assert.equal(meeting.hostSnapshot().moment.results.counts[0], 1);
  meeting.closeMoment();
  assert.deepEqual(meeting.attendeeSnapshot(a.id).moment.results.counts, [1, 0]);
  assert.throws(() => meeting.respond(a.id, id, 0), ActionError);
});

test('quiz awards points to correct answers on close and reveals the answer after', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  const b = join(meeting, 'B');
  meeting.launchMoment({ type: 'quiz', prompt: 'Which option?', options: ['X', 'Y'], correct: 1 });
  const id = meeting.moment.id;
  assert.equal(meeting.attendeeSnapshot(a.id).moment.correct, undefined);
  meeting.respond(a.id, id, 1);
  meeting.respond(b.id, id, 0);
  meeting.closeMoment();
  assert.equal(a.points, 30);
  assert.equal(b.points, 0);
  assert.equal(meeting.attendeeSnapshot(a.id).moment.correct, 1);
});

test('pulse aggregates the average and word cloud tallies words', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  const b = join(meeting, 'B');
  meeting.launchMoment({ type: 'pulse', prompt: 'How is it going?' });
  meeting.respond(a.id, meeting.moment.id, 4);
  meeting.respond(b.id, meeting.moment.id, 2);
  assert.equal(meeting.hostSnapshot().moment.results.average, 3);
  meeting.launchMoment({ type: 'wordcloud', prompt: 'One word' });
  meeting.respond(a.id, meeting.moment.id, 'Clarity');
  meeting.respond(b.id, meeting.moment.id, ' clarity ');
  assert.deepEqual(meeting.hostSnapshot().moment.results.words, [{ word: 'clarity', n: 2 }]);
});

test('moments auto close after their duration', () => {
  const { meeting, advance } = makeMeeting();
  join(meeting, 'A');
  meeting.launchMoment({ type: 'pulse', prompt: 'Quick check', durationSec: 30 });
  advance(29_000);
  meeting.tick();
  assert.equal(meeting.moment.status, 'open');
  advance(2_000);
  meeting.tick();
  assert.equal(meeting.moment.status, 'closed');
});

test('focus moment pauses responses, bingo and predictions', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  meeting.setGames(true);
  meeting.launchMoment({ type: 'pulse', prompt: 'Check' });
  meeting.setFocus(true);
  assert.throws(() => meeting.respond(a.id, meeting.moment.id, 3), ActionError);
  assert.throws(() => meeting.markBingo(a.id, a.card[0]), ActionError);
  assert.throws(() => meeting.predict(a.id, 'yes'), ActionError);
  meeting.setFocus(false);
  meeting.markBingo(a.id, a.card[0]);
  assert.equal(a.points, 10);
});

test('games only work while open', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  assert.throws(() => meeting.markBingo(a.id, a.card[0]), ActionError);
  assert.throws(() => meeting.predict(a.id, 'no'), ActionError);
});

test('bingo: a completed line pays a bonus once', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  meeting.setGames(true);
  for (const index of [0, 1, 2]) meeting.markBingo(a.id, a.card[index]);
  assert.equal(a.points, 3 * 10 + 50);
  meeting.markBingo(a.id, a.card[2]);
  meeting.markBingo(a.id, a.card[2]);
  assert.equal(a.points, 3 * 10 + 50);
  assert.throws(() => meeting.markBingo(a.id, 'not on card'), ActionError);
});

test('prediction pays correct guesses when resolved', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  const b = join(meeting, 'B');
  meeting.setGames(true);
  meeting.predict(a.id, 'yes');
  meeting.predict(b.id, 'no');
  meeting.resolvePrediction('yes');
  assert.equal(a.points, 5 + 25);
  assert.equal(b.points, 5);
  assert.throws(() => meeting.predict(a.id, 'no'), ActionError);
});

test('game windows open and close games on schedule', () => {
  const { meeting, advance } = makeMeeting();
  join(meeting, 'A');
  meeting.addGameWindow({ startMin: 38, durationMin: 5, label: 'Break block' });
  meeting.tick();
  assert.equal(meeting.gamesOpen, false);
  advance(38 * 60_000);
  meeting.tick();
  assert.equal(meeting.gamesOpen, true);
  advance(5 * 60_000);
  meeting.tick();
  assert.equal(meeting.gamesOpen, false);
});

test('quiet mode launches an automatic pulse check', () => {
  const { meeting, advance } = makeMeeting();
  join(meeting, 'A');
  meeting.setQuiet(true, 5);
  advance(5 * 60_000 + 1);
  meeting.tick();
  assert.equal(meeting.moment.type, 'pulse');
  assert.equal(meeting.moment.auto, true);
  advance(46_000);
  meeting.tick();
  assert.equal(meeting.moment.status, 'closed');
});

test('a participation dip produces a host suggestion and a chart band', () => {
  const { meeting, advance } = makeMeeting();
  const people = Array.from({ length: 5 }, (_, i) => join(meeting, `P${i}`));
  for (const p of people) meeting.react(p.id, 'agree');
  for (let i = 0; i < 4; i++) {
    meeting.tick();
    advance(31_000);
  }
  advance(5 * 60_000);
  meeting.tick();
  assert.ok(meeting.series.at(-1).pct < 20);
  const ids = meeting.suggestions().map((s) => s.id);
  assert.ok(ids.includes('dip'));
  assert.ok(meeting.dips().length >= 1);
  meeting.launchMoment({ type: 'pulse', prompt: 'How is it going?' });
  assert.deepEqual(meeting.suggestions(), []);
});

test('lost-me spike produces a confusion suggestion', () => {
  const { meeting } = makeMeeting();
  const people = Array.from({ length: 4 }, (_, i) => join(meeting, `P${i}`));
  meeting.react(people[0].id, 'lost');
  meeting.react(people[1].id, 'fast');
  assert.ok(meeting.suggestions().some((s) => s.id === 'confused'));
});

test('ending the meeting produces a summary and blocks further actions', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  join(meeting, 'B');
  meeting.ask(a.id, 'Anything left?');
  meeting.end();
  const summary = meeting.hostSnapshot().summary;
  assert.equal(summary.joined, 2);
  assert.equal(summary.participated, 1);
  assert.equal(summary.participationRate, 50);
  assert.equal(summary.unanswered, 1);
  assert.throws(() => meeting.react(a.id, 'agree'), ActionError);
  assert.ok(meeting.attendeeSnapshot(a.id).recap);
});

test('attendee snapshots never include other people\'s points or choices', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  const b = join(meeting, 'B');
  meeting.setGames(true);
  meeting.predict(a.id, 'yes');
  meeting.markBingo(a.id, a.card[0]);
  const view = meeting.attendeeSnapshot(b.id);
  assert.equal(view.me.points, 0);
  assert.equal(view.prediction.mine, null);
  assert.deepEqual(view.card.marks, []);
});

// ---- recall check, agenda, coach -------------------------------------------

const launchRecall = (meeting, extra = {}) =>
  meeting.launchMoment({
    type: 'recall',
    prompt: 'Which option did we choose?',
    options: ['Cut scope', 'Move the date', 'Add budget'],
    correct: 1,
    ...extra,
  });

test('recall check: missed is counted separately and correct answers earn points', () => {
  const { meeting } = makeMeeting();
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((n) => join(meeting, n));
  launchRecall(meeting);
  const id = meeting.moment.id;
  meeting.respond(a.id, id, 1);
  meeting.respond(b.id, id, 0);
  meeting.respond(c.id, id, 'missed');
  assert.throws(() => meeting.respond(c.id, id, 1), ActionError);
  assert.equal(meeting.hostSnapshot().moment.results.missed, 1);
  meeting.closeMoment();
  assert.deepEqual(meeting.hostSnapshot().moment.results, { total: 3, counts: [1, 1, 0], missed: 1 });
  assert.equal(a.points, 30);
  assert.equal(c.points, 0);
  assert.equal(meeting.attendeeSnapshot(d.id).moment.correct, 1);
});

test('recall check: hidden from attendees until closed, defaults to 20 seconds', () => {
  const { meeting, advance } = makeMeeting();
  const a = join(meeting, 'A');
  launchRecall(meeting);
  assert.equal(meeting.moment.closesAt - meeting.moment.openedAt, 20_000);
  assert.equal(meeting.attendeeSnapshot(a.id).moment.correct, undefined);
  advance(21_000);
  meeting.tick();
  assert.equal(meeting.moment.status, 'closed');
  assert.equal(meeting.attendeeSnapshot(a.id).moment.correct, 1);
});

test('recall check: capped at one per 15 minutes unless overridden', () => {
  const { meeting, advance } = makeMeeting();
  join(meeting, 'A');
  launchRecall(meeting);
  meeting.closeMoment();
  assert.throws(() => launchRecall(meeting), /available in/);
  assert.ok(meeting.hostSnapshot().recallNextAt > 0);
  launchRecall(meeting, { override: true });
  meeting.closeMoment();
  advance(15 * 60_000 + 1);
  launchRecall(meeting);
  assert.equal(meeting.moment.type, 'recall');
});

test('recall check needs a correct answer and options', () => {
  const { meeting } = makeMeeting();
  assert.throws(() => launchRecall(meeting, { correct: null }), ActionError);
  assert.throws(() => launchRecall(meeting, { options: ['Only one'] }), ActionError);
});

test('agenda: parses lines into timed segments and ignores junk', () => {
  const { meeting } = makeMeeting();
  meeting.setAgenda('Intro, 8\nRoadmap - 16 min\nBudget 16\n\nRisks, 15');
  assert.deepEqual(meeting.agendaSegments.map((s) => [s.title, s.startMin, s.endMin]), [
    ['Intro', 0, 8], ['Roadmap', 8, 24], ['Budget', 24, 40], ['Risks', 40, 55],
  ]);
  meeting.setAgenda('No minutes here');
  assert.equal(meeting.agendaSegments[0].minutes, 10);
  meeting.setAgenda('');
  assert.equal(meeting.agendaSegments.length, 0);
});

test('agenda: per-segment engagement stats and attendee view of the current segment', () => {
  const { meeting, advance } = makeMeeting();
  const people = Array.from({ length: 4 }, (_, i) => join(meeting, `P${i}`));
  meeting.setAgenda('Intro, 5\nBudget, 10');
  for (const p of people) meeting.react(p.id, 'agree');
  meeting.tick();
  advance(6 * 60_000);
  meeting.tick();
  const [intro, budget] = meeting.hostSnapshot().agenda.segments;
  assert.equal(intro.avg, 100);
  assert.equal(budget.avg, 0);
  assert.equal(meeting.attendeeSnapshot(people[0].id).agenda.current, 'Budget');
});

test('dip suggestion names the agenda segment and offers a recall check', () => {
  const { meeting, advance } = makeMeeting();
  const people = Array.from({ length: 5 }, (_, i) => join(meeting, `P${i}`));
  meeting.setAgenda('Intro, 3\nBudget, 30');
  for (const p of people) meeting.react(p.id, 'agree');
  for (let i = 0; i < 4; i++) { meeting.tick(); advance(31_000); }
  advance(5 * 60_000);
  meeting.tick();
  const dip = meeting.suggestions().find((s) => s.id === 'dip');
  assert.match(dip.text, /during Budget/);
  assert.ok(dip.actions.includes('recall'));
});

test('coach summary: dip, recovery, recall result, open questions, next step', () => {
  const { meeting, advance } = makeMeeting();
  const people = Array.from({ length: 8 }, (_, i) => join(meeting, `P${i}`));
  meeting.setAgenda('Intro, 4\nBudget, 40');
  for (const p of people) meeting.react(p.id, 'agree');
  for (let i = 0; i < 4; i++) { meeting.tick(); advance(31_000); }
  advance(6 * 60_000);
  meeting.tick();
  launchRecall(meeting);
  const id = meeting.moment.id;
  people.slice(0, 4).forEach((p, i) => meeting.respond(p.id, id, i < 2 ? 1 : 'missed'));
  advance(21_000);
  meeting.tick();
  advance(31_000);
  meeting.tick();
  meeting.ask(people[0].id, 'Who owns billing?');
  meeting.end();
  const coach = meeting.hostSnapshot().summary.coach;
  const ids = coach.insights.map((i) => i.id);
  assert.ok(ids.includes('dip'));
  assert.ok(ids.includes('recall'));
  assert.ok(ids.includes('questions'));
  assert.match(coach.insights.find((i) => i.id === 'dip').title, /Budget/);
  assert.match(coach.insights.find((i) => i.id === 'recall').detail, /Missed that/);
  assert.match(coach.next, /Budget/);
  assert.equal(meeting.attendeeSnapshot(people[0].id).recap.coach, undefined);
});

test('coach summary is calm for a healthy meeting', () => {
  const { meeting } = makeMeeting();
  const people = Array.from({ length: 6 }, (_, i) => join(meeting, `P${i}`));
  for (const p of people) meeting.react(p.id, 'agree');
  meeting.tick();
  meeting.end();
  const coach = meeting.hostSnapshot().summary.coach;
  assert.deepEqual(coach.insights.map((i) => i.id), []);
  assert.match(coach.next, /Keep this format/);
});
