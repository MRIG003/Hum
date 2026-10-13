# Engage

Engage is a meeting engagement layer that runs beside any video meeting (Google Meet, Zoom, Teams, Zoho). It is not a video platform. The host creates a link, pastes it into the meeting chat, and attendees open it in a second browser window. No sign-up.

This repo holds the Phase 1 companion app. See `docs/phase1-spec.md` and `docs/product-plan.md` for the product thinking.

## Run it

```
npm install
npm start          # http://localhost:3000
npm run check      # lint and all tests
```

Needs Node 20 or newer. There is no build step.

Settings (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `TRUST_PROXY` | unset | Set to `1` behind a hosting proxy so rate limits use the visitor's address |
| `ENGAGE_SURVEY_URL` | unset | Feedback form link, shown on the host summary and attendee recap |
| `ENGAGE_SAMPLE_MS` | `30000` | Engagement chart sampling. Lower it (for example `2000`) to see the chart move in a demo |

To deploy for a pilot, see `docs/deploy.md`. For what is built and what is not, see `docs/STATUS.md`.

## Try it in two minutes

1. Open `http://localhost:3000` and create a meeting. Add an agenda if you like (one topic per line with minutes).
2. Copy the link and open it in two or three other browser windows (private windows count as separate people).
3. In an attendee window, join, react, ask a question, answer a poll. Click **Mini window** to open the small floating window, and **I'm presenting** to close it.
4. In the host console, launch a **Recall check** (people can answer "Missed that"), open games, press **Focus moment**, then **End meeting** to see the summary and the private coach summary.

## What is in Phase 1

**Host:** invite link, code and chat message; private host link; agenda; room pulse and engagement chart split by topic, with dip detection and suggestions; polls, pulse checks, recall checks (with "Missed that" and a 15 minute cap), word clouds; question queue; reaction counts; game windows, bingo and a yes/no prediction; Focus moment; quiet mode; post-meeting summary and a host-only coach summary.

**Attendee:** no-login join with a disclosure of what the host can see; reactions; questions with upvotes and an anonymous option; answering prompts; bingo and predictions with private points; private notes and action items kept only in the browser; a small floating mini window (picture-in-picture where the browser supports it, a small pop-up elsewhere) with a presenting switch; personal recap.

## Design rules

- The meeting always wins. A host can pause every prompt and game with one click (Focus moment).
- Engage only reports what it can measure: actions taken inside Engage. It does not guess who is speaking or idle.
- The host sees group results. Poll answers are never tied to names, and anonymous questions never reveal the author.
- Points, bingo cards, predictions and notes are private to each attendee.

## Layout

```
server/meeting.js   Meeting state and rules (no I/O, fully unit tested)
server/index.js     HTTP, static files, WebSocket wiring, rate limits
public/             Plain HTML, CSS and ES modules (no build). mini.js is the floating window
test/               Unit tests and WebSocket integration tests
docs/               Spec, plan, PRD, report
docs/design/        UX/UI design package and clickable prototype
docs/architecture/  Technical architecture, engineering plan, diagrams
```

## Known limits (prototype)

- Meetings live in server memory. Restarting the server ends all meetings. Raw data is dropped 24 hours after a meeting ends.
- The host is identified by a token. "Copy private host link" lets the host reopen the console elsewhere. There are no accounts yet.
- The picture-in-picture version of the mini window has not been tested in a real Chrome or Edge window. The pop-up version is tested.
- One server process only. Scaling out needs a shared store and a pub/sub layer.
- No accounts, SSO, or admin controls yet. See the roadmap.
