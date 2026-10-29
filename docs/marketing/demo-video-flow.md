# Engage demo video: Google Flow production kit

Written 29 October 2026 for the new design (logo, palette, `engage.neuronlab.in`). Part of Marketing Plan v2, §4 Move 10.

## Read this first: what Flow can and can't do for Engage

Google Flow (built on Veo) makes short cinematic clips, about 8 seconds each, from text, start and end frames, or reference images ("ingredients"). It is very good at people, rooms, light and emotion.

It is **bad at real software screens.** Ask it to show the Engage panel and it will invent buttons, garble the text, and change the logo between frames. A demo that shows a fake UI is also a trust problem for a product whose whole promise is "we only show what's true."

So the video is a **hybrid**:

| Part | Made with | Why |
|---|---|---|
| The human story (the meeting, the quiet person, the moment the room wakes up) | **Flow** | Emotion and people, which a screen recording can't give you |
| Every shot of the Engage interface | **Real screen recording** of `engage.neuronlab.in/try` | Shows the real product, with real text and the real logo |
| Logo, captions, end card | Your editor | Exact brand colours and type |

Assemble the pieces in a normal editor: CapCut, Clipchamp, DaVinci Resolve, or Google Vids. Flow's Scenebuilder is fine for joining the Flow clips into a sequence, but finish in an editor so you can add the screen recordings and captions.

## The deliverables

| Version | Length | Shape | Where it goes |
|---|---|---|---|
| **A. Main demo** | 60–75 s | 16:9, 1920×1080 | Homepage (under the hero), Marketplace listing (if the form takes a YouTube link), YouTube, Product Hunt |
| **B. Social cut** | 15–20 s | 9:16 vertical | LinkedIn, Instagram, YouTube Shorts |
| **C. Silent loop** | 8–10 s | 16:9, no audio | Homepage hero or a GIF in outreach emails |

Make A first. B and C are cut from the same pieces.

## The story in one line

> A host can't tell who's with them. Engage shows the room in the Meet side panel. The quiet people come back in. Every voice, not just the loudest few.

Keep the tone calm and warm, not salesy. **One rule for the quiet-person moment:** the host notices and *invites them in kindly* (asks the room a question, opens the floor). Never show the host calling someone out or looking suspicious. Engage is about inclusion, not monitoring, and the video has to read that way at a glance.

## Brand references for every prompt

- **Colours:** indigo `#4F46E5` to violet `#8B3DFF` gradient, deep navy `#13142B`, soft lavender background `#F5F6FB`
- **Logo:** a navy circular "e" with a white inner swirl, a violet dot and a violet underline wave (`public/img/logo-512.png`)
- **Mood:** bright modern office or home office, soft daylight, natural skin tones, diverse cast, nobody overacting
- **Never in a Flow prompt:** the Google or Meet logo, or real company names. Describe "a video call grid on a laptop" instead. Add the Google Meet™ name only in captions, with the ™, and the footnote "Google Meet™ is a trademark of Google LLC." on the end card.

## Before you open Flow: make your character ingredients

Consistent faces across clips matter more than anything else. In Flow (or Whisk/Imagen), generate 3 reference portraits and save them as ingredients:

1. **Host, "Priya":** *Portrait of a South Asian woman in her early 30s, shoulder-length dark hair, navy blazer over a cream top, warm confident expression, soft daylight, plain light background, photorealistic.*
2. **Quiet attendee, "Mei":** *Portrait of an East Asian woman in her late 20s, glasses, oversized grey sweater, thoughtful expression, soft window light, plain light background, photorealistic.*
3. **Attendee, "Sam":** *Portrait of a Black man in his 30s, short beard, olive overshirt, friendly expression, plain light background, photorealistic.*

Using these names keeps the video in line with the demo data on the homepage (Priya Sharma, Mei Chen, Sam Okafor).

Use **Ingredients to Video** with these portraits for every shot that has a person. Use the highest-quality Veo model your plan offers for the final renders. Use the fast model while you test prompts, because it costs fewer credits.

## Version A: shot list (about 70 seconds)

"Flow" = generate in Flow. "Screen" = record from `engage.neuronlab.in/try`. Voiceover (VO) is optional; captions carry the story on their own for silent autoplay.

