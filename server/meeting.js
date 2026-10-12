import { randomBytes, randomInt } from 'node:crypto';

export const REACTIONS = ['agree', 'question', 'lost', 'fast', 'move_on'];

export const DEFAULT_BINGO_WORDS = [
  'synergy', 'bandwidth', 'KPI', 'deep dive', 'circle back', 'take offline',
  'alignment', 'ping me', 'roadmap', 'stakeholders', 'low-hanging fruit', 'action item',
  'next steps', 'leverage', 'north star', 'quick win', 'blocker', 'ETA',
  'touch base', 'double click', 'at the end of the day', 'move the needle',
  'on the same page', 'offline',
];

const ENGAGEMENT_WINDOW_MS = 5 * 60_000;
const REACTION_WINDOW_MS = 2 * 60_000;
const REACTION_COOLDOWN_MS = 3_000;
const MAX_PARTICIPANTS = 500;
const MAX_QUESTIONS = 200;
const MAX_SERIES = 720;
const NUDGE_MS = 30_000;
const SUGGESTION_COOLDOWN_MS = 5 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const POINTS = {
  reaction: 0,
  question: 20,
  upvote: 2,
  pulse: 5,
  poll: 10,
  wordcloud: 10,
  quizCorrect: 30,
  bingoMark: 10,
  bingoLine: 50,
  prediction: 5,
  predictionCorrect: 25,
};

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export class ActionError extends Error {}

const clean = (value, max) =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const shuffle = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const newId = (bytes = 6) => randomBytes(bytes).toString('hex');

