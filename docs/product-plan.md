# Engage Product Plan

Status: draft. Builds on `docs/phase1-spec.md`. Still stack-neutral: Section 8 lists the technical decisions to make, with the criteria for each.

## 1. Product in one paragraph

Engage is an engagement layer that sits beside any video meeting. The host creates a link, pastes it into the meeting chat, and attendees take small, optional actions on a second screen. It is not a video platform. It exists so that in a 1 to 2 hour corporate meeting, people contribute throughout instead of for about 5 minutes, and nobody feels monitored.

## 2. Assumptions I'm planning around

You asked me to choose what is best for corporate use. These defaults can be changed, and each one is tied to an open question in the spec.

| Question | Planning default | Why |
|---|---|---|
| Buyer | Team leads and meeting owners first (bottom-up). HR/L&D and exec sponsors come later. | Fastest path to real usage. No procurement needed to try it. |
| Device | **Laptop-first** (decided). Attendees use a half-width browser window beside the meeting. Phones work but are secondary. | Engage is a platform product used during laptop meetings. The layout collapses to tabs when the window is narrow. |
| Meeting size | Designed for 5 to 50, tested to 200 | Most corporate meetings fall here. Large meetings need moderation. |
| Retention | Raw data deleted 30 days after the meeting, summaries kept until the host deletes them | Defensible default for enterprise review. Configurable later. |
| Named participation | Off by default | Protects trust. Revisit after pilots. |
| Speaker data | Phase 2, through platform integrations | Not measurable in a web-only app. |

## 3. Users

| User | Wants | Fears | Engage must |
|---|---|---|---|
| **Host / meeting owner** | A room that stays engaged, with no extra work | Wasted time, a tool that breaks mid-meeting | Start in one tap, run on its own, fail safely |
| **Attendee** | A reason to stay present, small fun, a useful notepad | Being tracked or judged, being pulled out of the meeting | Be optional, private by default, never block anything |
| **Senior sponsor** | Meetings that produce decisions and visible participation | Dashboards that become micromanagement | Show aggregate trends, not people |
| **IT / Security** (later) | Safe data handling | Unapproved tools holding sensitive content | Minimal data, clear retention, no recording |

## 4. Roadmap

| Phase | Goal | Contents | Exit criteria |
|---|---|---|---|
| **0. Validate** (2 to 3 weeks) | Prove the idea before building much | Clickable prototype of the two screens, 5 to 8 host interviews, 3 manual "Wizard of Oz" meetings using forms and chat | At least 3 hosts say they would use it again and attendees do not report distraction |
| **1. Companion app MVP** (about 10 to 12 weeks) | Working product for real meetings | Phase 1 spec, in the build order below | 3 live pilot meetings meet the success metrics |
| **1.5. Pilot and harden** (4 to 6 weeks) | Make it trustworthy | Fix pilot findings, privacy review, accessibility, load testing, admin basics | 10+ meetings across 3+ teams, no critical incidents |
| **2. Integrations** | Add what a web app cannot see | Meet, Zoom, Teams add-ons: roster, speaker activity, auto-start in the meeting. Consent-based audio or transcript for bingo auto-marking. | Per-platform decision after pilot data |
| **3. Organization layer** | Make it buyable | SSO, admin console, recurring-meeting history, org-level trends, retention controls | First paid org |

Timelines assume a team of about 3: one full-stack engineer, one front-end/product engineer, one designer/PM part-time. Adjust for your team.

## 5. Phase 1 delivery plan

Each milestone is usable on its own, so pilots can start after M2.

### M0. Foundations (week 1 to 2)
- Resolve the technical decisions in Section 8.
- Design system basics, brand, accessibility baseline.
- Environments and deployment, CI, error tracking, basic analytics.
- Meeting and participant data model.
- **Done when:** a "hello meeting" can be created and joined on a laptop, with a phone as a secondary check.

### M1. Core loop (week 2 to 5)
- Create meeting, link and code, paste-ready chat message.
- No-login join with name or Anonymous, plus the "what the host sees" disclosure.
- Reaction bar, question queue with upvotes, host marks answered.
- Host room pulse: joined count, room engagement, engagement over time, reaction volume.
- **Done when:** a host can run a 30-minute meeting with 10 people using reactions and questions only.

### M2. Moments and control (week 5 to 8)
- Host-launched polls, word clouds, 1 to 5 pulse checks, recall quizzes.
- Focus moment: one tap pauses prompts and games for everyone.
- Dip detection with a suggested action for the host.
- Post-meeting host summary and attendee recap.
- **Pilot meetings start here.**

### M3. Games and personal value (week 8 to 11)
- Buzzword bingo (self-marked, editable word list), "Will this run over?" predictions.
- Game windows tied to the agenda, private points.
- Private notepad with action items and export.
- **Done when:** games run only in host-set windows and never during a Focus moment.

