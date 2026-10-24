import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const PLATFORMS = ['meet', 'zoom', 'teams', 'zoho', 'other'];

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
const RECALL_CAP_MS = 15 * 60_000;
const RECALL_DEFAULT_SEC = 20;
const MAX_PINNED = 3;
const MAX_PROMPTS = 24;
const MAX_PROMPTS_PER_TOPIC = 3;
const TOPIC_NUDGE_BEFORE_MS = 60_000;
const TOPIC_NUDGE_AFTER_MS = 5 * 60_000;
const PLACEHOLDER_NAMES = /^(anon(ymous)?|guest|unknown|user|test|nobody|na|n\/a|none|me|someone)$/i;
const MOMENT_TYPES = ['poll', 'pulse', 'quiz', 'recall', 'wordcloud'];
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

// Tokens are only ever stored as hashes, so a leaked database cannot be replayed.
export const hashToken = (token) => createHash('sha256').update(String(token ?? '')).digest('hex');

export const tokenMatches = (token, hash) => {
  if (!token || !hash) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};

export const newCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export class Meeting {
  constructor({
    code,
    title,
    expected = 0,
    agenda = '',
    platform = 'other',
    link = null,
    clock = Date.now,
    sampleMs = Number(process.env.ENGAGE_SAMPLE_MS) || 30_000,
  } = {}) {
    this.clock = clock;
    this.sampleMs = sampleMs;
    this.code = code ?? newCode();
    this.platform = PLATFORMS.includes(platform) ? platform : 'other';
    // Ties this meeting to a meeting inside a platform (for example a Google Meet meeting id),
    // so everyone who opens the add-on in that meeting lands in the same Engage meeting.
    this.link = link && PLATFORMS.includes(link.platform) && /^[\w./-]{3,80}$/.test(String(link.id ?? ''))
      ? { platform: link.platform, id: String(link.id) }
      : null;
    this.hostToken = newId(16); // plaintext exists only in memory, handed out once at creation
    this.hostTokenHash = hashToken(this.hostToken);
    this.ownerId = null;
    this.prompts = [];
    this.title = clean(title, 80) || 'Untitled meeting';
    this.agendaText = '';
    this.agendaSegments = [];
    this.lastRecallAt = 0;
    this.setAgenda(agenda);
    this.expected = Math.max(0, Math.min(1000, Number.parseInt(expected, 10) || 0));
    this.createdAt = this.clock();
    this.startedAt = this.createdAt;
    this.status = 'live';
    this.endedAt = null;
    this.summaryEmailedAt = null; // set once the host has been emailed the summary

    this.participants = new Map();
    this.actions = [];
    this.responseLog = [];
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

  join({ name, pid, token: presented }) {
    const now = this.clock();
    if (this.status !== 'live') throw new ActionError('This meeting has ended.');

    const existing = pid ? this.participants.get(pid) : null;
    if (existing && tokenMatches(presented, existing.tokenHash)) {
      existing.connected = true;
      return existing;
    }
    if (this.participants.size >= MAX_PARTICIPANTS) throw new ActionError('This meeting is full.');

    const displayName = clean(name, 60);
    if (displayName.length < 2) throw new ActionError('Enter your name as it appears in the meeting.');
    if (PLACEHOLDER_NAMES.test(displayName)) {
      throw new ActionError('Please use your real name, as it appears in the meeting, so the host can follow up with you.');
    }

    const token = newId(16);
    const participant = {
      id: newId(),
      token, // returned to the browser once; never persisted
      tokenHash: hashToken(token),
      name: displayName,
      presenting: false,
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

  checkHostToken(token) {
    return tokenMatches(token, this.hostTokenHash);
  }

  claim(userId) {
    if (!this.ownerId) this.ownerId = userId;
  }

  setPresenting(pid, on) {
    const p = this.participants.get(pid);
    if (p) p.presenting = Boolean(on);
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

  ask(pid, text) {
    this.#requireLive();
    const p = this.#participant(pid);
    const body = clean(text, 280);
    if (!body) throw new ActionError('Type a question first.');
    if (this.questions.length >= MAX_QUESTIONS) throw new ActionError('Question limit reached.');
    this.questions.push({
      id: newId(4),
      text: body,
      authorPid: pid,
      author: p.name,
      votes: new Set(),
      answered: false,
      pinned: false,
      merged: 0,
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
    if (mo.type === 'recall' && value === 'missed') {
      mo.responses.set(pid, -1);
      this.#touch(p, 'recall', 0, 'answers');
      return;
    }
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

  #validateSpec({ type, prompt, options = [], correct = null }) {
    if (!MOMENT_TYPES.includes(type)) throw new ActionError('Unknown moment type.');
    const text = clean(prompt, 160);
    if (!text) throw new ActionError('Add a question for the room.');

    let cleaned = [];
    if (type === 'poll' || type === 'quiz' || type === 'recall') {
      cleaned = (Array.isArray(options) ? options : []).map((option) => clean(option, 80)).filter(Boolean).slice(0, 6);
      if (cleaned.length < 2) throw new ActionError('Add at least two options.');
    }
    let correctIndex = null;
    if (type === 'quiz' || type === 'recall') {
      correctIndex = Number.parseInt(correct, 10);
      if (!(correctIndex >= 0 && correctIndex < cleaned.length)) {
        throw new ActionError('Mark the correct answer.');
      }
    }
    return { type, text, cleaned, correctIndex };
  }

  launchMoment({ type, prompt, options = [], correct = null, durationSec = 0, auto = false, override = false }) {
    this.#requireLive();
    const { text, cleaned, correctIndex } = this.#validateSpec({ type, prompt, options, correct });

    const now = this.clock();
    if (type === 'recall' && !override && this.lastRecallAt && now - this.lastRecallAt < RECALL_CAP_MS) {
      const wait = Math.ceil((this.lastRecallAt + RECALL_CAP_MS - now) / 1000);
      const mm = Math.floor(wait / 60);
      throw new ActionError(`The next recall check is available in ${mm}:${String(wait % 60).padStart(2, '0')}. Launch anyway to override.`);
    }
    if (this.moment?.status === 'open') this.closeMoment();
    const fallbackSeconds = type === 'recall' ? RECALL_DEFAULT_SEC : 0;
    const seconds = Math.max(0, Math.min(600, Number.parseInt(durationSec, 10) || fallbackSeconds));
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
    if (type === 'recall') {
      this.lastRecallAt = now;
      this.events.push({ t: now, type: 'recall' });
    }
    this.suggestionsSuppressedUntil = now + SUGGESTION_COOLDOWN_MS;
  }

  // ---- prepared prompts (attached to agenda topics) ------------------------

  #topicKey = (title) => clean(title, 40).toLowerCase();

  addPrompt({ topic, type, prompt, options = [], correct = null, durationSec = 0 }) {
    this.#requireLive();
    const key = this.#topicKey(topic);
    const segment = this.agendaSegments.find((seg) => this.#topicKey(seg.title) === key);
    if (!segment) throw new ActionError('Pick a topic from the agenda first.');
    if (this.prompts.length >= MAX_PROMPTS) throw new ActionError(`Up to ${MAX_PROMPTS} prepared prompts.`);
    if (this.prompts.filter((item) => item.topic === key).length >= MAX_PROMPTS_PER_TOPIC) {
      throw new ActionError(`Up to ${MAX_PROMPTS_PER_TOPIC} prompts per topic.`);
    }
    const spec = this.#validateSpec({ type, prompt, options, correct });
    const seconds = Math.max(0, Math.min(600, Number.parseInt(durationSec, 10) || 0));
    this.prompts.push({
      id: newId(3),
      topic: key,
      type,
      prompt: spec.text,
      options: spec.cleaned,
      correct: spec.correctIndex,
      durationSec: seconds,
      used: false,
    });
  }

  removePrompt(id) {
    this.prompts = this.prompts.filter((item) => item.id !== id);
  }

  launchPrepared(id, { override = false } = {}) {
    const item = this.prompts.find((entry) => entry.id === id);
    if (!item) throw new ActionError('That prompt is no longer prepared.');
    this.launchMoment({
      type: item.type,
      prompt: item.prompt,
      options: item.options,
      correct: item.correct,
      durationSec: item.durationSec,
      override,
    });
    item.used = true;
  }

  #promptsForSegment(seg) {
    const key = this.#topicKey(seg.title);
    return this.prompts
      .filter((item) => item.topic === key)
      .map(({ id, type, prompt, used }) => ({ id, type, prompt, used }));
  }

  // The end-of-topic nudge: shown only to the host, never to attendees, and it does not
  // wait for the 5-minute quiet period that follows other prompts.
  topicNudge(now = this.clock()) {
    if (this.status !== 'live' || this.focus || this.moment?.status === 'open') return null;
    for (const seg of this.agendaSegments) {
      const endsAt = this.startedAt + seg.endMin * 60_000;
      if (now < endsAt - TOPIC_NUDGE_BEFORE_MS || now > endsAt + TOPIC_NUDGE_AFTER_MS) continue;
      const key = this.#topicKey(seg.title);
      const next = this.prompts.find((item) => item.topic === key && !item.used);
      if (next) {
        return { topic: seg.title, endsAt, promptId: next.id, type: next.type, prompt: next.prompt };
      }
    }
    return null;
  }

  closeMoment() {
    const mo = this.moment;
    if (!mo || mo.status !== 'open') return;
    mo.status = 'closed';
    mo.closedAt = this.clock();
    if (mo.type === 'quiz' || mo.type === 'recall') {
      for (const [pid, answer] of mo.responses) {
        if (answer === mo.correct) {
          const p = this.participants.get(pid);
          if (p) p.points += POINTS.quizCorrect;
        }
      }
    }
    this.momentHistory.push(this.#momentSummary(mo));
    // Who answered stays host-side, separate from the summary attendees receive in their recap.
    this.responseLog.push({
      id: mo.id,
      type: mo.type,
      prompt: mo.prompt,
      openedAt: mo.openedAt,
      // Only that someone answered, never what they chose: "Missed that" and wrong answers stay anonymous.
      responses: [...mo.responses.keys()].map((pid) => [pid, 'answered']),
    });
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

  pinQuestion(id, on = true) {
    this.#requireLive();
    const q = this.questions.find((item) => item.id === id);
    if (!q) throw new ActionError('Question not found.');
    if (on && !q.pinned && this.questions.filter((item) => item.pinned).length >= MAX_PINNED) {
      throw new ActionError(`Pin up to ${MAX_PINNED} questions. Unpin one first.`);
    }
    q.pinned = Boolean(on);
  }

  // Folds a duplicate into another question: votes are combined, the duplicate disappears.
  mergeQuestions(fromId, intoId) {
    this.#requireLive();
    if (fromId === intoId) throw new ActionError('Pick two different questions.');
    const from = this.questions.find((item) => item.id === fromId);
    const into = this.questions.find((item) => item.id === intoId);
    if (!from || !into) throw new ActionError('Question not found.');
    for (const pid of from.votes) into.votes.add(pid);
    into.merged += 1 + from.merged;
    into.pinned = into.pinned || from.pinned;
    this.questions = this.questions.filter((item) => item.id !== fromId);
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
          text: `Participation dropped from ${peak}% to ${last.pct}% in the last 10 minutes${this.#segmentLabel(now)}. Try a recall check, a pulse check or open the floor.`,
          actions: ['recall', 'pulse', 'floor', 'break'],
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

  // ---- agenda and coaching ------------------------------------------------

  setAgenda(text) {
    const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12);
    const segments = [];
    let start = 0;
    for (const line of lines) {
      const m = line.match(/^(.*?)[\s,;:-]+(\d{1,3})\s*(?:min(?:ute)?s?)?$/i);
      const title = clean(m ? m[1] : line, 40);
      const minutes = Math.max(1, Math.min(240, m ? Number.parseInt(m[2], 10) : 10));
      if (!title) continue;
      segments.push({ title, minutes, startMin: start, endMin: start + minutes });
      start += minutes;
    }
    this.agendaSegments = segments;
    this.agendaText = segments.map((s) => `${s.title}, ${s.minutes}`).join('\n');
    // Prepared prompts follow their topic by title; prompts for a removed topic are dropped.
    const keys = new Set(segments.map((seg) => this.#topicKey(seg.title)));
    this.prompts = this.prompts.filter((item) => keys.has(item.topic));
  }

  #segmentAtMinute(minute) {
    return this.agendaSegments.find((s) => minute >= s.startMin && minute < s.endMin) ?? null;
  }

  #segmentLabel(now) {
    const seg = this.#segmentAtMinute((now - this.startedAt) / 60_000);
    return seg ? `, during ${seg.title}` : '';
  }

  agendaSegmentStats() {
    return this.agendaSegments.map((seg) => {
      const from = this.startedAt + seg.startMin * 60_000;
      const to = this.startedAt + seg.endMin * 60_000;
      const samples = this.series.filter((x) => x.t >= from && x.t < to);
      return {
        title: seg.title,
        startMin: seg.startMin,
        endMin: seg.endMin,
        avg: samples.length ? Math.round(samples.reduce((sum, x) => sum + x.pct, 0) / samples.length) : null,
        low: samples.length ? Math.min(...samples.map((x) => x.pct)) : null,
        samples: samples.length,
      };
    });
  }

  coach() {
    const insights = [];
    const joined = this.participants.size;
    const minuteOf = (t) => Math.round((t - this.startedAt) / 60_000);
    let worst = null;

    for (const dip of this.dips()) {
      const inside = this.series.filter((x) => x.t >= dip.from && x.t <= dip.to);
      const before = this.series.filter((x) => x.t < dip.from && x.t >= dip.from - 10 * 60_000);
      const low = Math.min(...inside.map((x) => x.pct));
      const peak = before.length ? Math.max(...before.map((x) => x.pct)) : low;
      if (!worst || peak - low > worst.peak - worst.low) worst = { dip, low, peak };
    }
    if (worst) {
      const minute = minuteOf(worst.dip.from);
      const seg = this.#segmentAtMinute(minute);
      let detail = `It fell from ${worst.peak}% to ${worst.low}% starting around minute ${minute}.`;
      const rescue = this.events.find((e) => (e.type === 'pulse' || e.type === 'floor' || e.type === 'recall') && e.t >= worst.dip.from);
      if (rescue) {
        const after = this.series.filter((x) => x.t > rescue.t && x.t <= rescue.t + 5 * 60_000);
        const best = after.length ? Math.max(...after.map((x) => x.pct)) : 0;
        if (best >= worst.low + 15) {
          const what = rescue.type === 'pulse' ? 'pulse check' : rescue.type === 'recall' ? 'recall check' : 'invitation to share';
          detail += ` The ${what} at minute ${minuteOf(rescue.t)} brought it back to ${best}%.`;
        }
      }
      worst.minute = minute;
      worst.seg = seg;
      insights.push({ id: 'dip', title: seg ? `Engagement dipped during ${seg.title}.` : 'Engagement dipped.', detail });
    }

    let recallMissedPct = null;
    const recalls = this.momentHistory.filter((m) => m.type === 'recall');
    if (recalls.length) {
      let answered = 0;
      let got = 0;
      let missed = 0;
      for (const m of recalls) {
        answered += m.results.total;
        got += m.results.counts[m.correct] ?? 0;
        missed += m.results.missed;
      }
      if (answered) {
        const gotPct = Math.round((got / answered) * 100);
        recallMissedPct = Math.round((missed / answered) * 100);
        if (recallMissedPct >= 20) {
          insights.push({
            id: 'recall',
            title: `About 1 in ${Math.max(2, Math.round(100 / recallMissedPct))} missed what was just covered.`,
            detail: `In the recall check, ${gotPct}% got it and ${recallMissedPct}% chose "Missed that". A one-line recap after key points would help.`,
          });
        } else {
          insights.push({
            id: 'recall',
            title: 'Most people followed the discussion.',
            detail: `${gotPct}% got the recall check right and ${recallMissedPct}% chose "Missed that".`,
          });
        }
      }
    }

    const open = this.questions.filter((q) => !q.answered);
    if (open.length) {
      const top = [...open].sort((a, b) => b.votes.size - a.votes.size)[0];
      insights.push({
        id: 'questions',
        title: `${open.length} ${open.length === 1 ? 'question is' : 'questions are'} still open.`,
        detail: `Top question: "${top.text}" with ${top.votes.size} ${top.votes.size === 1 ? 'vote' : 'votes'}. Consider replying in the meeting chat.`,
      });
    }

    const lostFast = this.reactionLog.filter((r) => r.kind === 'lost' || r.kind === 'fast').length;
    if (joined >= 5 && lostFast >= Math.max(3, Math.ceil(joined * 0.25))) {
      insights.push({
        id: 'confusion',
        title: 'Many people signalled "Lost me" or "Too fast".',
        detail: `${lostFast} signals from ${joined} people. Consider slowing down or adding a short recap.`,
      });
    }

    const spread = this.participationSpread();
    if (joined >= 5 && spread !== null && spread > 60) {
      insights.push({
        id: 'spread',
        title: 'A few people did most of the participating.',
        detail: `The top 20% of people made ${spread}% of all actions. A poll or pulse check early on helps quieter people take part.`,
      });
    }

    const participated = [...this.participants.values()].filter((p) => p.lastActionAt > 0).length;
    const rate = joined ? Math.round((participated / joined) * 100) : 0;
    if (joined >= 5 && rate < 60) {
      insights.push({
        id: 'participation',
        title: `Only ${rate}% of people took part.`,
        detail: 'Try a pulse check in the first five minutes so everyone takes part early.',
      });
    }

    let next = 'Keep this format. Engagement held up well.';
    if (worst && worst.seg) next = `Move ${worst.seg.title} earlier in the meeting, or add a short break around minute ${worst.minute}.`;
    else if (worst) next = `Plan a short break or a pulse check around minute ${worst.minute}.`;
    else if (recallMissedPct !== null && recallMissedPct >= 20) next = 'Add a one-sentence recap after each decision.';
    else if (joined >= 5 && rate < 60) next = 'Open with a pulse check so everyone takes part early.';
    return { insights: insights.slice(0, 5), next };
  }

  #freshPrediction(question) {
    return { question, status: 'open', result: null, answers: new Map() };
  }

  #momentResults(mo) {
    const total = mo.responses.size;
    if (mo.type === 'recall') {
      const counts = mo.options.map(() => 0);
      let missed = 0;
      for (const value of mo.responses.values()) {
        if (value === -1) missed += 1;
        else counts[value] += 1;
      }
      return { total, counts, missed };
    }
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
      if (mo.type === 'quiz' || mo.type === 'recall') view.correct = mo.correct;
    }
    return view;
  }

  #publicQuestions(viewerPid) {
    return [...this.questions]
      .sort((a, b) =>
        Number(a.answered) - Number(b.answered) ||
        Number(b.pinned) - Number(a.pinned) ||
        b.votes.size - a.votes.size ||
        a.t - b.t)
      .map((q) => ({
        id: q.id,
        text: q.text,
        author: q.author,
        votes: q.votes.size,
        answered: q.answered,
        pinned: q.pinned,
        merged: q.merged,
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
      agenda: this.agendaSegmentStats(),
      coach: this.coach(),
      topQuestions: this.#publicQuestions(null).slice(0, 5),
      people: this.people(now).map((person) => ({
        ...person,
        longestQuietMs: this.#longestQuietMs(this.participants.get(person.id), now),
      })),
      unanswered: open.length,
      prediction: {
        question: this.prediction.question,
        result: this.prediction.result,
        ...this.#predictionCounts(),
      },
    };
  }

  // ---- people (host only) ---------------------------------------------------
  // Engage only sees actions taken inside Engage. "Quiet" means no Engage activity, not
  // "not listening", so the host UI says exactly that. People who flagged "I'm presenting" are
  // marked rather than counted as quiet.

  people(now = this.clock()) {
    return [...this.participants.values()]
      .map((p) => {
        const since = p.lastActionAt || p.joinedAt;
        return {
          id: p.id,
          name: p.name,
          connected: p.connected,
          presenting: p.presenting,
          joinedAt: p.joinedAt,
          lastActionAt: p.lastActionAt || null,
          neverActed: p.lastActionAt === 0,
          quietMs: Math.max(0, now - since),
          actions: p.counts.reactions + p.counts.questions + p.counts.votes + p.counts.answers,
        };
      })
      .sort((a, b) => Number(b.connected) - Number(a.connected) || b.quietMs - a.quietMs || a.name.localeCompare(b.name));
  }

  #longestQuietMs(p, until) {
    let longest = 0;
    let prev = p.joinedAt;
    for (const a of this.actions) {
      if (a.pid !== p.id) continue;
      longest = Math.max(longest, a.t - prev);
      prev = a.t;
    }
    return Math.max(longest, until - prev);
  }

  personDetail(pid, now = this.endedAt ?? this.clock()) {
    const p = this.participants.get(pid);
    if (!p) throw new ActionError('Unknown participant.');
    const reactionsByKind = Object.fromEntries(REACTIONS.map((kind) => [kind, 0]));
    for (const r of this.reactionLog) if (r.pid === pid) reactionsByKind[r.kind] += 1;

    const bucketMs = 5 * 60_000;
    const first = Math.floor((p.joinedAt - this.startedAt) / bucketMs);
    const last = Math.floor((now - this.startedAt) / bucketMs);
    const timeline = [];
    for (let b = Math.max(0, first); b <= last; b++) {
      const from = this.startedAt + b * bucketMs;
      const count = this.actions.filter((a) => a.pid === pid && a.t >= from && a.t < from + bucketMs).length;
      timeline.push({ fromMin: b * 5, count });
    }

    const prompts = this.responseLog
      .filter((entry) => entry.openedAt >= p.joinedAt)
      .map((entry) => ({
        prompt: entry.prompt,
        type: entry.type,
        status: entry.responses.find(([id]) => id === pid)?.[1] ?? 'none',
      }));

    return {
      id: p.id,
      name: p.name,
      connected: p.connected,
      presenting: p.presenting,
      joinedAt: p.joinedAt,
      minutesIn: Math.round((now - p.joinedAt) / 60_000),
      lastActionAt: p.lastActionAt || null,
      quietMs: Math.max(0, now - (p.lastActionAt || p.joinedAt)),
      longestQuietMs: this.#longestQuietMs(p, now),
      counts: {
        reactions: p.counts.reactions,
        questions: p.counts.questions,
        votes: p.counts.votes,
        answers: p.counts.answers,
      },
      reactionsByKind,
      timeline,
      prompts,
      answeredPrompts: prompts.filter((x) => x.status !== 'none').length,
      questions: this.questions
        .filter((q) => q.authorPid === pid)
        .map((q) => ({ text: q.text, votes: q.votes.size, answered: q.answered })),
    };
  }

  // ---- persistence ---------------------------------------------------------
  // Snapshot of everything needed to resume the meeting. Tokens appear only as hashes.

  serialize() {
    return {
      v: 1,
      code: this.code,
      title: this.title,
      expected: this.expected,
      platform: this.platform,
      link: this.link,
      ownerId: this.ownerId,
      hostTokenHash: this.hostTokenHash,
      agendaText: this.agendaText,
      agendaSegments: this.agendaSegments,
      prompts: this.prompts,
      lastRecallAt: this.lastRecallAt,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      status: this.status,
      endedAt: this.endedAt,
      summaryEmailedAt: this.summaryEmailedAt,
      participants: [...this.participants.values()].map((p) => ({
        id: p.id,
        tokenHash: p.tokenHash,
        name: p.name,
        presenting: p.presenting,
        joinedAt: p.joinedAt,
        lastActionAt: p.lastActionAt,
        points: p.points,
        counts: p.counts,
        card: p.card,
        marks: [...p.marks],
        paidMarks: [...p.paidMarks],
        lines: [...p.lines],
        lastReactionAt: p.lastReactionAt,
      })),
      actions: this.actions,
      responseLog: this.responseLog,
      reactionLog: this.reactionLog,
      questions: this.questions.map((q) => ({
        id: q.id,
        text: q.text,
        authorPid: q.authorPid,
        author: q.author,
        votes: [...q.votes],
        answered: q.answered,
        pinned: q.pinned,
        merged: q.merged,
        t: q.t,
      })),
      series: this.series,
      events: this.events,
      lastSampleAt: this.lastSampleAt,
      moment: this.moment
        ? { ...this.moment, responses: [...this.moment.responses.entries()] }
        : null,
      momentHistory: this.momentHistory,
      focus: this.focus,
      gamesOpen: this.gamesOpen,
      gameWindows: this.gameWindows,
      bingoWords: this.bingoWords,
      prediction: { ...this.prediction, answers: [...this.prediction.answers.entries()] },
      quiet: this.quiet,
      lastPulseAt: this.lastPulseAt,
      suggestionsSuppressedUntil: this.suggestionsSuppressedUntil,
    };
  }

  static restore(data, { clock = Date.now, sampleMs } = {}) {
    const m = new Meeting({
      code: data.code,
      title: data.title,
      expected: data.expected,
      platform: data.platform,
      link: data.link,
      clock,
      sampleMs,
    });
    m.hostToken = null;
    m.hostTokenHash = data.hostTokenHash;
    m.ownerId = data.ownerId ?? null;
    m.agendaText = data.agendaText;
    m.agendaSegments = data.agendaSegments;
    m.prompts = data.prompts ?? [];
    m.lastRecallAt = data.lastRecallAt ?? 0;
    m.createdAt = data.createdAt;
    m.startedAt = data.startedAt;
    m.status = data.status;
    m.endedAt = data.endedAt;
    m.summaryEmailedAt = data.summaryEmailedAt ?? null;
    for (const p of data.participants) {
      m.participants.set(p.id, {
        ...p,
        presenting: Boolean(p.presenting),
        connected: false,
        marks: new Set(p.marks),
        paidMarks: new Set(p.paidMarks),
        lines: new Set(p.lines),
      });
    }
    m.actions = data.actions;
    m.responseLog = data.responseLog ?? [];
    m.reactionLog = data.reactionLog;
    m.questions = data.questions.map((q) => ({ ...q, authorPid: q.authorPid ?? null, votes: new Set(q.votes) }));
    m.series = data.series;
    m.events = data.events;
    m.lastSampleAt = data.lastSampleAt;
    m.moment = data.moment ? { ...data.moment, responses: new Map(data.moment.responses) } : null;
    m.momentHistory = data.momentHistory;
    m.focus = data.focus;
    m.gamesOpen = data.gamesOpen;
    m.gameWindows = data.gameWindows;
    m.bingoWords = data.bingoWords;
    m.prediction = { ...data.prediction, answers: new Map(data.prediction.answers) };
    m.quiet = data.quiet;
    m.lastPulseAt = data.lastPulseAt;
    m.suggestionsSuppressedUntil = data.suggestionsSuppressedUntil;
    return m;
  }

  // ---- snapshots ----------------------------------------------------------

  hostSnapshot() {
    const now = this.clock();
    const participated = [...this.participants.values()].filter((p) => p.lastActionAt > 0).length;
    const snapshot = {
      role: 'host',
      code: this.code,
      title: this.title,
      platform: this.platform,
      agenda: {
        text: this.agendaText,
        segments: this.agendaSegmentStats().map((seg, i) => ({ ...seg, prompts: this.#promptsForSegment(this.agendaSegments[i]) })),
      },
      topicNudge: this.topicNudge(now),
      owned: Boolean(this.ownerId),
      recallNextAt: this.lastRecallAt ? this.lastRecallAt + RECALL_CAP_MS : 0,
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
      people: this.people(now),
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
      agenda: {
        segments: this.agendaSegments.map(({ title, startMin, endMin }) => ({ title, startMin, endMin })),
        current: this.#segmentAtMinute((now - this.startedAt) / 60_000)?.title ?? null,
      },
      status: this.status,
      now,
      startedAt: this.startedAt,
      me: { id: p.id, name: p.name, points: p.points, counts: p.counts },
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
