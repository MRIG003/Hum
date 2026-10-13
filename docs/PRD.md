# Engage: Product Requirements Document

| | |
|---|---|
| **Product** | Engage |
| **Document status** | Draft v0.1, for review |
| **Date** | 13 October 2026 |
| **Scope** | Phase 1 in detail. Phases 1.5 to 3 at roadmap level |
| **Primary device** | Laptop, in a second browser window beside the meeting |
| **Related documents** | `docs/phase1-spec.md`, `docs/product-plan.md`, `docs/engage-product-plan-report.pdf`, `docs/design/Engage-UX-UI-Design.pdf`, `docs/architecture/Engage-Technical-Architecture.pdf`, `docs/architecture/Engage-Engineering-Plan.pdf` |

**How to read the status column.** *Built* means it exists in the current prototype and has been tested. *Planned* means it is a requirement that is not built yet. *Later* means it is deliberately outside Phase 1.

**Priority.** P0 is required for the pilot. P1 is required before wider rollout. P2 is desirable.

---

## 1. Summary

Engage is a meeting engagement layer that runs beside any video meeting (Google Meet, Zoom, Teams, Zoho Meeting). It is not a video platform. The host creates a link and pastes it into the meeting chat. Attendees open it in a second window and take small, optional actions: reactions, questions, polls, quick recall checks and light games. The host sees how the room is doing as a group, with no per-person tracking.

The goal is to turn passive attendees in long corporate meetings into small, frequent contributors, without anyone feeling watched or pulled out of the meeting.

## 2. Problem

In 1 to 2 hour corporate meetings, most attendees take part for about five minutes and sit idle for the rest. Hosts and senior people want everyone engaged. Attendees do not want that engagement to feel like micromanagement.

**Evidence status.** The "five minutes of participation" figure is a working hypothesis from the product brief. We have no measured data yet. Validating it is part of the pilot (Section 14).

**Why existing approaches fall short**

| Approach | Gap |
|---|---|
| Meeting tools' built-in polls and reactions | Host-driven, one-off, no view of participation over time, differs by platform |
| Notetaker bots (for example Read AI) | Observe and score people after the fact. Face and voice analysis creates a feeling of being watched. Little effect during the meeting |
| Standalone polling and quiz tools | Built for events and classrooms, not for working meetings. Heavy to set up, easy to distract |

## 3. Goals and non-goals

### Goals

1. Raise the share of attendees who contribute at least once in a meeting.
2. Spread participation more evenly across the room.
3. Give hosts a live, honest read of the room that leads to action, such as clarifying or taking a break.
4. Do all of this without making attendees feel monitored and without pulling attention from the meeting or the presenter.
5. Work with any meeting tool, with no install and no account for attendees.

### Non-goals (Phase 1)

- A video, audio or screen-sharing platform.
- Recording, transcription or speech analysis.
- Face, voice or body-language analysis.
- Detecting who is speaking, idle, or looking at another window.
- Individual engagement scores, rankings or public leaderboards.
- Platform integrations (Meet, Zoom, Teams apps), calendar integration, SSO, admin console.
- A native mobile app. Phones work but are secondary.

## 4. Users

| User | Needs | Fears | What Engage must do |
|---|---|---|---|
| **Host** (meeting owner, team lead) | A room that stays engaged. Little or no extra work. Safe failure | A tool that breaks mid-meeting. Wasted setup time | Start in one click, run on its own if needed, never block the meeting |
| **Attendee** | A reason to stay present. Small, useful interactions. A private notepad | Being tracked or judged. Being pulled out of the meeting | Be optional, private by default, and quiet |
| **Presenter** (any attendee who is sharing) | No interruptions | Seeing or showing a pop-up while sharing | Provide a presenting mode that shows and queues nothing |
| **Sponsor** (senior leader, HR or L&D) | Meetings that produce decisions. Visible participation | Dashboards that become micromanagement | Show aggregate trends only |
| **IT and security** (later) | Safe data handling | Unapproved tools holding sensitive content | Minimal data, no recording, clear retention |

First buyer assumption: team leads and meeting owners (bottom-up). HR, L&D and executive sponsors follow.

