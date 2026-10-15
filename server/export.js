// CSV export of a meeting's results. Long format (section, item, metric, value) so it opens
// cleanly in a spreadsheet. It holds group results and question text only: no names and no
// per-person data. Per-person detail is shown to the host in the console, not exported.

const cell = (value) => {
  let text = String(value ?? '');
  // Neutralise spreadsheet formula injection from user-typed text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const stamp = (t) => new Date(t).toISOString();

export const meetingCsv = (meeting) => {
  const sum = meeting.summary();
  const rows = [['section', 'item', 'metric', 'value']];
  const add = (section, item, metric, value) => rows.push([section, item, metric, value]);

  add('meeting', meeting.title, 'code', meeting.code);
  add('meeting', meeting.title, 'started', stamp(meeting.startedAt));
  add('meeting', meeting.title, 'duration_minutes', Math.round(sum.durationMs / 60_000));
  add('meeting', meeting.title, 'joined', sum.joined);
  add('meeting', meeting.title, 'expected', sum.expected);
  add('meeting', meeting.title, 'participation_rate_pct', sum.participationRate);
  add('meeting', meeting.title, 'peak_connected', sum.peakConnected);
  add('meeting', meeting.title, 'average_engagement_pct', sum.averageEngagement ?? '');

  for (const point of sum.series) {
    add('engagement', stamp(point.t), 'engaged_pct', point.pct);
    add('engagement', stamp(point.t), 'connected', point.connected);
  }
  for (const seg of sum.agenda) {
    add('agenda', seg.title, 'average_engagement_pct', seg.avg ?? '');
    add('agenda', seg.title, 'lowest_engagement_pct', seg.low ?? '');
  }
  for (const m of sum.moments) {
    const label = `${m.type}: ${m.prompt}`;
    add('prompt', label, 'responses', m.results.total);
    if (m.results.counts) {
      m.results.counts.forEach((n, i) => add('prompt', label, m.options[i] ? `option: ${m.options[i]}` : `rating ${i + 1}`, n));
    }
    if (m.results.missed !== undefined) add('prompt', label, 'missed_that', m.results.missed);
    if (m.results.average != null) add('prompt', label, 'average', m.results.average);
    for (const w of m.results.words ?? []) add('prompt', label, `word: ${w.word}`, w.n);
  }
  for (const [kind, n] of Object.entries(sum.reactionTotals)) add('reactions', kind, 'count', n);
  for (const q of meeting.questions) {
    add('question', q.text, 'votes', q.votes.size);
    add('question', q.text, 'status', q.answered ? 'answered' : 'open');
  }
  sum.coach.insights.forEach((i) => add('coach', i.title, 'detail', i.detail));
  add('coach', 'next time', 'advice', sum.coach.next);

  return `${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
};
