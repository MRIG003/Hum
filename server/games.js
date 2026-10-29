// Quick games: short rounds that everyone in the meeting plays at the same time. Each round is a
// question with four tap targets and one right answer. Generators are pure apart from the random
// source, which tests can replace.
import { randomInt } from 'node:crypto';

export const GAME_KINDS = ['colors', 'evenodd', 'maths', 'biggest', 'oddone', 'mixed'];

export const GAME_LABELS = {
  colors: 'Colour tap',
  evenodd: 'Even or odd',
  maths: 'Quick maths',
  biggest: 'Biggest or smallest',
  oddone: 'Odd one out',
  mixed: 'Surprise mix',
};

const COLORS = [
  { label: 'Red', color: '#d93025' },
  { label: 'Blue', color: '#1a73e8' },
  { label: 'Yellow', color: '#f9ab00' },
  { label: 'Green', color: '#1e8e3e' },
  { label: 'Purple', color: '#8e24aa' },
  { label: 'Orange', color: '#f4511e' },
];

const GROUPS = {
  fruit: ['Apple', 'Banana', 'Mango', 'Grapes', 'Orange', 'Pear', 'Cherry', 'Guava'],
  animals: ['Dog', 'Cat', 'Lion', 'Tiger', 'Horse', 'Rabbit', 'Elephant', 'Monkey'],
  vehicles: ['Car', 'Bus', 'Train', 'Bicycle', 'Truck', 'Boat', 'Scooter', 'Plane'],
  countries: ['India', 'Japan', 'Brazil', 'Kenya', 'Canada', 'France', 'Mexico', 'Egypt'],
  instruments: ['Guitar', 'Piano', 'Drums', 'Violin', 'Flute', 'Sitar', 'Trumpet', 'Tabla'],
  body: ['Hand', 'Eye', 'Nose', 'Knee', 'Elbow', 'Ear', 'Shoulder', 'Ankle'],
};

const pickFrom = (items, rand) => items[rand(items.length)];

const shuffled = (items, rand) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = rand(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Distinct numbers from [lo, hi] that pass `keep`.
const distinctNumbers = (count, lo, hi, rand, keep = () => true, avoid = []) => {
  const out = new Set();
  for (let guard = 0; out.size < count && guard < 1000; guard += 1) {
    const n = lo + rand(hi - lo + 1);
    if (keep(n) && !avoid.includes(n)) out.add(n);
  }
  return [...out];
};

// Shuffle the options and report where the right one ended up.
const finish = (prompt, right, wrong, rand, extra = {}) => {
  const options = shuffled([right, ...wrong], rand);
  return { prompt, options, correct: options.indexOf(right), ...extra };
};

const generators = {
  colors(rand) {
    const four = shuffled(COLORS, rand).slice(0, 4);
    const target = pickFrom(four, rand);
    const options = shuffled(four, rand).map((c) => ({ label: c.label, color: c.color }));
    return { prompt: `Tap ${target.label.toUpperCase()}`, options, correct: options.findIndex((o) => o.label === target.label) };
  },
  evenodd(rand) {
    const wantEven = rand(2) === 0;
    const isWanted = (n) => (n % 2 === 0) === wantEven;
    const [right] = distinctNumbers(1, 2, 99, rand, isWanted);
    const wrong = distinctNumbers(3, 1, 99, rand, (n) => !isWanted(n));
    const r = finish(`Tap the ${wantEven ? 'even' : 'odd'} number`, { label: String(right) }, wrong.map((n) => ({ label: String(n) })), rand);
    return r;
  },
  maths(rand) {
    const op = pickFrom(['+', '−', '×'], rand);
    let a = 2 + rand(19);
    let b = 2 + rand(11);
    if (op === '−' && b > a) [a, b] = [b, a];
    if (op === '×') { a = 2 + rand(11); b = 2 + rand(9); }
    const answer = op === '+' ? a + b : op === '−' ? a - b : a * b;
    const wrong = distinctNumbers(3, Math.max(0, answer - 6), answer + 6, rand, (n) => n !== answer);
    return finish(`${a} ${op} ${b} = ?`, { label: String(answer) }, wrong.map((n) => ({ label: String(n) })), rand);
  },
  biggest(rand) {
    const wantBiggest = rand(2) === 0;
    const numbers = distinctNumbers(4, 10, 99, rand);
    const target = wantBiggest ? Math.max(...numbers) : Math.min(...numbers);
    const options = shuffled(numbers, rand).map((n) => ({ label: String(n) }));
    return { prompt: `Tap the ${wantBiggest ? 'biggest' : 'smallest'} number`, options, correct: options.findIndex((o) => o.label === String(target)) };
  },
  oddone(rand) {
    const [main, other] = shuffled(Object.keys(GROUPS), rand);
    const three = shuffled(GROUPS[main], rand).slice(0, 3).map((label) => ({ label }));
    const outsider = { label: pickFrom(GROUPS[other], rand) };
    return finish('Which one does not belong?', outsider, three, rand, { hint: `The others are ${main}.` });
  },
};

export const makeRound = (kind, rand = randomInt) => {
  const real = kind === 'mixed' ? pickFrom(GAME_KINDS.filter((k) => k !== 'mixed'), rand) : kind;
  const round = generators[real](rand);
  return { kind: real, ...round };
};