## 5. Principles

These are review criteria for every feature.

1. **The meeting always wins.** One click pauses all prompts and games. Prompts expire and never repeat.
2. **Measure only what Engage can see.** Engagement means actions inside Engage. No guessing about speaking or idleness.
3. **Transparent by default.** Attendees see, before joining, exactly what the host can see.
4. **Aggregate first, never ranked.** Group results only. No leaderboards. Poll answers are never tied to names.
5. **Invitations, not accusations.** Suggestions go to the host. Nudges go to everyone, never to chosen people.
6. **Zero friction.** No account, no install, under 10 seconds to join. The host does almost nothing.
7. **Low pull.** Engage never draws attention on its own. No sound, no notifications, no pop-ups over other windows.

## 6. Key scenarios and user stories

**S1. Host starts a meeting.** As a host, I create a meeting in under 30 seconds and paste one message into the meeting chat so attendees can join.
*Acceptance:* a link, a six-character code and a ready-to-paste chat message are shown. Copy buttons work. No attendee account is needed.

**S2. Attendee joins.** As an attendee, I join with a first name or anonymously and understand what the host can see.
*Acceptance:* the join screen lists what the host can and cannot see before I join. I reach the live view in under 10 seconds. Reopening the link restores my identity.

**S3. Attendee takes part without leaving the call.** As an attendee, I answer a prompt, react or ask a question in one or two clicks.
*Acceptance:* prompts need one click for polls, pulse checks and quizzes. No sound or notification accompanies any prompt.

**S4. Host sees the room and acts.** As a host, I see how engaged the room is and get a suggestion when participation drops.
*Acceptance:* the engagement chart updates at least every 30 seconds. A drop of 20 points or more from the 10-minute peak shows a suggestion with one-click actions. Nothing is sent to attendees until I choose.

**S5. Host pauses everything.** As a host, I pause all prompts and games for everyone at once.
*Acceptance:* one click starts Focus. Attendees see a plain banner. Responses to prompts and game actions are rejected on the server while Focus is on. One click resumes.

**S6. Attendee presents.** As a presenter, I stop Engage from showing or queuing anything on my screen.
*Acceptance (planned):* one click on "I'm presenting" closes the floating window and suppresses all prompts for me until I turn it off. Nothing queues.

**S7. Host reads the outcome.** As a host, I get a summary after the meeting that I can copy or download.
*Acceptance:* the summary has duration, participation, average engagement, how evenly people took part, every prompt's results, top questions and reaction totals.

**S8. Attendee keeps their takeaways.** As an attendee, I keep private notes and action items and download them.
*Acceptance:* notes never leave my device. A Markdown download works.

## 7. Scope by release

| Release | Purpose | Contents |
|---|---|---|
| **Phase 0: Validate** (2 to 3 weeks) | Prove the idea with real hosts before building more | Clickable prototype, 5 to 8 host interviews, 3 manual test meetings |
| **Phase 1: Companion app** (about 10 to 12 weeks) | A working product for real meetings | Section 8. Core is built |
| **Phase 1.5: Pilot and harden** (4 to 6 weeks) | Make it trustworthy | Persistence, host access from any browser, retention, accessibility, load test, privacy review |
| **Phase 2: Integrations** | Add what a web app cannot see | In-meeting apps for the pilot company's meeting tool, speaker and presenter data, calendar-created meetings |
| **Phase 3: Organization layer** | Make it buyable | SSO, admin console, recurring-meeting history, org-level trends |

Estimates assume a team of about three people.

## 8. Functional requirements (Phase 1)

### 8.1 Meeting setup and invite

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-1.1 | Host creates a meeting with a title (up to 80 characters) and an optional expected attendee count | P0 | Built |
| FR-1.2 | Engage shows a join link and a six-character code (letters and digits that avoid look-alikes) | P0 | Built |
| FR-1.3 | Engage offers a ready-to-paste chat message and one-click copy for link and message | P0 | Built |
| FR-1.4 | Host can restart the meeting clock when the meeting actually begins, which also clears the engagement chart | P1 | Built |
| FR-1.5 | Host can reopen the host console from a different browser or device | P1 | Built (private host link, no accounts) |
| FR-1.6 | Templates for common meeting types (standup, all-hands, review, workshop) that preload prompts and game windows | P2 | Planned |
| FR-1.7 | Host enters an agenda with times, and Engage ties the chart to agenda segments | P1 | Built |

