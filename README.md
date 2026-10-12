# Engage

Engage is a meeting engagement layer that runs beside any video meeting (Google Meet, Zoom, Teams, Zoho). It is not a video platform. The host creates a link, pastes it into the meeting chat, and attendees open it in a second browser window. No sign-up.

This repo holds the Phase 1 companion app. See `docs/phase1-spec.md` and `docs/product-plan.md` for the product thinking.

## Run it

```
npm install
npm start          # http://localhost:3000
npm test
```

Needs Node 20 or newer. There is no build step.

Useful settings:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `ENGAGE_SAMPLE_MS` | `30000` | How often the engagement chart takes a sample. Lower it (for example `2000`) to see the chart move in a demo. |

## Try it in two minutes

1. Open `http://localhost:3000`, create a meeting. You land on the host console.
2. Copy the link and open it in two or three other browser windows (use private windows so each is a separate person).
3. In an attendee window, join with a name or anonymously, send reactions, ask a question, answer a poll.
4. In the host console, launch polls, open games, press **Focus moment**, then **End meeting** to see the summary.

## What is in Phase 1

**Host:** invite link, code and paste-ready chat message; room pulse (engagement, who took part, connected); live engagement chart with dip detection and suggested actions; polls, pulse checks, recall quizzes, word clouds with auto-close; question queue; reaction counts; game windows, buzzword bingo, yes/no prediction; Focus moment; quiet mode (automatic pulse checks); post-meeting summary you can copy or download.

**Attendee:** no-login join with a disclosure of what the host can see; reactions; questions with upvotes and an anonymous option; answer moments; bingo and predictions with private points; private notes and action items kept only in the browser; personal recap.

## Design rules

- The meeting always wins. A host can pause every prompt and game with one click (Focus moment).
- Engage only reports what it can measure: actions taken inside Engage. It does not guess who is speaking or idle.
- The host sees group results. Poll answers are never tied to names, and anonymous questions never reveal the author.
- Points, bingo cards, predictions and notes are private to each attendee.

## Layout

```
server/meeting.js   Meeting state and rules (no I/O, fully unit tested)
server/index.js     HTTP, static files, WebSocket wiring, rate limits
public/             Plain HTML, CSS and ES modules (no build)
test/               Unit tests and a WebSocket integration test
docs/               Product spec and plan
```

## Known limits (prototype)

- Meetings live in server memory. Restarting the server ends all meetings. Raw data is dropped 24 hours after a meeting ends.
- The host is identified by a token stored in the browser that created the meeting. Opening the host console from another browser is not supported yet.
- One server process only. Scaling out needs a shared store and a pub/sub layer.
- No accounts, SSO, or admin controls yet. See the roadmap.
