// Ready-made questions the host can pick and then edit. Recall checks leave the options for the
// host, because the right answer depends on what was just said.
export const LIBRARY = {
  poll: [
    { prompt: 'Should we go ahead with this plan?', options: ['Yes', 'No', 'Need more information'] },
    { prompt: 'Is everything clear so far?', options: ['Yes, all clear', 'Mostly', 'No, I have questions'] },
    { prompt: 'Is the pace of this meeting right?', options: ['Too slow', 'About right', 'Too fast'] },
    { prompt: 'How confident are you about this decision?', options: ['Very confident', 'Somewhat confident', 'Not confident'] },
    { prompt: 'Which topic should we cover next?', options: ['', '', ''] },
    { prompt: 'Which option do you prefer?', options: ['', ''] },
    { prompt: 'Do we need a follow-up meeting?', options: ['Yes', 'No', 'An email is enough'] },
    { prompt: 'Did this session meet your expectations?', options: ['Yes', 'Partly', 'No'] },
  ],
  pulse: [
    { prompt: 'How is this meeting going for you?' },
    { prompt: 'How clear was that explanation?' },
    { prompt: 'How useful has this session been so far?' },
    { prompt: 'How is your energy right now?' },
    { prompt: 'How confident do you feel about the next steps?' },
  ],
  recall: [
    { prompt: 'What was the main decision we just made?', options: ['', '', ''] },
    { prompt: 'What is the next step we agreed?', options: ['', '', ''] },
    { prompt: 'Who owns the next action?', options: ['', '', ''] },
    { prompt: 'Which of these did we just cover?', options: ['', '', ''] },
  ],
  wordcloud: [
    { prompt: 'One word for how you feel right now' },
    { prompt: 'One word that sums up this topic' },
    { prompt: 'What is your biggest blocker? One word' },
    { prompt: 'One word for what we should focus on next' },
    { prompt: 'One word to describe this session' },
  ],
};

// Questions the host wrote themselves are remembered on this device for next time.
const RECENT_KEY = 'engage.recentPrompts';
const read = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) ?? []; } catch { return []; }
};
export const recentPrompts = (type) => read().filter((p) => p.type === type);
export const rememberPrompt = (entry) => {
  const isLibrary = (LIBRARY[entry.type] ?? []).some((p) => p.prompt === entry.prompt);
  if (isLibrary || !entry.prompt) return;
  const next = [entry, ...read().filter((p) => !(p.type === entry.type && p.prompt === entry.prompt))].slice(0, 12);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage can be blocked */ }
};
