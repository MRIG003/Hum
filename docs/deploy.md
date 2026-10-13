# Deploying Engage for pilots

This is the pilot setup (engineering plan epic E0). It runs one instance of the app. **It has not been deployed yet.** You need to create the hosting account and domain.

## What you need to know first

- **Run exactly one instance.** Meetings live in the server's memory. A second instance would not see the first one's meetings, and a restart ends every live meeting.
- **Schedule deploys outside meeting hours.** On a deploy, the server closes its connections and clients reconnect, but meetings in progress are lost.
- **Meeting data is dropped 24 hours after a meeting ends.** There is no database yet.
- **Turn on `TRUST_PROXY`** behind any hosting proxy. Without it every visitor shares the proxy's address, and the limit of 30 new meetings per hour applies to everyone together.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on. Most platforms set this for you |
| `TRUST_PROXY` | unset | Set to `1` behind a proxy so rate limits use the visitor's address |
| `ENGAGE_SURVEY_URL` | unset | Link to a short feedback form. Shown on the host summary and attendee recap |
| `ENGAGE_SAMPLE_MS` | `30000` | How often the engagement chart samples. Leave at the default in production |

## Option A: Render (suggested for pilots)

1. Push this repository to your GitHub account.
2. In Render, choose **New, Blueprint**, and select the repository. `render.yaml` describes the service.
3. Set `ENGAGE_SURVEY_URL` when asked.
4. Add your domain under **Settings, Custom Domains**. TLS is automatic.
5. Confirm the health check path `/healthz` is green, then open the site and run a test meeting with two browsers.

## Option B: any container host

```
docker build -t engage .
docker run -p 3000:3000 -e TRUST_PROXY=1 engage
```

The image runs as a non-root user and has a built-in health check on `/healthz`. The container build is described in `Dockerfile` and runs in the CI workflow, but it has **not been built or run in this environment**, because no Docker daemon was running there. The file set and start-up were checked by copying exactly what the Dockerfile copies and running that copy.

## Before the first pilot meeting

- [ ] Open the site over HTTPS on a laptop and a phone.
- [ ] Run a meeting with at least three browsers. Try the mini window in Chrome and in Safari or Firefox.
- [ ] Set an uptime check on `/healthz` with an alert to a chat channel.
- [ ] Agree who is on call during pilot meetings.
- [ ] Create the feedback form and set `ENGAGE_SURVEY_URL`.
- [ ] Read `public/privacy.html` and confirm it is accurate for your pilot.

## Rolling back

Redeploy the previous image or commit. Live meetings end during a rollback.
