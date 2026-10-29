# Engage demo videos

| File | Length | Use |
|---|---|---|
| `engage-marketplace-tour.mp4` | 1:39 | **Google Workspace Marketplace listing**, homepage, Product Hunt. Seven steps: start in Meet, join, ask the room, recall check, quick game, who's quiet, coach summary |
| `engage-demo.mp4` | 3:59 | Full tutorial for YouTube and the help page. All ten steps |

Both are 1920×1080 H.264 with captions and soft background music (AAC). Neither has a voiceover. The music was synthesized for Engage by `music.py`, so there are no licensing questions.

Nothing in either video is mocked or AI-generated. The host panel and two participant panels are the real app, running one live meeting together ("Leadership workshop: giving feedback"), with four more attendees joined in the background. Two of those attendees stay quiet so that "Who has been quiet" shows real data. All names are made up.

## Publishing on the Marketplace

The Marketplace doesn't take video files. Its Store listing has an optional **YouTube Promo Videos** section that takes YouTube links.

1. Upload `engage-marketplace-tour.mp4` to YouTube, as Public or Unlisted. Title it "Engage for Google Meet™: 90-second tour" and put the trademark line in the description: "Google Meet™ is a trademark of Google LLC."
2. In the Google Cloud console, go to Google Workspace Marketplace SDK → Store listing → YouTube Promo Videos, paste the link, and save.

This promo video is not the same as an OAuth verification video: Engage requests no Google user-data scopes, so it doesn't need one.

The videos were recorded from the redesign branch (`claude/practical-lovelace-u4w13f`). Merge and deploy it before publishing, so the video matches what reviewers and users see.

## What the full tutorial shows

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

`poster.png` is a still from step 8.

## Re-recording after UI changes

1. Run the app locally with a fast chart: `PORT=3100 ENGAGE_SAMPLE_MS=2000 node server/index.js`
2. Full tutorial: `node docs/marketing/video/record.mjs out.mp4`. Tour: `node docs/marketing/video/record90.mjs out.mp4`. Both need Playwright with Chromium, and ffmpeg. Fix the Playwright import path at the top of each script to match your install.
3. In editing, the tour also trims the game setup pause and the second game round, with 0.3-second crossfades.
4. Music: `python3 music.py music.wav <seconds>` (needs numpy), then mux it in at −18 LUFS with ffmpeg's `loudnorm`.

`stage.html` and `stage90.html` are the tutorial frames: the steps list, captions, labels and the intro and outro cards. The scripts serve them from the app's own address, so the panels can be framed. Real time is about 5 minutes, because the quiet list needs 3 minutes of inactivity. That wait is paused out of the recording.
