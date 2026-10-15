# Deploying Engage for pilots

This is the pilot setup (engineering plan epic E0). It runs one instance of the app with a small database on a persistent disk. **It has not been deployed yet.** You need to create the hosting account and domain.

## What you need to know first

- **Run exactly one instance.** The database is a file (SQLite) on one disk, and live connections are held in that one process. A second instance would not see the first one's meetings.
- **Meetings survive restarts and deploys.** The server saves each changed meeting every few seconds and when it shuts down, and loads them again when it starts. Clients reconnect on their own. Up to about three seconds of the latest activity can be lost in a crash. Still, schedule deploys outside meeting hours.
- **Set `ENGAGE_DB` to a path on a persistent disk.** Without it the server uses memory only and a restart loses everything. The Render blueprint mounts a disk at `/data` and sets `ENGAGE_DB=/data/engage.db`. Disks need a paid Render plan.
- **Retention.** Meetings without a host account are deleted 24 hours after they end (`ENGAGE_RETENTION_HOURS`). Meetings owned by a host account are kept 30 days (`ENGAGE_ACCOUNT_RETENTION_DAYS`). A host can delete a meeting any time.
- **Back up `/data/engage.db`** (Render disk snapshots, or copy the file) if the results matter to you. It holds hashed access tokens and host account password hashes (scrypt), never plaintext.
- **Turn on `TRUST_PROXY`** behind any hosting proxy. Without it every visitor shares the proxy's address, and the limit of 30 new meetings per hour applies to everyone together.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on. Most platforms set this for you |
| `TRUST_PROXY` | unset | Set to `1` behind a proxy so rate limits use the visitor's address |
| `ENGAGE_SURVEY_URL` | unset | Link to a short feedback form. Shown on the host summary and attendee recap |
| `ENGAGE_SAMPLE_MS` | `30000` | How often the engagement chart samples. Leave at the default in production |
| `ENGAGE_DATABASE_URL` | unset | Postgres connection string (Render Postgres, Supabase, any Postgres). Preferred when you have no persistent disk. Takes priority over `ENGAGE_DB` |
| `ENGAGE_GOOGLE_CLOUD_PROJECT_NUMBER` | unset | Google Cloud project number for the Meet add-on. See `docs/google-meet.md` |
| `ENGAGE_DB` | unset | Path of the SQLite file, for example `/data/engage.db`. Unset means memory only |
| `ENGAGE_PUBLIC_URL` | unset | Your public address, such as `https://engage.example.com`. Used in QR codes, and turns on the `Secure` flag for sign-in cookies. Set it in production |
| `ENGAGE_RETENTION_HOURS` | `24` | How long ended meetings without an account are kept |
| `ENGAGE_ACCOUNT_RETENTION_DAYS` | `30` | How long ended meetings owned by an account are kept |

## Option A: Render (suggested for pilots)

1. Push this repository to your GitHub account.
2. In Render, choose **New, Blueprint**, and select the repository. `render.yaml` describes the service.
3. Set `ENGAGE_SURVEY_URL` and `ENGAGE_PUBLIC_URL` when asked. The blueprint creates a 1 GB disk at `/data`.
4. Add your domain under **Settings, Custom Domains**. TLS is automatic.
5. Confirm the health check path `/healthz` is green, then open the site and run a test meeting with two browsers.

## Option B: any container host

```
docker build -t engage .
docker run -p 3000:3000 -e TRUST_PROXY=1 -e ENGAGE_DB=/data/engage.db -v engage-data:/data engage
```

The container starts as root only to make the data folder writable, then runs the app as the unprivileged `node` user (`docker-entrypoint.sh`, not yet run here). It has a built-in health check on `/healthz`. The container build is described in `Dockerfile` and runs in the CI workflow, but it has **not been built or run in this environment**, because no Docker daemon was running there. The file set and start-up were checked by copying exactly what the Dockerfile copies and running that copy.

## Before the first pilot meeting

- [ ] Open the site over HTTPS on a laptop and a phone.
- [ ] Start a meeting, restart the service from the dashboard, and confirm the host console and a joined attendee come back.
- [ ] Open "Show on screen" and scan the QR code with a phone. Check it opens the join page.
- [ ] Run a meeting with at least three browsers. Try the mini window in Chrome and in Safari or Firefox.
- [ ] Set an uptime check on `/healthz` with an alert to a chat channel.
- [ ] Agree who is on call during pilot meetings.
- [ ] Create the feedback form and set `ENGAGE_SURVEY_URL`.
- [ ] Read `public/privacy.html` and confirm it is accurate for your pilot.

## Rolling back

Redeploy the previous image or commit. Meetings are kept on the disk. A rollback to a build from before persistence would not read the database, so avoid rolling back past this release once meetings are stored.