export const newCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export class Meeting {
  constructor({
    code,
    title,
    expected = 0,
    agenda = '',
    clock = Date.now,
    sampleMs = Number(process.env.ENGAGE_SAMPLE_MS) || 30_000,
  } = {}) {
    this.clock = clock;
    this.sampleMs = sampleMs;
    this.code = code ?? newCode();
    this.hostToken = newId(16);
    this.title = clean(title, 80) || 'Untitled meeting';
    this.agenda = clean(agenda, 200);
    this.expected = Math.max(0, Math.min(1000, Number.parseInt(expected, 10) || 0));
    this.createdAt = this.clock();
    this.startedAt = this.createdAt;
    this.status = 'live';
    this.endedAt = null;

    this.participants = new Map();
    this.actions = [];
    this.reactionLog = [];
    this.questions = [];
    this.series = [];
    this.events = [];
    this.lastSampleAt = 0;

    this.moment = null;
    this.momentHistory = [];
    this.focus = false;

    this.gamesOpen = false;
    this.gameWindows = [];
    this.bingoWords = [...DEFAULT_BINGO_WORDS];
    this.prediction = this.#freshPrediction('Will this meeting run over?');

    this.quiet = { on: false, everyMin: 20 };
    this.lastPulseAt = this.startedAt;
    this.nudge = null;
    this.suggestionsSuppressedUntil = 0;
  }

  // ---- participants -------------------------------------------------------

  join({ name, anon, pid, token }) {
    const now = this.clock();
    if (this.status !== 'live') throw new ActionError('This meeting has ended.');

    const existing = pid ? this.participants.get(pid) : null;
    if (existing && existing.token === token) {
      existing.connected = true;
      return existing;
    }
    if (this.participants.size >= MAX_PARTICIPANTS) throw new ActionError('This meeting is full.');

    const isAnon = Boolean(anon);
    const displayName = isAnon ? 'Anonymous' : clean(name, 30);
    if (!displayName) throw new ActionError('Enter a name or choose Anonymous.');

    const participant = {
      id: newId(),
      token: newId(16),
      name: displayName,
      anon: isAnon,
      joinedAt: now,
      connected: true,
      lastActionAt: 0,
      points: 0,
      counts: { reactions: 0, questions: 0, votes: 0, answers: 0, bingo: 0, predictions: 0 },
      card: shuffle(this.bingoWords).slice(0, 9),
      marks: new Set(),
      paidMarks: new Set(),
      lines: new Set(),
      lastReactionAt: {},
    };
    this.participants.set(participant.id, participant);
    return participant;
  }

  setConnected(pid, connected) {
    const p = this.participants.get(pid);
    if (p) p.connected = connected;
  }

  removeParticipant(pid) {
    this.participants.delete(pid);
  }

  #participant(pid) {
    const p = this.participants.get(pid);
    if (!p) throw new ActionError('Unknown participant.');
    return p;
  }

  #touch(p, type, points = 0, countKey = null) {
    const now = this.clock();
    p.lastActionAt = now;
    p.points += points;
    if (countKey) p.counts[countKey] += 1;
    this.actions.push({ pid: p.id, type, t: now });
  }

  #requireLive() {
    if (this.status !== 'live') throw new ActionError('This meeting has ended.');
  }

  #requireOpenFloor() {
    this.#requireLive();
    if (this.focus) throw new ActionError('Focus moment: prompts and games are paused.');
  }

  #requireGames() {
    this.#requireOpenFloor();
    if (!this.gamesOpen) throw new ActionError('Games are not open right now.');
  }

  // ---- attendee actions ---------------------------------------------------

  react(pid, kind) {
    this.#requireLive();
    if (!REACTIONS.includes(kind)) throw new ActionError('Unknown reaction.');
    const p = this.#participant(pid);
    const now = this.clock();
    if (now - (p.lastReactionAt[kind] ?? 0) < REACTION_COOLDOWN_MS) return;
    p.lastReactionAt[kind] = now;
    this.reactionLog.push({ pid, kind, t: now });
    this.#touch(p, 'reaction', POINTS.reaction, 'reactions');
  }

  ask(pid, text, anon = false) {
    this.#requireLive();
    const p = this.#participant(pid);
    const body = clean(text, 280);
    if (!body) throw new ActionError('Type a question first.');
    if (this.questions.length >= MAX_QUESTIONS) throw new ActionError('Question limit reached.');
    const hidden = Boolean(anon) || p.anon;
    this.questions.push({
      id: newId(4),
      text: body,
      authorPid: pid,
      author: hidden ? 'Anonymous' : p.name,
      votes: new Set(),
      answered: false,
      t: this.clock(),
    });
    this.#touch(p, 'question', POINTS.question, 'questions');
  }

  upvote(pid, questionId) {
    this.#requireLive();
    const p = this.#participant(pid);
    const q = this.questions.find((item) => item.id === questionId);
    if (!q) throw new ActionError('Question not found.');
    if (q.votes.has(pid)) {
      q.votes.delete(pid);
      return;
    }
    q.votes.add(pid);
    this.#touch(p, 'upvote', POINTS.upvote, 'votes');
  }

  respond(pid, momentId, value) {
    this.#requireOpenFloor();
    const p = this.#participant(pid);
    const mo = this.moment;
    if (!mo || mo.id !== momentId || mo.status !== 'open') {
      throw new ActionError('That prompt is closed.');
    }

    if (mo.type === 'wordcloud') {
      const word = clean(value, 24).toLowerCase();
      if (!word) throw new ActionError('Type a word or short phrase.');
      const words = mo.responses.get(pid) ?? [];
      if (words.length >= 3) throw new ActionError('Up to 3 answers each.');
      mo.responses.set(pid, [...words, word]);
      this.#touch(p, 'wordcloud', words.length === 0 ? POINTS.wordcloud : 0, 'answers');
      return;
    }

    if (mo.responses.has(pid)) throw new ActionError('You already answered.');
    const n = Number.parseInt(value, 10);
    if (mo.type === 'pulse') {
      if (!(n >= 1 && n <= 5)) throw new ActionError('Pick 1 to 5.');
    } else if (!(n >= 0 && n < mo.options.length)) {
      throw new ActionError('Pick one of the options.');
    }
    mo.responses.set(pid, n);
    this.#touch(p, mo.type, mo.type === 'pulse' ? POINTS.pulse : mo.type === 'poll' ? POINTS.poll : 0, 'answers');
  }

  markBingo(pid, word) {
    this.#requireGames();
    const p = this.#participant(pid);
    const index = p.card.indexOf(word);
    if (index === -1) throw new ActionError('That word is not on your card.');
    if (p.marks.has(index)) {
      p.marks.delete(index);
      return;
    }
    p.marks.add(index);
    let points = 0;
    if (!p.paidMarks.has(index)) {
      p.paidMarks.add(index);
      points += POINTS.bingoMark;
    }
    for (const [lineIndex, line] of LINES.entries()) {
      if (!p.lines.has(lineIndex) && line.every((cell) => p.marks.has(cell))) {
        p.lines.add(lineIndex);
        points += POINTS.bingoLine;
      }
    }
    this.#touch(p, 'bingo', points, 'bingo');
  }

  predict(pid, choice) {
    this.#requireGames();
    const p = this.#participant(pid);
    if (this.prediction.status !== 'open') throw new ActionError('Predictions are closed.');
    if (choice !== 'yes' && choice !== 'no') throw new ActionError('Pick yes or no.');
    const first = !this.prediction.answers.has(pid);
    this.prediction.answers.set(pid, choice);
    this.#touch(p, 'prediction', first ? POINTS.prediction : 0, first ? 'predictions' : null);
  }

  // ---- host actions -------------------------------------------------------

  launchMoment({ type, prompt, options = [], correct = null, durationSec = 0, auto = false }) {
    this.#requireLive();
    if (!['poll', 'pulse', 'quiz', 'wordcloud'].includes(type)) {
      throw new ActionError('Unknown moment type.');
    }
    const text = clean(prompt, 160);
    if (!text) throw new ActionError('Add a question for the room.');

    let cleaned = [];
    if (type === 'poll' || type === 'quiz') {
      cleaned = options.map((option) => clean(option, 80)).filter(Boolean).slice(0, 6);
      if (cleaned.length < 2) throw new ActionError('Add at least two options.');
    }
    let correctIndex = null;
    if (type === 'quiz') {
      correctIndex = Number.parseInt(correct, 10);
      if (!(correctIndex >= 0 && correctIndex < cleaned.length)) {
        throw new ActionError('Mark the correct answer.');
      }
    }

    if (this.moment?.status === 'open') this.closeMoment();
    const now = this.clock();
    const seconds = Math.max(0, Math.min(600, Number.parseInt(durationSec, 10) || 0));
    this.moment = {
      id: newId(4),
      type,
      prompt: text,
      options: cleaned,
      correct: correctIndex,
      status: 'open',
      auto,
      openedAt: now,
      closesAt: seconds ? now + seconds * 1000 : null,
      closedAt: null,
      responses: new Map(),
    };
    if (type === 'pulse') {
      this.lastPulseAt = now;
      this.events.push({ t: now, type: 'pulse' });
    }
    this.suggestionsSuppressedUntil = now + SUGGESTION_COOLDOWN_MS;
  }

  closeMoment() {
    const mo = this.moment;
    if (!mo || mo.status !== 'open') return;
    mo.status = 'closed';
    mo.closedAt = this.clock();
    if (mo.type === 'quiz') {
      for (const [pid, answer] of mo.responses) {
        if (answer === mo.correct) {
          const p = this.participants.get(pid);
          if (p) p.points += POINTS.quizCorrect;
        }
      }
    }
    this.momentHistory.push(this.#momentSummary(mo));
  }

  dismissMoment() {
    if (this.moment?.status === 'open') this.closeMoment();
    this.moment = null;
  }

  setFocus(on) {
    this.#requireLive();
    this.focus = Boolean(on);
    this.events.push({ t: this.clock(), type: this.focus ? 'focus' : 'resume' });
  }

  setGames(on) {
    this.#requireLive();
    this.gamesOpen = Boolean(on);
  }

  addGameWindow({ startMin, durationMin, label }) {
    this.#requireLive();
    const start = Number(startMin);
    const duration = Number(durationMin);
    if (!(start >= 0 && start <= 600)) throw new ActionError('Start must be 0 to 600 minutes.');
    if (!(duration >= 1 && duration <= 120)) throw new ActionError('Length must be 1 to 120 minutes.');
    if (this.gameWindows.length >= 10) throw new ActionError('Up to 10 game windows.');
    this.gameWindows.push({
      id: newId(3),
      startMin: start,
      durationMin: duration,
      label: clean(label, 40) || 'Game window',
      wasIn: false,
    });
    this.gameWindows.sort((a, b) => a.startMin - b.startMin);
  }

  removeGameWindow(id) {
    this.gameWindows = this.gameWindows.filter((w) => w.id !== id);
  }

  setBingoWords(words) {
    this.#requireLive();
    const unique = [...new Set(words.map((w) => clean(w, 30)).filter(Boolean))].slice(0, 40);
    if (unique.length < 9) throw new ActionError('Add at least 9 different words.');
    this.bingoWords = unique;
    for (const p of this.participants.values()) {
      p.card = shuffle(unique).slice(0, 9);
      p.marks.clear();
      p.paidMarks.clear();
      p.lines.clear();
    }
  }

  setPrediction(question) {
    this.#requireLive();
    const text = clean(question, 120);
    if (!text) throw new ActionError('Add a yes/no question.');
    this.prediction = this.#freshPrediction(text);
  }

  resolvePrediction(result) {
    this.#requireLive();
    if (result !== 'yes' && result !== 'no') throw new ActionError('Pick yes or no.');
    const prediction = this.prediction;
    if (prediction.status === 'resolved') return;
    prediction.status = 'resolved';
    prediction.result = result;
    for (const [pid, choice] of prediction.answers) {
      if (choice === result) {
        const p = this.participants.get(pid);
        if (p) p.points += POINTS.predictionCorrect;
      }
    }
  }

  setQuestionAnswered(id, answered = true) {
    const q = this.questions.find((item) => item.id === id);
    if (q) q.answered = Boolean(answered);
  }

  removeQuestion(id) {
    this.questions = this.questions.filter((q) => q.id !== id);
  }

  setQuiet(on, everyMin) {
    this.quiet.on = Boolean(on);
    const minutes = Number.parseInt(everyMin, 10);
    if (minutes >= 5 && minutes <= 120) this.quiet.everyMin = minutes;
    this.lastPulseAt = Math.max(this.lastPulseAt, this.clock());
  }

  openTheFloor() {
    this.#requireLive();
    const now = this.clock();
    this.nudge = { id: newId(3), until: now + NUDGE_MS };
    this.suggestionsSuppressedUntil = now + SUGGESTION_COOLDOWN_MS;
    this.events.push({ t: now, type: 'floor' });
  }

  resetClock() {
    this.#requireLive();
    const now = this.clock();
    this.startedAt = now;
    this.series = [];
    this.events = [];
    this.lastSampleAt = 0;
    this.lastPulseAt = now;
    for (const w of this.gameWindows) w.wasIn = false;
  }

  end() {
    if (this.status !== 'live') return;
    this.dismissMoment();
    this.#sample(this.clock(), true);
    this.status = 'ended';
    this.endedAt = this.clock();
    this.focus = false;
    this.gamesOpen = false;
  }

  // ---- time-driven behaviour ---------------------------------------------

  tick(now = this.clock()) {
    if (this.status !== 'live') return false;
    let changed = false;

    const mo = this.moment;
    if (mo?.status === 'open' && mo.closesAt && now >= mo.closesAt) {
      this.closeMoment();
      changed = true;
    }

    if (this.nudge && now >= this.nudge.until) {
      this.nudge = null;
      changed = true;
    }

    const elapsedMin = (now - this.startedAt) / 60_000;
    for (const w of this.gameWindows) {
      const inside = elapsedMin >= w.startMin && elapsedMin < w.startMin + w.durationMin;
      if (inside && !w.wasIn) {
        this.gamesOpen = true;
        changed = true;
      } else if (!inside && w.wasIn) {
        this.gamesOpen = false;
        changed = true;
      }
      w.wasIn = inside;
    }

    if (
      this.quiet.on && !this.focus && this.moment?.status !== 'open' &&
      now - this.lastPulseAt >= this.quiet.everyMin * 60_000
    ) {
      this.launchMoment({
        type: 'pulse',
        prompt: 'How is this meeting going for you?',
        durationSec: 45,
        auto: true,
      });
      changed = true;
    }

    if (this.#sample(now)) changed = true;
    return changed;
  }

  #sample(now, force = false) {
    if (!force && now - this.lastSampleAt < this.sampleMs) return false;
    const { pct, active, connected } = this.engagement(now);
    if (connected === 0) return false;
    this.lastSampleAt = now;
    this.series.push({ t: now, pct, active, connected });
    if (this.series.length > MAX_SERIES) this.series.shift();
    return true;
  }

  // ---- derived data -------------------------------------------------------

  engagement(now = this.clock()) {
    let connected = 0;
    let active = 0;
    for (const p of this.participants.values()) {
      if (!p.connected) continue;
      connected += 1;
      if (now - p.lastActionAt <= ENGAGEMENT_WINDOW_MS && p.lastActionAt > 0) active += 1;
    }
    return { connected, active, pct: connected ? Math.round((active / connected) * 100) : 0 };
  }

  recentReactions(now = this.clock()) {
    const totals = Object.fromEntries(REACTIONS.map((kind) => [kind, 0]));
    for (const r of this.reactionLog) {
      if (now - r.t <= REACTION_WINDOW_MS) totals[r.kind] += 1;
    }
    return totals;
  }

  dips() {
    const dips = [];
    let open = null;
    for (const [i, sample] of this.series.entries()) {
      const windowStart = sample.t - 10 * 60_000;
      const peak = Math.max(
        ...this.series.slice(0, i + 1).filter((s) => s.t >= windowStart).map((s) => s.pct),
      );
      const low = peak - sample.pct >= 20 && sample.pct < 70;
      if (low && !open) open = { from: sample.t, to: sample.t };
      else if (low && open) open.to = sample.t;
      else if (!low && open) {
        dips.push(open);
        open = null;
      }
    }
    if (open) dips.push(open);
    return dips;
  }

  suggestions(now = this.clock()) {
    if (this.status !== 'live' || now < this.suggestionsSuppressedUntil) return [];
    const out = [];

    const recent = this.series.filter((s) => now - s.t <= 10 * 60_000);
    if (this.series.length >= 4 && recent.length >= 3) {
      const last = recent[recent.length - 1];
      const peak = Math.max(...recent.map((s) => s.pct));
      if (peak - last.pct >= 20 && last.pct < 70) {
        out.push({
          id: 'dip',
          text: `Participation dropped from ${peak}% to ${last.pct}% in the last 10 minutes. Try a pulse check or open the floor.`,
          actions: ['pulse', 'floor', 'break'],
        });
      }
    }

    const reactions = this.recentReactions(now);
    const confused = reactions.lost + reactions.fast;
    const { connected } = this.engagement(now);
    if (connected >= 3 && confused >= Math.max(2, Math.ceil(connected * 0.25))) {
      out.push({
        id: 'confused',
        text: `${confused} people signalled "lost me" or "too fast" in the last 2 minutes. Consider slowing down or taking questions.`,
        actions: ['floor'],
      });
    }
    return out;
  }

  #freshPrediction(question) {
    return { question, status: 'open', result: null, answers: new Map() };
  }

  #momentResults(mo) {
    const total = mo.responses.size;
    if (mo.type === 'poll' || mo.type === 'quiz') {
      const counts = mo.options.map(() => 0);
      for (const value of mo.responses.values()) counts[value] += 1;
      return { total, counts };
    }
    if (mo.type === 'pulse') {
      const counts = [0, 0, 0, 0, 0];
      let sum = 0;
      for (const value of mo.responses.values()) {
        counts[value - 1] += 1;
        sum += value;
      }
      return { total, counts, average: total ? Math.round((sum / total) * 10) / 10 : null };
    }
    const tally = new Map();
    for (const words of mo.responses.values()) {
      for (const word of words) tally.set(word, (tally.get(word) ?? 0) + 1);
    }
    const words = [...tally.entries()]
      .map(([word, n]) => ({ word, n }))
      .sort((a, b) => b.n - a.n || a.word.localeCompare(b.word))
      .slice(0, 30);
    return { total, words };
  }

  #momentSummary(mo) {
    return {
      id: mo.id,
      type: mo.type,
      prompt: mo.prompt,
      options: mo.options,
      correct: mo.correct,
      openedAt: mo.openedAt,
      results: this.#momentResults(mo),
    };
  }

  #publicMoment(mo, viewerPid) {
    if (!mo) return null;
    const base = {
      id: mo.id,
      type: mo.type,
      prompt: mo.prompt,
      options: mo.options,
      status: mo.status,
      auto: mo.auto,
      closesAt: mo.closesAt,
    };
    if (viewerPid === null) {
      return { ...base, correct: mo.correct, results: this.#momentResults(mo) };
    }
    const mine = mo.responses.get(viewerPid);
    const view = { ...base, mine: mine ?? null };
    if (mo.status === 'closed') {
      view.results = this.#momentResults(mo);
      if (mo.type === 'quiz') view.correct = mo.correct;
    }
    return view;
  }

  #publicQuestions(viewerPid) {
    return [...this.questions]
      .sort((a, b) => Number(a.answered) - Number(b.answered) || b.votes.size - a.votes.size || a.t - b.t)
      .map((q) => ({
        id: q.id,
        text: q.text,
        author: q.author,
        votes: q.votes.size,
        answered: q.answered,
        ...(viewerPid === null ? {} : { voted: q.votes.has(viewerPid), mine: q.authorPid === viewerPid }),
      }));
  }

  #nextWindow(now) {
    const elapsedMin = (now - this.startedAt) / 60_000;
    const upcoming = this.gameWindows.find((w) => w.startMin > elapsedMin);
    const current = this.gameWindows.find(
      (w) => elapsedMin >= w.startMin && elapsedMin < w.startMin + w.durationMin,
    );
    return {
      current: current ? { label: current.label, endsAt: this.startedAt + (current.startMin + current.durationMin) * 60_000 } : null,
      next: upcoming ? { label: upcoming.label, startsAt: this.startedAt + upcoming.startMin * 60_000 } : null,
    };
  }

  #predictionCounts() {
    let yes = 0;
    let no = 0;
    for (const choice of this.prediction.answers.values()) {
      if (choice === 'yes') yes += 1;
      else no += 1;
    }
    return { yes, no };
  }

  participationSpread() {
    const perPerson = new Map();
    for (const a of this.actions) perPerson.set(a.pid, (perPerson.get(a.pid) ?? 0) + 1);
    const counts = [...perPerson.values()].sort((a, b) => b - a);
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (!total) return null;
    const top = Math.max(1, Math.ceil(this.participants.size * 0.2));
    const share = counts.slice(0, top).reduce((sum, n) => sum + n, 0) / total;
    return Math.round(share * 100);
  }

  summary() {
    const now = this.endedAt ?? this.clock();
    const participated = [...this.participants.values()].filter((p) => p.lastActionAt > 0).length;
    const joined = this.participants.size;
    const reactionTotals = Object.fromEntries(REACTIONS.map((kind) => [kind, 0]));
    for (const r of this.reactionLog) reactionTotals[r.kind] += 1;
    const avg = this.series.length
      ? Math.round(this.series.reduce((sum, s) => sum + s.pct, 0) / this.series.length)
      : null;
    const open = this.questions.filter((q) => !q.answered);
    return {
      durationMs: now - this.startedAt,
      joined,
      expected: this.expected,
      participated,
      participationRate: joined ? Math.round((participated / joined) * 100) : 0,
      peakConnected: Math.max(0, ...this.series.map((s) => s.connected)),
      averageEngagement: avg,
      spreadTop20: this.participationSpread(),
      reactionTotals,
      series: this.series,
      dips: this.dips(),
      events: this.events,
      moments: this.momentHistory,
      topQuestions: this.#publicQuestions(null).slice(0, 5),
      unanswered: open.length,
      prediction: {
        question: this.prediction.question,
        result: this.prediction.result,
        ...this.#predictionCounts(),
      },
    };
  }

  // ---- snapshots ----------------------------------------------------------

  hostSnapshot() {
    const now = this.clock();
    const participated = [...this.participants.values()].filter((p) => p.lastActionAt > 0).length;
    const snapshot = {
      role: 'host',
      code: this.code,
      title: this.title,
      agenda: this.agenda,
      status: this.status,
      now,
      startedAt: this.startedAt,
      counts: {
        joined: this.participants.size,
        connected: this.engagement(now).connected,
        participated,
        expected: this.expected,
      },
      engagement: this.engagement(now),
      series: this.series,
      dips: this.dips(),
      events: this.events,
      reactions: this.recentReactions(now),
      questions: this.#publicQuestions(null),
      moment: this.#publicMoment(this.moment, null),
      focus: this.focus,
      gamesOpen: this.gamesOpen,
      gameWindows: this.gameWindows.map(({ id, startMin, durationMin, label }) => ({ id, startMin, durationMin, label })),
      bingoWords: this.bingoWords,
      prediction: {
        question: this.prediction.question,
        status: this.prediction.status,
        result: this.prediction.result,
        ...this.#predictionCounts(),
      },
      quiet: this.quiet,
      suggestions: this.suggestions(now),
      floorOpen: Boolean(this.nudge),
    };
    if (this.status === 'ended') snapshot.summary = this.summary();
    return snapshot;
  }

  attendeeSnapshot(pid) {
    const p = this.participants.get(pid);
    if (!p) return null;
    const now = this.clock();
    const snapshot = {
      role: 'attendee',
      code: this.code,
      title: this.title,
      agenda: this.agenda,
      status: this.status,
      now,
      startedAt: this.startedAt,
      me: { id: p.id, name: p.name, anon: p.anon, points: p.points, counts: p.counts },
      focus: this.focus,
      gamesOpen: this.gamesOpen,
      windows: this.#nextWindow(now),
      moment: this.#publicMoment(this.moment, pid),
      questions: this.#publicQuestions(pid),
      card: { words: p.card, marks: [...p.marks], lines: [...p.lines] },
      prediction: {
        question: this.prediction.question,
        status: this.prediction.status,
        result: this.prediction.result,
        mine: this.prediction.answers.get(pid) ?? null,
      },
      floorOpen: Boolean(this.nudge),
    };
    if (this.status === 'ended') {
      const summary = this.summary();
      snapshot.recap = {
        durationMs: summary.durationMs,
        joined: summary.joined,
        participationRate: summary.participationRate,
        moments: summary.moments,
        topQuestions: summary.topQuestions,
        prediction: summary.prediction,
        myQuestions: this.questions
          .filter((q) => q.authorPid === pid)
          .map((q) => ({ text: q.text, answered: q.answered, votes: q.votes.size })),
      };
    }
    return snapshot;
  }
}