| # | Time | Shot | Source | Caption on screen | VO |
|---|---|---|---|---|---|
| 1 | 0:00–0:06 | Priya presenting on a video call, a grid of small faces, several cameras off | Flow | *You're 40 minutes into the meeting.* | "Forty minutes into the meeting, you can't tell who's still with you." |
| 2 | 0:06–0:12 | Mei at her desk, camera off, listening but drifting, glancing at her phone | Flow | *Who's still with you?* | — |
| 3 | 0:12–0:17 | Priya opens the side panel on her laptop, close-up of her face lit by the screen, curious | Flow | — | "Engage lives right in the Google Meet™ side panel." |
| 4 | 0:17–0:24 | **Host panel:** Host tools menu → *Ask the room* → pick a ready-made question → *Launch* | Screen | *Ask the room in one tap* | "Ask the room in one tap." |
| 5 | 0:24–0:30 | **Participant panel:** the poll fills the panel; tap an answer; results fill in live | Screen | *Everyone answers in their own panel* | — |
| 6 | 0:30–0:37 | **Host panel:** *Who has been quiet*: Mei Chen, "No activity for 14 min" | Screen | *See who has gone quiet, while there's still time* | "See who's gone quiet, while there's still time to bring them in." |
| 7 | 0:37–0:43 | Priya smiles and says, kindly, "Let's hear from a few more voices. Quick question for everyone." | Flow | — | (Priya's line, generated in Flow) |
| 8 | 0:43–0:50 | **Participant panel:** quick game, *Colour tap: Tap RED*, tap, "Right! +147" | Screen | *One-minute games wake the room up. Scores stay private.* | "One-minute games wake the room up." |
| 9 | 0:50–0:55 | Mei leans in, smiles, turns her camera on; Sam laughs at his screen | Flow | *Every voice comes back* | — |
| 10 | 0:55–1:02 | **Host panel:** coach summary: when engagement dipped, what's open, one thing to try next time | Screen | *A coach summary after every meeting* | "And after the call, a coach summary, with one thing to try next time." |
| 11 | 1:02–1:06 | Privacy card (made in the editor): *No audio, video or screen recorded. Everyone sees what the host can see.* | Editor | (the card) | "Nothing is recorded. Everyone knows what you can see." |
| 12 | 1:06–1:12 | End card: logo, *Every voice in the meeting, not just the loudest few.*, `engage.neuronlab.in`, "Free for Google Meet™", trademark footnote | Editor | (the card) | "Engage. Every voice in the meeting." |

## Flow prompts for each Flow shot

Paste one per clip. Each describes subject, action, setting, camera, light and sound, which is the structure Veo follows best. Add the character ingredients listed.

**Shot 1: the flat meeting** (ingredients: Priya)
> Over-the-shoulder shot of a woman in a navy blazer presenting on a video call from a bright modern home office. Her laptop screen shows a grid of small video tiles; most tiles are dark with only initials, two people are looking away. She pauses mid-sentence and looks slightly unsure. Slow push-in toward the screen. Soft natural daylight, shallow depth of field, photorealistic, calm corporate mood. Audio: quiet room tone, a faint keyboard click, no music.

**Shot 2: the quiet attendee** (ingredients: Mei)
> Medium shot of a young woman with glasses in a grey sweater at a tidy desk by a window, wearing earbuds, a video call open on her laptop with her camera off. She listens, then her attention drifts and she glances down at her phone. Static camera, gentle window light, muted cool tones, photorealistic. Audio: a distant voice from the laptop speaking indistinctly, soft room tone.

**Shot 3: the host opens Engage** (ingredients: Priya)
> Close-up of the woman in the navy blazer looking at her laptop. Soft indigo and violet light from the screen falls on her face. She clicks the trackpad and her expression turns curious and focused. Slow dolly-in, shallow depth of field, warm daylight from the side, photorealistic. Audio: a soft click, calm room tone.

**Shot 7: the kind invitation** (ingredients: Priya)
> Medium close-up of the woman in the navy blazer speaking warmly to her laptop camera on a video call, relaxed and smiling. She says: "Let's hear from a few more voices. Quick question for everyone." Static camera at eye level, soft daylight, home office background slightly blurred, photorealistic. Audio: her clear voice, quiet room tone.

**Shot 9: the room wakes up** (ingredients: Mei, Sam)
> Two short moments in one shot: the young woman with glasses leans toward her laptop, smiles, and turns her camera on; cut to a man with a short beard in an olive overshirt laughing at his laptop screen in a sunny kitchen. Natural, unforced reactions. Gentle handheld camera, warm daylight, photorealistic. Audio: soft laughter, light upbeat ambient tone.

If shot 9 comes out messy, generate the two halves as separate 4-second clips.

**Optional opener for the social cut (no people):**
> Macro shot of a laptop screen in a dim room: a single soft violet dot pulses gently, then ripples outward into a calm wave of indigo light. Slow push-in, cinematic, minimal, photorealistic glass reflections. Audio: one soft, warm synth note.

### Getting good results in Flow

- Generate 2–4 versions of each shot and keep the best. Expect to throw most away.
- Keep prompts in this order: who, what they do, where, camera, light, sound. Change one thing at a time when retrying.
- If faces drift between clips, add the same character ingredient again and shorten the action.
- If Veo puts readable text or logos on the laptop screen, add "the laptop screen content is soft and out of focus" to the prompt. You'll cover screens with real recordings anyway.
- Turn off generated music if Flow offers it, and add one music track in the editor so the whole video sounds consistent.

## Recording the real screens (shots 4, 5, 6, 8, 10)

1. Open `https://engage.neuronlab.in/try` in Chrome. It shows host and participant side by side with no sign-up. Wait for the first load before you start recording.
2. Set the browser zoom so the panels fill the frame. Hide bookmarks, extensions and notifications, and use a clean browser profile.
3. Record at 1920×1080, 60 fps, with a screen recorder that shows clicks softly (OBS, Loom, or the macOS screen recorder).
4. Record each action as its own take: launch a poll, answer it, open *Who has been quiet*, play *Colour tap*, end the meeting and open the coach summary.
5. Move the mouse slowly. Pause half a second before each click so viewers can follow it.
6. In the editor, crop to the panel, add a gentle 105% zoom on the key moment, and put the caption on a lavender `#F5F6FB` band. Don't put it over the UI.

Use only made-up names in the demo meeting. The `/try` data already does this.

## Voiceover, music and captions

- **Voice:** calm, warm, unhurried. Record it yourself on a phone in a quiet room, or use a calm text-to-speech voice. About 120 words total; the VO column above is the full script.
- **Music:** one soft, light track (royalty-free, for example the YouTube Audio Library), mixed low under the VO.
- **Captions:** always on. Most people watch muted. Use Inter or a similar font, white on the indigo-to-violet gradient or navy on lavender.
- **No** whooshes, countdowns or "🔥". The brand voice is calm.

## Version B: the 15–20 second social cut (9:16)

| Time | Shot | Caption |
|---|---|---|
| 0–3 s | Shot 2 (Mei drifting) | *Who's still with you, 40 minutes in?* |
| 3–7 s | Shot 6, cropped to the panel: *Who has been quiet* | *Engage shows you, live, in Google Meet™* |
| 7–11 s | Shot 8: *Colour tap*, "Right! +147" | *Bring the room back in one minute* |
| 11–14 s | Shot 9 (Mei turns her camera on) | *Every voice, not just the loudest few* |
| 14–17 s | End card | *Free for Google Meet™. engage.neuronlab.in* |

## Version C: the silent loop

Shot 6 (quiet list), shot 8 (game) and shot 9, each about 3 seconds, no audio, looping cleanly. Export as MP4 for the site and as a GIF under 3 MB for outreach emails.

## Checklist before you publish

- [ ] Every Engage screen in the video is a real recording, not AI-generated
- [ ] No Google or Meet logo was generated by Flow; captions say "Google Meet™" and the end card has the trademark footnote
- [ ] The quiet-person moment reads as inviting, not catching someone out
- [ ] Names shown are made up
- [ ] Captions are readable on a phone with the sound off
- [ ] The end card shows `engage.neuronlab.in` and "Free for Google Meet™"
- [ ] Video A uploaded to YouTube (unlisted is fine) so it can be linked from the Marketplace listing and Product Hunt
- [ ] Shared in outreach with UTM tags: `?utm_source=youtube`, `?utm_source=linkedin` and so on

## How to tell if it worked

| Where | Measure | Good sign |
|---|---|---|
| Homepage | Clicks on "Open the live demo" after the video was added | Up versus the two weeks before |
| LinkedIn | Profile visits and DMs from hosts per post | At least 1 host conversation per video post |
| Outreach | Replies per 10 messages with the GIF vs. without | More replies with it |
| Marketplace | Listing → install rate (once approved) | Track from day one |