### 8.2 Join and identity

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-2.1 | Attendees join from the link or by typing the code. No account | P0 | Built |
| FR-2.2 | Attendee joins with a first name (up to 30 characters) or as Anonymous | P0 | Built |
| FR-2.3 | The join screen lists what the host can see and cannot see, before joining | P0 | Built |
| FR-2.4 | A returning attendee on the same browser keeps their identity, score, bingo card and answers | P0 | Built |
| FR-2.5 | A meeting that has ended cannot be joined. An unknown code shows a clear message | P0 | Built |
| FR-2.6 | Host can remove a participant | P2 | Built (server only, no UI) |
| FR-2.7 | Maximum 500 participants per meeting, with a clear message when full | P0 | Built |

### 8.3 Reactions

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-3.1 | One-tap reactions: Agree, Question, Lost me, Too fast, Move on | P0 | Built |
| FR-3.2 | Each reaction is limited to one per three seconds per person | P0 | Built |
| FR-3.3 | Host sees reaction counts for the last two minutes, never who sent them | P0 | Built |

### 8.4 Questions

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-4.1 | Attendee asks a question (up to 280 characters), named or anonymous | P0 | Built |
| FR-4.2 | Attendees upvote and un-vote. The queue is ordered by answered state, then votes, then time | P0 | Built |
| FR-4.3 | Host marks a question answered or reopens it, and can remove it | P0 | Built |
| FR-4.4 | An anonymous author is never exposed to the host or other attendees, including in data sent to their browsers | P0 | Built, covered by automated test |
| FR-4.5 | Up to 200 questions per meeting | P1 | Built |

### 8.5 Moments (prompts the host launches)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-5.1 | **Poll:** a question with 2 to 6 options. One answer per person | P0 | Built |
| FR-5.2 | **Pulse check:** a 1 to 5 rating. One answer per person | P0 | Built |
| FR-5.3 | **Recall quiz:** a question with 2 to 6 options and one correct answer, revealed after close | P0 | Built |
| FR-5.4 | **Word cloud:** short answers (up to 24 characters), up to three per person | P1 | Built |
| FR-5.5 | Each moment closes automatically after 30 seconds, 1 minute or 2 minutes, or when the host closes it | P0 | Built |
| FR-5.6 | Only one moment is open at a time. Launching another closes the first | P0 | Built |
| FR-5.7 | Attendees see group results only after the host closes a moment. The host sees live results | P0 | Built |
| FR-5.8 | A "Missed that" option on recall quizzes, reported separately from wrong answers | P0 | Built |
| FR-5.9 | Recall check cap: at most one per 15 minutes unless the host overrides | P1 | Built |
| FR-5.10 | Closing takeaway: one minute at the end to pick or write the main takeaway | P2 | Planned |

### 8.6 Room pulse and engagement

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-6.1 | **Room engagement** is the share of connected participants with at least one Engage action in the last 5 minutes. The definition is shown in the product | P0 | Built |
| FR-6.2 | Host sees: room engagement, how many joined people have taken part, and how many are connected (with joined versus expected) | P0 | Built |
| FR-6.3 | An engagement chart samples every 30 seconds and marks pulse checks and floor invitations | P0 | Built |
| FR-6.4 | A dip is a sample at least 20 points below the 10-minute peak and below 70%. Dips are shaded on the chart | P0 | Built |
| FR-6.5 | **Dip suggestion:** with at least four samples, a dip shows the host a suggestion with one-click actions: run a pulse check, open the floor, start a break block | P0 | Built |
| FR-6.6 | **Confusion suggestion:** with at least three people connected, "Lost me" plus "Too fast" in the last two minutes at or above 25% of the room (minimum two) shows a suggestion | P1 | Built |
| FR-6.7 | Suggestions are suppressed for five minutes after the host launches a moment or opens the floor | P1 | Built |
| FR-6.8 | **Open the floor:** a 30-second banner invites everyone, never named individuals, to share a view or question | P1 | Built |
| FR-6.9 | The host never sees who is idle, quiet, or on another window. No such measurement exists | P0 | Built (by design) |
| FR-6.10 | Chart ties dips to agenda segments, for example "dipped during Budget" | P1 | Built |

