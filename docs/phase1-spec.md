# Engage Phase 1: Companion App Spec

Status: draft for review. No tech stack chosen on purpose.

## 1. What Engage is

Engage is a second-screen engagement layer for any video meeting (Meet, Zoom, Teams, Zoho). It is not a video platform. The host creates a link, pastes it in the meeting chat, and attendees open it in a second window on their laptop, next to the meeting. A phone also works, but it is not the primary target.

**Goal:** in a 1 to 2 hour meeting, turn passive attendees into small, frequent contributors, without anyone feeling watched.

## 2. Design principles (corporate-safe)

1. **The meeting always wins.** Engage never competes with the speaker. Games yield to the meeting and pause on demand.
2. **Engage only reports what Engage can measure.** No guessing who is "speaking" or "idle" in the video call. Engagement means actions taken inside Engage.
3. **Transparent by default.** Attendees see, at join time, exactly what the host can see. No hidden tracking.
4. **(Superseded on 15 October 2026: hosts now see named quiet lists and per-person details, disclosed at join; see PRD FR-6.9 and PR-6.)** **Aggregate first, named second, never ranked.** No leaderboards, no per-person idle timers, no "engagement scores" tied to a name.
5. **Invitations, never accusations.** Engage nudges the host to invite people. It does not flag people.
6. **Zero friction.** No login, no install, under 10 seconds to join, laptop-first.
7. **Hosts do almost nothing.** A meeting should run well with one tap to start.

## 3. Phase 1 scope

### In

| Area | Feature |
|---|---|
| Join | Link plus 6-character code, join with a first name or "Anonymous", no account for attendees |
| Presence | One-tap reactions: agree, question, "lost me", "too fast", "can we move on" |
| Questions | Ask (named or anonymous), upvote, host marks answered |
| Moments | Host-launched polls, word clouds, 1-5 pulse checks, quick recall quizzes (~10 s each) |
| Games | Buzzword bingo (self-marked, host-editable word list), "Will this run over?" predictions |
| Focus | Host "Focus moment" button: pauses all games and moments for everyone, one tap to resume |
| Game windows | Games run only inside host-set windows (for example a break block at 38:00), or when the host starts one |
| Personal | Private notepad with action-item capture, exportable; private points |
| Host dashboard | Room pulse (aggregate), question queue, moment launcher, post-meeting summary |
| Recap | Attendee personal recap; host summary |

### Out (explicitly)

- Speaker detection, "who spoke", transcription, name-mention detection
- Platform integrations (Meet, Zoom, Teams, Zoho add-ons)
- Leaderboards, per-person idle or focus tracking, attention scoring
- Persistent accounts, recurring-meeting history, SSO
- Video, audio, screen share

These are Phase 2 candidates. The Phase 1 design must not block them.

## 4. Host flow

1. **Create.** Pick a template (standup, all-hands, review, workshop) or blank. Optionally paste an agenda with times. Engage suggests moments and game windows from the agenda.
2. **Share.** Engage shows the link, the code, and a ready-to-paste chat message.
3. **Run.** Host console shows the room pulse, question queue and a moment launcher. A "quiet mode" auto-fires standard pulse checks at set times so the host can do nothing and still get value.
4. **Respond.** When engagement dips, Engage suggests an action (pulse check, break, ask the room a question). The host confirms with one tap.
5. **Close.** Host summary: engagement over time, poll results, top questions, unanswered questions, bingo and prediction outcomes.

## 5. Attendee flow

1. Open link, enter a first name or choose Anonymous. A single line shows what the host can see.
2. One screen: current moment (if any), reaction bar, ask a question, notepad tab, Engage panel (bingo, predictions, private points).
3. When the host launches a moment, a gentle visual cue appears. Sound is off by default.
4. When the host starts a Focus moment, games and prompts pause and a banner explains why.
5. After the meeting: a personal recap with notes, action items and answered questions.

## 6. What the host sees

**Always on (aggregate):**

- Participants joined versus invited
- **Room engagement**: share of participants with at least one Engage action in the last 5 minutes
- Engagement over time, with dips highlighted
- Reaction volume, including "lost me" and "too fast" spikes
- Poll and pulse results
- Question queue ranked by upvotes

**Named, only for things the attendee chose to do:**

- Who asked a question or answered a poll, unless they chose Anonymous

**Never in Phase 1:**

- Who is idle, who is quiet, time on tab, per-person engagement rankings

### The "quiet" nudge, redesigned

The original mockup showed "3 people haven't spoken in 40 minutes." Engage can't measure speech, and naming quiet people is the most adoption-risky element. Phase 1 version:

- Host sees an aggregate: "Participation has dropped over the last 10 minutes. Try a pulse check or open the floor?"
- If the host sends an invitation, it goes to **everyone** as a prompt ("Share your view on the next topic"), not to chosen individuals.
- Optional per-meeting setting for a named "haven't participated in Engage" list is **off by default** and, if enabled, is disclosed to attendees at join.

## 7. Game and interaction rules

- Each prompt takes 10 seconds or less and is skippable with no penalty.
- No game requires attention that competes with the speaker. Bingo is passive. Predictions resolve later.
- Points are private to the attendee. No public ranking.
- Games stay inside host-set windows or host-started moments. A Focus moment pauses everything.
- Bingo is self-marked, so players have to listen to the meeting. This makes it an attention aid, not a distraction.
- Reduced-motion and sound-off defaults. No flashing or confetti during the meeting.

## 8. Privacy and trust requirements

- Plain-language disclosure screen at join, listing what the host sees.
- Anonymous participation is supported for questions and polls.
- Data retention: defined per meeting, with deletion on request. Specific periods are an open question (below).
- No audio, video or screen capture in Phase 1.
- Host cannot export per-person participation unless the named-participation setting was on and disclosed.

## 9. Success metrics for the first three pilot meetings

| Metric | Target to learn from |
|---|---|
| Join rate | Share of invited who open the link |
| Participation rate | Share of joined who take at least one action |
| Repeat intent | Attendees who say they would use it again |
| Host effort | Host taps per meeting, host-reported effort |
| Distraction | Attendee survey: "Did Engage pull you out of the meeting?" |

Decision rule: if participation is high and distraction is low, Phase 1 works. If participation is low, fix interactions before adding features.

## 10. Open questions

1. **Buyer.** Team lead, HR/L&D, or exec sponsor? This decides how much host visibility is acceptable.
2. **Device.** Decided: laptop-first. The attendee view is built for a half-width browser window beside the meeting and collapses to tabs when narrow.
3. **Retention and compliance.** How long is data kept, and do enterprise buyers need admin controls or SSO before piloting?
4. **Meeting size.** Is the target 5 to 15 people, or 200? Large meetings need question moderation and reaction rate limits.
5. **Named participation.** Is the opt-in named list needed at all, or does it risk adoption?
6. **Phase 2 speaker data.** Which route: platform apps or SDKs, or audio capture with consent? This decides when "who spoke" becomes possible.
7. **Agenda input.** Manual paste, calendar import, or both?

## 11. Build order inside Phase 1

1. Join flow, reactions, question queue, host room pulse.
2. Polls, pulse checks, Focus moment, recap.
3. Bingo, predictions, private points, game windows.
4. Notepad and export, templates, quiet-mode auto-pulse.

Each step is usable on its own, so a pilot can start after step 1 or 2.
