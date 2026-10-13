# Build status

Last updated: 13 October 2026. Tracks progress against `docs/architecture/engineering-plan.md`.

**Verification.** 38 automated tests pass (domain, protocol over WebSocket, pages and headers). A browser test with a host and two attendees passes 20 checks with no console errors. Lint is clean. Everything below marked "Done" has passed those checks unless noted.

## Done in this round

| Plan item | What was built | Notes |
|---|---|---|
| **E7** Recall check | A "Recall check" prompt with "Missed that", counted separately from wrong answers. 20 second default. One per 15 minutes unless the host launches anyway. Group split for attendees, host-only reading | Replaces the old recall quiz in the host UI. Topic bingo and closing takeaway are not built |
| **E6** Mini window | A small window opened from the Engage tab. Pill and card states, first-use note about sharing the entire screen, "Open for quick checks" setting, Escape to shrink, tab-title dot when something waits | **Uses Document Picture-in-Picture where the browser has it, and a small pop-up window otherwise.** The pop-up path is tested in a browser. The picture-in-picture path is written but **has not been tested**, because it needs a headed Chrome or Edge with a user click. This is spike SP-1 |
| **E6** Presenting mode | One switch closes the mini window, counts prompts that arrive, and queues nothing. The off switch is in the Engage tab | Client-side only. The server is not told |
| **E8** Agenda and coach | Agenda at creation or in the console, chart split by topic, per-topic averages, dip suggestions that name the topic, and a host-only coach summary (dip and recovery, recall result, open questions, confusion, uneven participation, one suggestion for next time) | Templates are not built |
| **ENG-004** Host link | "Copy private host link" reopens the host console on another browser. The token is read from the link and removed from the address bar | Stop-gap until host accounts |
| **ENG-003** Privacy and survey | Plain-language privacy page linked from join, landing and recap. Survey link set by `ENGAGE_SURVEY_URL` | |
| **E0** Deployment files | Dockerfile, Render blueprint, health check, graceful shutdown, proxy-aware rate limits, deploy guide | **Not deployed.** Needs your hosting account. Docker build not run (no Docker daemon here). The files it copies were checked by running a copy |
| **ENG-007, 008** CI and lint | GitHub Actions workflow (lint, tests, dependency audit, container build), ESLint | The workflow has not run on GitHub yet |
| Accessibility | Three contrast defects fixed in the stylesheet (earlier in this project) | No formal audit yet |

## Not started

| Plan item | Why it matters |
|---|---|
| E1 TypeScript and workspace layout | Protocol safety. Planned for sprint 2 |
| E2 Shared message schemas and validation | Same |
| E3 Persistence and recovery | Today a restart ends every meeting. **Biggest remaining risk for pilots** |
| E4 Host accounts | Host access still depends on a private link |
| E5 React rebuild and design system components | The current UI is plain HTML and JavaScript. It works and is tested, but is not the planned structure |
| E9 Security hardening beyond the basics, deletion flow | Host cannot delete a meeting yet. Data is dropped 24 hours after it ends |
| E10 Accessibility audit | Needs a manual screen reader pass |
| E11 Load and chaos tests | Update size and capacity numbers are estimates until measured |
| E12 Instrumentation and dashboards | Pilot metrics come from the host summary and the survey |
| Minimum gap between prompts (FR-7.8), templates, topic bingo, closing takeaway | Lower priority |

## Needs a person

1. **Deploy it.** Create the hosting account and domain (see `docs/deploy.md`).
2. **Test the mini window in a real Chrome or Edge window** and in Safari or Firefox. This confirms or corrects the picture-in-picture path.
3. **Find the pilot hosts** and run the first three meetings.
4. **Create the feedback form** and set `ENGAGE_SURVEY_URL`.

## What to do next

If pilot 1 goes ahead on this build, the next engineering priority is **E3 persistence**, because a restart or deploy during a meeting loses it. Then host accounts (E4) and the TypeScript and protocol work (E1, E2).