### 8.7 Focus and presenter safety

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-7.1 | **Focus moment:** one click pauses all prompts and games for everyone. One click resumes | P0 | Built |
| FR-7.2 | While Focus is on, the server rejects moment responses, bingo marks and predictions | P0 | Built, covered by automated test |
| FR-7.3 | Attendees see a plain banner explaining the pause | P0 | Built |
| FR-7.4 | **Floating mini window** (browser picture-in-picture) with three states: pill (default), card, and presenting | P0 | Built |
| FR-7.5 | The pill shows a dot when something is waiting. Prompts never expand it, except the recall check (FR-7.7) | P0 | Built |
| FR-7.6 | **Presenting mode:** one click closes the window and suppresses and discards all prompts for that attendee until turned off | P0 | Built |
| FR-7.7 | The recall check may expand the pill into a compact card for up to 20 seconds, never in presenting mode. *Open decision D2* | P1 | Built |
| FR-7.8 | A minimum gap between prompts, which the host can override | P1 | Planned |
| FR-7.9 | Browsers without picture-in-picture support (Safari, Firefox) fall back to the second-window layout, with a badge in the tab title | P0 | Built |
| FR-7.10 | On first use of the mini window, show a note that sharing the entire screen will show the window to the audience | P0 | Built |

### 8.8 Games

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-8.1 | Games open only inside host-set game windows (start minute and length, up to 10) or when the host opens them | P0 | Built |
| FR-8.2 | **Bingo:** a 3 by 3 card chosen at random from a host-editable word list (9 to 40 words). Self-marked. Marking requires listening | P1 | Built |
| FR-8.3 | **Topic bingo:** the word list is drawn from agenda terms instead of jargon | P2 | Planned |
| FR-8.4 | **Prediction:** a host-set yes/no question, such as "Will this run over?". One tap, resolved later by the host | P0 | Built |
| FR-8.5 | **Points** are private to each attendee. Scoring: question 20, upvote 2, pulse 5, poll 10, word cloud 10, correct quiz 30, bingo square 10, bingo line 50, prediction 5, correct prediction 25 | P1 | Built |
| FR-8.6 | No leaderboard, ranking or public score exists anywhere in the product | P0 | Built (by design) |
| FR-8.7 | Games are never required. Every prompt is skippable with no penalty | P0 | Built |
| FR-8.8 | Buzzword bingo (jargon) is a casual-meeting template only, not the default | P1 | Planned |

### 8.9 Notes and recap

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-9.1 | Private notes and action items live only in the attendee's browser and are never sent to the server | P0 | Built |
| FR-9.2 | Attendee downloads notes and action items as Markdown | P1 | Built |
| FR-9.3 | After the meeting, each attendee sees a personal recap: their action items, their questions, and results of the prompts | P0 | Built |

### 8.10 Host summary and coaching

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-10.1 | Host ends the meeting and gets a summary: duration, participation rate, average engagement, spread of participation, all prompt results, top questions, reaction totals, prediction outcome | P0 | Built |
| FR-10.2 | The host copies the summary as text or downloads it as Markdown | P1 | Built |
| FR-10.3 | **Participation spread** is the share of all actions made by the top 20% of participants. Lower is more even | P1 | Built |
| FR-10.4 | **Host coach summary:** a host-only set of tips after each meeting, such as when engagement dipped, unanswered questions, and one suggestion | P1 | Built |
| FR-10.5 | Compare a meeting to the host's own previous meetings, never to other people | P2 | Planned (needs persistence) |
| FR-10.6 | Send action items and unanswered questions to email or chat tools | P2 | Later |