### M4. Polish and quiet mode (week 11 to 12)
- Templates (standup, all-hands, review, workshop).
- Quiet mode: auto pulse checks with no host action.
- Reduced motion, sound-off defaults, screen reader pass.
- **Done when:** a host can start a meeting with one tap and get a useful summary with no other action.

## 6. Key product rules (carry through every milestone)

These come from the spec and should be treated as review criteria for every feature.

1. Engage never competes with the speaker. Anything that needs sustained attention is out.
2. Engage only reports what it can measure. No inferred "idle" or "speaking."
3. Everything the host can see is disclosed to attendees at join.
4. No individual rankings or public leaderboards.
5. Every prompt is skippable with no penalty.
6. A host can pause everything in one tap.

## 7. Metrics

| Metric | Definition | Target for pilots |
|---|---|---|
| Join rate | Joined divided by invited | Above 60% |
| Participation rate | Share of joined with at least one action | Above 70% |
| Participation spread | Share of actions made by the top 20% of participants | Falling over a meeting (more even is better) |
| Repeat intent | "I would use this again" | Above 70% of attendees, all pilot hosts |
| Distraction | "Engage pulled me out of the meeting" | Below 10% yes |
| Host effort | Host taps per meeting after setup | Under 10 |
| Reliability | Meetings with no host-visible failure | 95% or better |

Targets are starting hypotheses, not facts. Set them for real after Phase 0.

## 8. Technical decisions to make in M0

I haven't picked a stack. These are the decisions, with the criteria that should drive each.

| Decision | Criteria |
|---|---|
| **Realtime channel** (how reactions, polls, and pulse reach everyone live) | Handles 200 participants per meeting, reconnects after dropped phone connections, low latency under 1 second |
| **Hosting and data region** | Where enterprise customers' data may live, cost at idle, simple to run for a small team |
| **Frontend delivery** | Laptop-first, usable in a half-width window, fast first load on bad networks, installable as a web app without an app-store release |
| **Storage** | Short-lived meeting data with automatic deletion, plus durable summaries |
| **Identity** | Anonymous participants without accounts, host sign-in with email or work login |
| **Abuse and moderation** | Rate limits on reactions and questions, host can remove a question or a participant |
| **Observability** | Live meeting health visible to the team, privacy-safe logs |

Constraints that apply regardless of stack: no audio or video capture, personal data minimized, join links unguessable and expiring, and everything deletable on request.

## 9. Conceptual data model

Not a schema, just the objects the product needs.

- **Meeting**: host, title, optional agenda with times, settings (named participation, game windows), status.
- **Participant**: display name or anonymous, joined time, device type. No account required.
- **Action**: participant, type (reaction, question, upvote, poll answer, bingo tap, prediction), time, meeting.
- **Moment**: type (poll, pulse, quiz, game), launched by, open and close times, results.
- **Question**: text, author or anonymous, upvotes, answered flag.
- **Summary**: aggregate results, engagement series, top questions, outcomes.
- **Note** (private): participant, text, action-item flag. Visible only to its author.

Engagement series is derived from Actions: for each interval, the share of participants with at least one Action in the preceding 5 minutes.

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Attendees see Engage as monitoring and ignore it | High | High | Disclosure at join, aggregate-only default, anonymous option, no rankings |
| Hosts forget to launch moments, so there is no value | High | High | Quiet mode, templates, agenda-driven suggestions |
| Second screen is a distraction or doesn't fit single-screen laptops | Medium | High | Half-width window layout, small prompts, Focus moment, measure distraction in pilots |
| Realtime breaks in a big meeting | Medium | High | Load test to 200 before pilots, graceful offline behavior |
| Enterprise security review blocks pilots | Medium | Medium | Minimal data, no recording, short retention, simple privacy summary |
| Gamification feels childish | Medium | Medium | Optional, restrained visuals, corporate-friendly content, host can disable |
| Platform vendors ship similar built-in features | Medium | Medium | Stay platform-neutral and focused on engagement across tools |

## 11. Phase 0 plan (start here)

1. Turn the two mockups into a clickable prototype of the host console and attendee screen.
2. Interview 5 to 8 meeting hosts: what they do today, what they would do with the pulse view, how they feel about named data.
3. Run 3 manual meetings: share a form or chat poll link, hand-edit a live pulse sheet. Measure participation and distraction.
4. Decide go or no-go and finalize the defaults in Section 2.

## 12. Decisions I need from you

1. Confirm or change the planning defaults in Section 2, especially the buyer. The device is now decided: laptop-first.
2. Team size and timeline: is the 10 to 12 week estimate realistic for you?
3. Do you have a pilot company or hosts lined up for Phase 0?
4. Brand and name: decided, the product is called Engage.
