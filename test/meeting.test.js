import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActionError, Meeting } from '../server/meeting.js';
import { floorReact } from './helpers.js';

const makeMeeting = () => {
  let now = 1_000_000;
  const meeting = new Meeting({ code: 'TEST42', title: 'Q3 roadmap review', clock: () => now, sampleMs: 30_000 });
  return { meeting, advance: (ms) => { now += ms; }, now: () => now };
};

const join = (meeting, name) => meeting.join({ name: name.length < 2 ? `${name}. Tester` : name });

test('join requires a real name: no empty, one-letter or placeholder names, and no anonymous mode', () => {
  const { meeting } = makeMeeting();
  assert.throws(() => meeting.join({ name: '  ' }), ActionError);
  assert.throws(() => meeting.join({ name: 'A' }), ActionError);
  for (const fake of ['Anonymous', 'anon', 'Guest', 'unknown', 'test']) {
    assert.throws(() => meeting.join({ name: fake }), /real name/, fake);
  }
  assert.throws(() => meeting.join({ anon: true }), ActionError);
  assert.equal(meeting.join({ name: '  Priya   Sharma ' }).name, 'Priya Sharma');
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
  floorReact(meeting, a.id, 'agree');
  assert.equal(meeting.engagement().pct, 50);
  advance(5 * 60_000 + 1);
  assert.equal(meeting.engagement().pct, 0);
});

test('disconnected participants are excluded from engagement', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  const b = join(meeting, 'B');
  floorReact(meeting, a.id, 'agree');
  meeting.setConnected(b.id, false);
  assert.deepEqual(meeting.engagement(), { connected: 1, active: 1, pct: 100 });
});

test('reactions open only with the floor, once per emoji per person, and close with it', () => {
  const { meeting, advance } = makeMeeting();
  const a = join(meeting, 'A');
  const b = join(meeting, 'B');
  assert.throws(() => meeting.react(a.id, 'agree'), /opens the floor/);
  meeting.openTheFloor(60);
  meeting.react(a.id, 'agree');
  meeting.react(a.id, 'agree'); // ignored: one of each emoji
  meeting.react(a.id, 'lost'); // a different emoji is fine
  meeting.react(b.id, 'agree');
  assert.equal(meeting.reactionLog.length, 3);
  assert.deepEqual(meeting.hostSnapshot().floor.counts, { agree: 2, question: 0, lost: 1, fast: 0, move_on: 0 });
  assert.deepEqual(meeting.attendeeSnapshot(a.id).floor.mine, ['agree', 'lost']);
  assert.throws(() => meeting.react(a.id, 'nope'), ActionError);
  advance(61_000);
  meeting.tick();
  assert.equal(meeting.hostSnapshot().floor.open, false);
  assert.equal(meeting.hostSnapshot().floor.last.counts.agree, 2, 'the last floor counts stay visible to the host');
  assert.throws(() => meeting.react(a.id, 'agree'), ActionError);
  meeting.openTheFloor(30);
  meeting.react(a.id, 'agree'); // a new opening allows each emoji again
  assert.equal(meeting.reactionLog.length, 4);
  meeting.closeTheFloor();
  assert.equal(meeting.attendeeSnapshot(a.id).floor.open, false);
});

test('questions: shown with the asker\'s name, upvotes toggle, answered sinks', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'Priya');
  const b = join(meeting, 'Dev');
  meeting.ask(a.id, 'When is the freeze?');
  meeting.ask(b.id, 'Who owns billing?');
  const [first, second] = meeting.questions;
  assert.equal(first.author, 'Priya');
  assert.equal(second.author, 'Dev');
  meeting.upvote(a.id, second.id);
  meeting.upvote(b.id, second.id);
  assert.equal(meeting.hostSnapshot().questions[0].id, second.id);
  meeting.upvote(b.id, second.id);
  assert.equal(meeting.questions[1].votes.size, 1);
  meeting.setQuestionAnswered(second.id);
  assert.equal(meeting.hostSnapshot().questions.at(-1).id, second.id);
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

test('focus moment pauses responses and stops a game', () => {
  const { meeting } = makeMeeting();
  const a = join(meeting, 'A');
  meeting.launchMoment({ type: 'pulse', prompt: 'Check' });
  meeting.setFocus(true);
  assert.throws(() => meeting.respond(a.id, meeting.moment.id, 3), ActionError);
  meeting.setFocus(false);
  meeting.dismissMoment();
  meeting.startGame({ kind: 'maths', rounds: 3 });
  meeting.setFocus(true);
  assert.equal(meeting.game.status, 'done');
  meeting.stopGame();
  assert.throws(() => meeting.startGame({ kind: 'maths' }), /Focus/);
});