### 8.11 Automation

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-11.1 | **Quiet mode:** automatic pulse checks every 10, 20, 30 or 45 minutes. A pulse check lasts 45 seconds. Off by default | P1 | Built |
| FR-11.2 | Quiet mode never launches during Focus or while another moment is open | P1 | Built |
| FR-11.3 | Create a meeting from a calendar event and add the Engage link to the invite | P1 | Later (Phase 2) |

### 8.12 Organization layer (later)

| ID | Requirement | Pri | Status |
|---|---|---|---|
| FR-12.1 | Single sign-on and host accounts | P1 | Later (Phase 3) |
| FR-12.2 | Admin console: retention settings, allowed domains, disable features | P1 | Later (Phase 3) |
| FR-12.3 | Recurring-meeting history and org-level aggregate trends | P2 | Later (Phase 3) |
| FR-12.4 | In-meeting apps for Meet, Zoom, Teams. Speaker and presenter data | P1 | Later (Phase 2) |

## 9. Non-functional requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-1 | **Scale:** concurrent participants per meeting | Designed for 5 to 50. Load tested to 200 before wider pilots. Hard cap 500 |
| NFR-2 | **Latency:** time from an action to the host and attendee views updating | Under 1 second at the 95th percentile. The server batches updates every 150 ms |
| NFR-3 | **Reliability:** network drops | Clients reconnect automatically with backoff and restore their identity. No lost attendees on a short drop |
| NFR-4 | **Availability** during meeting hours | 99.5% during pilots. Measured by meetings with no host-visible failure (target 95% or better) |
| NFR-5 | **Join speed** | Under 10 seconds from link click to the live view on a normal connection |
| NFR-6 | **Browsers** | Latest two versions of Chrome, Edge, Safari, Firefox. Mini window requires a Chromium browser |
| NFR-7 | **Accessibility** | WCAG 2.1 AA target. Full keyboard use, visible focus, screen-reader labels, reduced-motion support, no information by colour alone. Partly done: focus rings, labels, reduced motion, and measured colour contrast (three defects fixed, see the design document). No formal audit yet |
| NFR-8 | **Layout** | Laptop-first. Two columns at 860 px and wider, tabs below that. A half-width window on a 1,440 px laptop is 720 px, so the tab layout is the common case beside a meeting. No horizontal scrolling down to 360 px |
| NFR-9 | **Language** | English first. Text kept out of logic to allow translation later |
| NFR-10 | **Observability** | Privacy-safe logs and a live health view for the team. No meeting content in logs |

## 10. Privacy, data and security

### 10.1 Data handled

| Data | Held where | Seen by | Retention (target) | Current prototype |
|---|---|---|---|---|
| Meeting title, settings | Server | Host | 30 days after the meeting | In memory, dropped 24 hours after the meeting ends |
| Participant display name | Server | Host only through their own questions | 30 days | Same as above |
| Actions (reactions, answers, marks) | Server | Host as group counts only | 30 days, then deleted | Same as above |
| Questions | Server | Host and attendees, with name unless anonymous | 30 days | Same as above |
| Summary | Computed from meeting data | Host | Until the host deletes it | Available while the meeting data is kept |
| Notes and action items | Attendee's browser only | Attendee | Until the attendee clears the browser | Built |
| Points, bingo card, predictions | Server | Attendee only (prediction totals to host) | 30 days | Same as above |

Not collected in Phase 1: audio, video, screen content, transcripts, tab focus, IP-based profiles, or any inferred emotion.

### 10.2 Requirements

| ID | Requirement | Pri | Status |
|---|---|---|---|
| PR-1 | Attendees see what the host can see, in plain language, before joining | P0 | Built |
| PR-2 | Anonymous participation is supported for questions and for joining | P0 | Built |
| PR-3 | The server never sends one attendee's points, card, answers or predictions to another | P0 | Built, covered by automated test |
| PR-4 | Poll, pulse and word-cloud answers are shown to the host as group results only | P0 | Built |
| PR-5 | Data retention is defined per meeting and deletable by the host on request | P0 | Planned |
| PR-6 | A named per-person participation list for hosts does not exist. If ever added, it is off by default and disclosed at join | P0 | Built (not present) |
| PR-7 | Join links are unguessable, with codes from a 32-character alphabet, and meetings expire (12 hours live, 24 hours after ending in the prototype) | P0 | Built |
| PR-8 | Host identity is proven by a secret token held by the browser that created the meeting | P0 | Built (single browser only) |
| PR-9 | Security headers on all pages (content security policy, no sniffing, no referrer), rate limits on message volume (25 per second per connection), meeting creation (30 per hour per address), and message size (8 KB) | P0 | Built |
| PR-10 | All user-supplied text is escaped on display | P0 | Built |
| PR-11 | A short privacy summary suitable for enterprise security review | P1 | Built (privacy page) |
| PR-12 | Encryption in transit for all traffic in any hosted environment | P0 | Planned (deployment) |

