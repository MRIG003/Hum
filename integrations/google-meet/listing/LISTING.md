# Engage: Google Workspace Marketplace listing

Updated 29 October 2026 for the new design, logo and address (https://engage.neuronlab.in). Copy these values into the Google Cloud console, project "Engage" (project number 124557177750). Google's field names may differ slightly from the ones below.

## What Google rejected before, and how this version handles it

| Google's reason (15 October 2026) | How this listing handles it |
|---|---|
| Attribution for Google trademarks: a ™ after each Google product name in the descriptions, plus a footnote | Every "Google Meet" below reads "Google Meet™". The footnote is the last line of the detailed description. The app name stays plain "Engage" |
| Screenshots must be 1280 x 800, readable, show the real app and how to use it, with no browser or operating-system windows | Five new 1280 x 800 screenshots. Each shows the real Engage side panels with a one-line caption and nothing else (see Images) |

## Step 1: Meet add-on deployment

Google Cloud console, **Google Workspace Add-ons API**, then **Alternate runtimes** (or **Deployments**). Edit the Engage deployment, or create one, and paste in `../deployment.json`:

| Field | Value |
|---|---|
| Logo URL | https://engage.neuronlab.in/img/engage-128.png |
| Side panel URL | https://engage.neuronlab.in/meet/panel |
| Add-on origins | https://engage.neuronlab.in |
| Screen sharing | Off |

Install the deployment for your own account and try it in a real Meet call before you submit. Check that the host panel and a second account's participant panel both open.

## Step 2: OAuth consent screen

| Field | Value |
|---|---|
| App name | Engage |
| User support email | engage2028@gmail.com |
| App logo | `icon-128.png` |
| App home page | https://engage.neuronlab.in/ |
| Privacy policy | https://engage.neuronlab.in/privacy.html |
| Terms of service | https://engage.neuronlab.in/terms.html |
| Authorised domain | neuronlab.in |
| Developer contact | engage2028@gmail.com |
| Scopes | None. Engage requests no Google user-data scopes |

Google requires the authorised domain to be verified in **Google Search Console** by the same Google account that owns the project. Add `neuronlab.in` as a Domain property there, and add the TXT record it gives you in Cloudflare DNS.

## Step 3: Marketplace SDK, App configuration

| Field | Value |
|---|---|
| App visibility | Public |
| Installation settings | Individual + admin install |
| App integration | Google Workspace add-on, using the deployment from step 1 |
| Developer links | The four links under Links below |

## Step 4: Marketplace SDK, Store listing

### Basics

| Field | Value |
|---|---|
| Application name | Engage |
| Developer name | Engage |
| Developer email | engage2028@gmail.com |
| Category | Productivity |
| Language | English |
| Pricing | Free |

### Short description

```
Live polls, questions, reactions and quick games in the Google Meet™ side panel.
```

### Detailed description

Paste everything in this block, including the last line.

```
Engage helps meeting hosts keep people involved, without getting in the way.

Start Engage from the Activities panel in Google Meet™. The host picks a tool from one menu in the side panel. Everyone in the call answers in their own panel, then goes back to the meeting.

What the host can do
- Ask the room: polls, pulse checks, recall checks and word clouds. Pick a ready-made question or write your own, and add options as you would in a form.
- Take questions from the room, with votes, pinning and merging of duplicates.
- Open the floor for a set time: each person can send each reaction once.
- Run a one-minute quick game: colour tap, even or odd, quick maths, biggest or smallest, odd one out. Each person sees only their own score.
- See engagement as the meeting goes, and who has had no activity for a few minutes.
- Get a coach summary after the meeting, a CSV export, and an emailed summary for signed-in hosts.

Calm by design
- No sound and no pop-ups over what you are sharing. A Focus moment pauses everything.
- Engage only sees what people do inside Engage. It does not record audio, video or your screen, and it does not measure attention.
- Everyone is told what the host can see before they join.
- Meetings end on their own when everyone has left.

Try it without a meeting at https://engage.neuronlab.in/try

Google Meet™ is a trademark of Google LLC.
```

### Links

| Field | Value |
|---|---|
| Application website | https://engage.neuronlab.in/ |
| Privacy policy URL | https://engage.neuronlab.in/privacy.html |
| Terms of service URL | https://engage.neuronlab.in/terms.html |
| Support URL | https://engage.neuronlab.in/support.html |

### Images (all in this folder)

| Use | File | Size |
|---|---|---|
| Application icon | `icon-128.png` | 128 x 128 |
| Small icon | `icon-32.png` | 32 x 32 |
| Banner / tile | `tile-220x140.png` | 220 x 140 |
| Screenshot 1: asking the room | `shot-1-ask-the-room.png` | 1280 x 800 |
| Screenshot 2: live results and the open floor | `shot-2-live-results.png` | 1280 x 800 |
| Screenshot 3: who has gone quiet | `shot-3-who-is-quiet.png` | 1280 x 800 |
| Screenshot 4: a quick game | `shot-4-quick-games.png` | 1280 x 800 |
| Screenshot 5: the coach summary | `shot-5-coach-summary.png` | 1280 x 800 |

Delete every old screenshot in the listing before you upload these, in order. The names in them are made up.

### Notes for the reviewer

Paste this into the "additional information" or "test instructions" field, if the form has one.

```
No account or sign-in is needed to use Engage inside Google Meet™.

1. In a Google Meet™ call, open Activities and choose Engage.
2. Choose Start Engage. A meeting code and invite appear under "Meeting code and invite link" in the Host tools menu.
3. From a second account in the same call, open Engage from Activities. The participant panel opens and joins the meeting.
4. As host, choose Ask the room, pick a ready-made question and choose Launch. The question appears in the participant's panel.
5. Try Reactions (Open the floor) and Quick games from the same menu.
6. End the meeting to see the coach summary.

To see everything without a Meet call, open https://engage.neuronlab.in/try
```

## Step 5: Publish

1. Open the four links above and https://engage.neuronlab.in/try in a browser. All should load.
2. Save each tab in the Marketplace SDK, then choose **Publish** (or **Resubmit**). Google emails the result, usually within a few days to a few weeks.
3. If Google rejects it again, give the rejection email to whoever maintains Engage. Most reasons are small listing fixes.

## Once it is published

Anyone can install Engage from the Workspace Marketplace, or from **Activities** in a Meet call, then **Get add-ons**. A participant who doesn't have it installed sees an invitation to install it when the host starts Engage. Admins of Workspace organisations can install it for everyone at once.
