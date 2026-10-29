# Engage demo videos

| File | Length | Use |
|---|---|---|
|  | 1:39 | **Google Workspace Marketplace listing**, homepage, Product Hunt. Seven steps: start in Meet, join, ask the room, recall check, quick game, who's quiet, coach summary |
|  | 3:59 | Full tutorial for YouTube and the help page. All ten steps |

Both are 1920×1080 H.264 with captions and soft background music (AAC). Neither has a voiceover. The music was synthesized for Engage by , so there are no licensing questions.

## Publishing on the Marketplace

The Marketplace doesn't take video files. Its Store listing has an optional **YouTube Promo Videos** section that takes YouTube links. Upload  to YouTube (Public or Unlisted), then paste the link into Google Cloud console → Google Workspace Marketplace SDK → Store listing → YouTube Promo Videos. This promo video is not the same as an OAuth verification video: Engage requests no Google user-data scopes, so it doesn't need one.


`engage-demo.mp4` is a 4-minute walkthrough, at 1920×1080, of a real Engage meeting: "Leadership workshop: giving feedback". Nothing in it is mocked or AI-generated. The host panel and two participant panels are the real app, running one live meeting together, with four more attendees joined in the background. Two of those attendees stay quiet so that "Who has been quiet" shows real data.

It walks through ten steps, in the order a host would use them:

1. Start Engage (in Google Meet™: Activities → Engage → Start Engage)
2. Invite everyone (copy the chat message; people join with a name, no account)
3. Ask the room (ready-made poll, live results)
4. Check the point landed (recall check with "Missed that")
5. Take questions (ask, upvote, mark answered)
6. Open the floor (one of each reaction, counts only)
7. Wake the room up (Colour tap quick game, private scores)
8. See who has gone quiet, then invite them in with a pulse check
9. Focus moment
10. End the meeting: coach summary for the host, recap for participants

The video has no audio. Captions carry each step, so it works on muted autoplay. `poster.png` is a still from step 8.

## Re-recording after UI changes

For the tour, use  with . In editing, the tour also trims the game setup pause and the second game round, with 0.3-second crossfades. Add music with , then mux it in at −18 LUFS.


1. Run the app locally with a fast chart: `PORT=3100 ENGAGE_SAMPLE_MS=2000 node server/index.js`
2. `node docs/marketing/video/record.mjs out.mp4` (needs Playwright with Chromium, and ffmpeg). Fix the Playwright import path at the top of the script to match your install.

`stage.html` is the tutorial frame: the steps list, captions, labels and the intro and outro cards. The script serves it from the app's own address, so the panels can be framed. Real time is about 5 minutes, because the quiet list needs 3 minutes of inactivity. That wait is paused out of the recording. Use made-up names only.
