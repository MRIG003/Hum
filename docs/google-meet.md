# Engage for Google Meet

Engage can run inside a Google Meet call as a Meet add-on, in the side panel opened from **Activities**. Everyone who opens it in the same call lands in the same Engage meeting, and the host controls it from a compact panel.

**Status (15 October 2026).** The panel, the matching logic and the embedded layout are built and tested against a stand-in for Google's SDK. They have **not** been run inside a real Meet call, because that needs your Google Cloud project and a Workspace account. Steps marked *verify* are from Google's public documentation and could not be checked here. Follow Google's [deploy guide](https://developers.google.com/workspace/meet/add-ons/guides/deploy-add-on) where it differs from this page.

## How it works for people

1. The host opens **Activities, then Engage** in Meet. If Engage is not running in this call, the panel offers **Start Engage**. The host presses it and becomes the Engage host. Meet also invites the others in the call to open the add-on.
2. Everyone else opens Engage from Activities (or from the invite). The panel finds the running meeting for this call and opens it. They enter their real name once.
3. The host controls Engage from the same panel: engagement, who has been quiet, quick pulse check, open the floor, focus moment, questions. **Open the full console** opens the complete host view in a browser tab.
4. People who are not in Meet can use the normal join link, which is also in the panel.

The first person to press **Start Engage** in a call becomes its host. Anyone in the call can open the add-on, so tell your team who starts it.

## What you need to set up

1. **A Google Cloud project.** Note its **project number** (not the project id).
2. **Enable the Google Workspace add-ons API** in that project (*verify* the exact API name in the deploy guide).
3. **Create an HTTP deployment** for the Meet add-on, pasting the manifest from `integrations/google-meet/deployment.json` after replacing `YOUR-ENGAGE-ADDRESS` with your public address (for example `https://engage-app-u4c5.onrender.com`). The manifest fields used are `addOns.common.name`, `addOns.common.logoUrl`, and `addOns.meet.web.sidePanelUrl`, `supportsScreenSharing` and `addOnOrigins` (*verify* against the current manifest reference; `addOnOrigins` must contain the origin only, with no path).
4. **Tell Engage the project number.** In Render, add the environment variable `ENGAGE_GOOGLE_CLOUD_PROJECT_NUMBER`. Engage passes it to Google's SDK. Without it the panel shows "Not set up yet".
5. **Install the add-on for yourself and test.** Add the deployment to your own account, start a Meet call, open **Activities**, and choose Engage. Ask a second person to join the call and open it.
6. **Publish.** Publishing **privately** limits the add-on to your organisation and, per Google, skips Google's review. A public listing is reviewed by Google.

## What Engage serves for Meet

| Address | Purpose |
|---|---|
| `/meet/panel` | The side panel page. It may be framed by `https://meet.google.com` only. |
| `/j/CODE?embed=1` | The attendee page in its narrow embedded layout. May be framed by Meet only. |
| `/vendor/meet.addons.mjs` | Google's SDK, served from our own origin from the `@googleworkspace/meet-addons` package. |
| `/api/link/meet/ID` | Finds the Engage meeting running in a given Meet meeting. |

The host console (`/h/CODE`) and every other page still refuse to be framed.

## Known limits and things to check in a real call

- **Not tested in real Meet.** In particular: whether Google's SDK loads under Engage's security headers, whether `startActivity()` with no arguments invites the call as intended, and how the panel behaves on a phone.
- **Storage inside the panel.** Browsers store data for an embedded page separately from the same site opened in its own tab. People may be asked for their name once in the panel and again in a normal tab. A host's private link carries the token to the full console.
- **Host key is per tab.** The panel keeps the host key in the browser tab (not shared browser storage), so a second Google account in the same browser does not get host controls. The cost: if the host closes that tab, the panel shows the attendee view. Use **Open the full console** (or its link) to keep host control.
- **Who can see the add-on.** An add-on installed from the Cloud console is installed for the developer's own account only. Other people only see Engage in Activities once it is installed for them or published to their organisation. Everyone can still use the normal join link.
- **Sign-in cookies do not work in the panel** (they are not sent in a cross-site frame), so the panel host uses the private host token. Host accounts and *My meetings* still work in a normal tab.
- **Names.** Google's SDK does not give Engage participants' names. People type their name, and Engage refuses placeholder names. Matching names to the Meet roster is not built.
- **One live Engage meeting per Meet call.** If a recurring Meet code is reused after an Engage meeting ended, a new one can be started.
- **Free Render plan.** The service sleeps when idle, which would delay the first open of the panel. Use a paid plan for real meetings.

## Host tools inside the panel

After the host presses Start Engage, the panel opens the host tools in the same frame (`/h/CODE?embed=1`). A "Host tools" dropdown switches between Ask the room, Questions, Reactions, Agenda, Games and automation, Who has been quiet, Engagement over time, Invite and share, and Download CSV. The host key stays in this tab only (sessionStorage). The CSV is the one thing that leaves Meet: its button opens the Engage website sign-in, which then lands on the full console where the export lives. Participants see a launched prompt as the only thing in their panel until they answer or its timer ends, then a short "back to the meeting" note.

## Notifying the call when the host launches something

When the host launches a poll, pulse, recall check, word cloud or opens the floor, the host panel also calls `startActivity()` so Meet shows people in the call its own prompt to open Engage. It is rate limited (default once every 2 minutes, choices 1, 2 or 5) and can be switched off under "Meeting code and invite link". It only fires from an open host panel inside Meet. How Meet treats repeated calls while the activity is already running has to be checked in a real call.

## Why the panel is a shell (fix for "The add-on stopped responding")

Meet keeps an add-on alive only while the page it loaded in the side panel holds a live SDK session. The panel page (`/meet/panel`) therefore opens that session first thing, with the Cloud project number inlined into the HTML by the server (no config request before the handshake), and never navigates away. The host view (`/h/CODE?embed=1`) and participant view (`/j/CODE?embed=1`) run in a full-size frame inside it. The host view asks the shell to call `startActivity()` over `postMessage` (same-origin checked), so invitations and launch notifications keep working. A sleeping free-tier server still makes the first load slow; the Starter plan removes that.

## Meetings nobody ended

The server ends a live meeting by itself after 60 minutes with no host or attendee connected (`ENGAGE_IDLE_END_MIN` changes the window; the 12 hour cap still applies). While the host has Engage open for an hour or more, the panel shows a "Meeting still running" reminder with End meeting and Keep it running (snoozes for an hour).

## Ask the room, the floor and quick games (October 2026)

- **Ask the room** offers ready-made questions per type (editable), plus questions the host wrote before on this device. Options are edited like Google Forms: one row each, Enter adds the next, a pasted list fills several rows, and a recall check's right answer is marked with the circle. The agenda and the automatic pulse check live in this tool too.
- **Reactions** are open only while the host has opened the floor (30 seconds to 5 minutes, or until closed). Each person can send each emoji once per opening. The host sees this opening's counts, or the last one's.
- **Games** replace bingo and the prediction. Colour tap, Even or odd, Quick maths, Biggest or smallest, Odd one out, or a surprise mix: 3, 5 or 10 rounds of 5 to 15 seconds. The game fills every participant's panel; right and fast answers score more. Scores stay private: each person sees their own, and the host sees how many got each round right, never who.