test('quick game: rounds, scoring for right and fast answers, reveal, then done', () => {
  const { meeting, advance } = makeMeeting();
  const a = join(meeting, 'A');
  const b = join(meeting, 'B');
  meeting.startGame({ kind: 'colors', rounds: 2, roundSec: 10 });
  const g = meeting.game;
  assert.equal(g.roundNo, 1);
  const view = meeting.attendeeSnapshot(a.id).game;
  assert.equal(view.question.correct, null, 'the answer is hidden while the round is open');
  assert.equal(view.question.options.length, 4);
  const right = g.question.correct;
  const wrong = (right + 1) % 4;
  advance(2_000);
  meeting.answerGame(a.id, g.roundId, right);
  meeting.answerGame(a.id, g.roundId, wrong); // only the first answer counts
  meeting.answerGame(b.id, g.roundId, wrong);
  assert.equal(a.points, 100 + 40, '100 for right plus a speed bonus for 8 of 10 seconds left');
  assert.equal(b.points, 0);
  meeting.tick(); // everyone answered: reveal straight away
  assert.equal(g.status, 'reveal');
  assert.equal(meeting.attendeeSnapshot(b.id).game.question.correct, right);
  assert.equal(meeting.attendeeSnapshot(b.id).game.mine.correct, false);
  assert.throws(() => meeting.answerGame(a.id, g.roundId, right), /round is over/);
  advance(3_100);
  meeting.tick();
  assert.equal(g.roundNo, 2);
  assert.equal(g.status, 'playing');
  advance(10_001);
  meeting.tick(); // time up with no answers
  advance(3_100);
  meeting.tick();
  assert.equal(g.status, 'done');
  assert.deepEqual(meeting.attendeeSnapshot(a.id).game.score, { points: 140, correct: 1, answered: 1 });
  assert.equal(meeting.hostSnapshot().game.accuracy, 50);
  assert.equal(meeting.gameLog.length, 1);
  assert.equal(meeting.gameLog[0].players, 2);
});

test('quick game: cannot run alongside a prompt, and every game type makes a fair round', async () => {
  const { meeting } = makeMeeting();
  join(meeting, 'A');
  meeting.launchMoment({ type: 'pulse', prompt: 'Check' });
  assert.throws(() => meeting.startGame({ kind: 'maths' }), /Close the current prompt/);
  meeting.closeMoment();
  meeting.startGame({ kind: 'maths' });
  assert.throws(() => meeting.launchMoment({ type: 'pulse', prompt: 'x' }), /stop the game/);
  assert.throws(() => meeting.startGame({ kind: 'maths' }), /already running/);
  meeting.stopGame();
  meeting.stopGame();
  assert.equal(meeting.game, null);
  assert.throws(() => meeting.startGame({ kind: 'chess' }), /Unknown game/);

  const { makeRound, GAME_KINDS } = await import('../server/games.js');
  for (const kind of GAME_KINDS) {
    for (let i = 0; i < 200; i++) {
      const r = makeRound(kind);
      assert.equal(r.options.length, 4, kind);
      assert.equal(new Set(r.options.map((o) => o.label)).size, 4, `${kind}: options are distinct`);
      assert.ok(r.correct >= 0 && r.correct < 4, kind);
      const labels = r.options.map((o) => Number(o.label));
      const pick = labels[r.correct];
      if (r.kind === 'evenodd') {
        const wantEven = /even/.test(r.prompt);
        assert.equal(labels.filter((n) => (n % 2 === 0) === wantEven).length, 1, 'exactly one right answer');
        assert.equal(pick % 2 === 0, wantEven);
      }
      if (r.kind === 'biggest') assert.equal(pick, /biggest/.test(r.prompt) ? Math.max(...labels) : Math.min(...labels));
      if (r.kind === 'maths') {
        const [, x, op, y] = r.prompt.match(/(\d+) (.) (\d+)/);
        const value = op === '+' ? +x + +y : op === '×' ? x * y : x - y;
        assert.equal(pick, value);
      }
      if (r.kind === 'colors') assert.equal(r.options[r.correct].label.toUpperCase(), r.prompt.replace('Tap ', ''));
    }
  }
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
  for (const p of people) floorReact(meeting, p.id, 'agree');
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
  floorReact(meeting, people[0].id, 'lost');
  floorReact(meeting, people[1].id, 'fast');
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
  meeting.startGame({ kind: 'maths', rounds: 1 });
  meeting.answerGame(a.id, meeting.game.roundId, meeting.game.question.correct);
  const view = meeting.attendeeSnapshot(b.id);
  assert.equal(view.me.points, 0);
  assert.equal(view.game.mine, null);
  assert.deepEqual(view.game.score, { points: 0, correct: 0, answered: 0 });
  assert.ok(!JSON.stringify(view).includes(a.id));
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
  for (const p of people) floorReact(meeting, p.id, 'agree');
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
  for (const p of people) floorReact(meeting, p.id, 'agree');
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
  for (const p of people) floorReact(meeting, p.id, 'agree');
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
  for (const p of people) floorReact(meeting, p.id, 'agree');
  meeting.tick();
  meeting.end();
  const coach = meeting.hostSnapshot().summary.coach;
  assert.deepEqual(coach.insights.map((i) => i.id), []);
  assert.match(coach.next, /Keep this format/);
});
