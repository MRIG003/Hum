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