## 11. UX requirements

**Host console.** One page. From top to bottom: invite card, three room tiles, engagement chart, then a two-column area with moment launcher, current moment results and questions on the left, and reactions, games, and quiet mode on the right. Suggestions appear above the invite card and carry one-click actions.

**Attendee view.** Header with title, clock and private points. Below: banners (Focus, open floor), then "Right now" for the current prompt, quick reactions, and questions. A second tab or column holds games and notes. Narrow windows use tabs. Wide windows use two columns.

**Mini window (planned).**

| State | Content | Trigger |
|---|---|---|
| Pill | About 190 by 46 pixels, with an I'm presenting button. A dot when something is waiting | Default on join |
| Card | The current prompt, reactions, questions | Attendee clicks the pill |
| Presenting | Window closed. Nothing shows or queues | Attendee clicks "I'm presenting" |

**Low-pull rules.** No sound. No browser notifications. No pop-ups over other windows. Prompts expire and never repeat. Quiet mode is off by default. Animations are minimal and respect reduced-motion settings.

**Tone.** Plain and neutral. Games are restrained and optional. No confetti, flashing or timers that create pressure.

## 12. Constraints and assumptions

**Hard constraints of a web-only product**

- A web page cannot see who is speaking or presenting in Meet, Zoom or Teams. These need in-meeting apps (Phase 2).
- The floating mini window uses browser picture-in-picture, which only Chromium browsers support. It also opens only after a user click.
- A floating window can appear on a shared full screen. Users must share a single window or tab. Engage can only warn about this.
- In-meeting apps are built and approved separately for each platform.

**Assumptions to validate**

- Attendees will keep a second window open for a long meeting.
- Hosts will launch prompts, or accept automatic ones.
- A recall check with a "Missed that" option feels safe, not like a test.
- Companies will approve a tool that holds no recordings and little data.

## 13. Success metrics

| Metric | Definition | Starting target |
|---|---|---|
| Join rate | Joined divided by invited (needs expected count) | Above 60% |
| Participation rate | Share of joined people with at least one action | Above 70% |
| Participation spread | Share of actions from the top 20% of people | Falling over a meeting |
| Repeat intent | Survey: "I would use this again" | Above 70% of attendees, all hosts |
| Distraction | Survey: "Engage pulled me out of the meeting" | Below 10% yes |
| Host effort | Host clicks per meeting after setup | Under 10 |
| Reliability | Meetings with no host-visible failure | 95% or better |
| Recall check result | Share correct, share "Missed that" | Tracked, no target in the pilot |

These targets are starting guesses and will be reset after the first pilot meeting.

**Guardrails.** If distraction exceeds 10% or repeat intent falls below 50%, stop adding features and fix the interaction design first.

**Instrumentation.** Count actions by type and meeting, without storing who did what beyond what is already in the meeting. Distraction and intent come from a short survey shown after the meeting, not from tracking.

## 14. Release plan and pilot

**Phase 1 milestones**

| Milestone | Scope | Status |
|---|---|---|
| M0 Foundations | Decisions, deployment, error tracking | Prototype built, deployment not done |
| M1 Core loop | Link, join, reactions, questions, room pulse | Built |
| M2 Moments and control | Polls, pulse, quiz, word cloud, Focus, dip suggestions, summary | Built |
| M3 Games and personal value | Bingo, predictions, game windows, private points, notes | Built |
| M4 Polish | Quiet mode built. Templates, mini window, recall check not yet | Partly built |

**Exit criteria for the pilot**

- Three real meetings run end to end with no host-visible failure.
- Participation, distraction and repeat intent measured using Section 13.
- Decision rule: if participation is high and distraction is low, proceed to hardening. If participation is low, fix the interactions before adding features.

**Phase 1.5 exit criteria.** Ten or more meetings across three or more teams. No critical incidents. Persistence, host access from any browser, retention and deletion, accessibility audit, and a load test to 200 participants completed.

## 15. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Attendees see Engage as monitoring and ignore it | High | High | Disclosure at join, group results only, anonymous option, no rankings |
| Hosts forget to launch moments, so there is no value | High | High | Quiet mode, templates, agenda-driven suggestions, calendar setup |
| The second screen distracts or does not fit | High | High | Low-pull rules, mini window with presenting mode, measure distraction |
| Realtime breaks in a large meeting | Medium | High | Load test to 200 before wider pilots, automatic reconnect |
| Enterprise security review blocks pilots | Medium | Medium | Minimal data, no recording, short retention, privacy summary |
| Games feel childish | Medium | Medium | Optional, restrained, host can disable, recall check as the core |
| Meeting platforms ship similar built-in features | Medium | Medium | Stay platform-neutral and focused on engagement across tools |
| Mini window appears on a shared full screen | Medium | Medium | Warn on first use, presenting mode, in-meeting app later |

## 16. Decisions and open questions

### Decided

| # | Decision |
|---|---|
| D-1 | The product is named Engage |
| D-2 | Laptop-first, as a second window beside the meeting |
| D-3 | Engage measures only actions inside Engage |
| D-4 | The host sees group results, never rankings |
| D-5 | Floating mini window with a minimised state is the next layout |
| D-6 | Prototype stack: Node, WebSocket, plain HTML and JavaScript |

### Open

| # | Question | Recommendation |
|---|---|---|
| D1 | Final game set | Recall check and prediction as core. Topic bingo and closing takeaway optional |
| D2 | May the recall check expand the mini window on its own? | Yes, for up to 20 seconds, never in presenting mode |
| D3 | Are the presenting button plus Focus enough until in-meeting apps exist? | Yes for the pilot |
| D4 | Which meeting tool does the first pilot company use? | Decides the first in-meeting app |
| D5 | Who are the first pilot hosts, and what is the real team size? | Needed to confirm the timeline |
| D6 | Retention period and enterprise requirements | 30 days with host deletion, then review with the first customer |
| D7 | Is a named participation view ever needed? | No for Phase 1 |

## 17. Out of scope for Phase 1

Recording or transcription of any kind. Face, voice or tab-focus tracking. Per-person scores or rankings. Public leaderboards. Platform apps. Calendar integration. SSO and admin. Native mobile apps. Cross-meeting analytics. Languages other than English.

## 18. Appendix

### A. Glossary

| Term | Meaning |
|---|---|
| Moment | Any prompt the host launches: poll, pulse check, recall quiz, word cloud |
| Pulse check | A 1 to 5 rating question |
| Recall check | A quiz question about what was just said, used to see whether the message landed |
| Focus moment | A host action that pauses all prompts and games for everyone |
| Open the floor | A host action that invites everyone to share a view for 30 seconds |
| Game window | A time range in which games open automatically |
| Room engagement | Share of connected people with at least one action in the last 5 minutes |
| Participation spread | Share of all actions made by the top 20% of participants |
| Pill, card | The collapsed and expanded states of the floating mini window |

### B. Learning from Read AI

Read AI joins meetings as a bot, records them, and infers engagement and sentiment from faces, voices and talk time (per third-party reviews and its own pages, with no independent check of accuracy). Engage borrows the ideas of calendar-driven setup, highlights tied to key moments, private coaching, benchmarks against the user's own history, and follow-up to chat and email. It avoids face and voice analysis, per-person scores shown to others, a single opaque score, and a bot that records by default.

### C. Prototype limits (as of this version)

Meetings are held in server memory and a restart ends them. The host console works only from the browser that created the meeting. There is one server process. There is no deployment, accounts, or admin controls. The accessibility pass and load test have not been done. 26 automated tests pass.
