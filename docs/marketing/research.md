# Engage — Marketing Plan Research Record

**Date:** 2026-10-27
**Author:** Claude (fCMO role), with the founder

## Company snapshot
- **One sentence:** Engage is a meeting engagement layer that runs beside or inside any video meeting (Google Meet side panel, or one link for Zoom, Teams, Zoho). Hosts see how engaged the room is while the meeting is still running.
- **Stage:** Bootstrapped, pre-revenue, pre-users. Solo founder.
- **Product status:** Working, tested prototype deployed on Render (`engage-app-u4c5.onrender.com`). Google Workspace Marketplace listing rejected 15 Oct 2026 (trademark attribution, screenshots), fixed and resubmitted 16 Oct. Approval status unknown at time of writing.

## What the product does today (from README, STATUS, git log to 26 Oct)
- Host: link + code + chat message, QR and short address, agenda, live engagement chart split by topic, dip detection with suggestions, polls, pulse checks, recall checks ("Missed that"), word clouds, question queue (upvotes, pin, merge), bingo and predictions, Focus moment, quiet mode, coach summary (host only), CSV export, summary by email (Resend), optional accounts with email confirmation and password reset, auto-end after 60 idle minutes.
- Attendee: no-login join with disclosure of what the host sees, reactions, questions (anonymous option), prompts, private notes, mini window (pop-up tested; picture-in-picture untested), personal recap.
- Google Meet add-on: side panel for host and attendees, launch notifications to the call. Tested against a stand-in SDK; the commit log shows fixes after real Meet use ("Fix Meet panel stuck on 'Loading Engage'"), so it has been run at least by the founder.
- Marketing surface: homepage rewritten with share cards, public `/try` demo, `robots.txt`, `sitemap`, Microsoft Clarity on the home page only, privacy, terms and support pages.

## ICP
- Founder selected all four candidate audiences: team leads and managers, trainers and facilitators, educators, webinar and event hosts. The plan must choose a beachhead (see §2).
- PRD default buyer: team leads and meeting owners first (bottom-up), HR/L&D and executive sponsors later.
- Designed for 5 to 50 attendees, tested to 200 in code (not load tested).
- Stated problem (PRD): in a 1 to 2 hour corporate meeting, people contribute for about 5 minutes. The PRD marks this as an unvalidated hypothesis.

## Funnel state today
- No real users, no pilots run. No funnel numbers exist.
- Measurement: host summary and an optional survey link. No product analytics (E12 not started). Clarity on the home page only.
- Biggest leak (predicted): Render service sleeps when idle; first load can take about a minute (stated in the listing kit). That breaks the first impression for every new visitor and for Marketplace reviewers.

## Funding
- Bootstrapped, about $0/month marketing spend. No raise planned or stated.

## Team
- Solo founder. Owns product, engineering (with Claude Code), and marketing. No contractors.
- Shape: builder-first. Marketing is a gap to be filled by founder time plus the marketing-skills library installed in this repo.

## Current marketing budget
- Paid: $0. Tools: Render (tier unknown, sleeps when idle, which implies free), Resend (free tier likely), Clarity (free), Gmail address `engage2028@gmail.com` as developer contact. Headcount: founder time only.
- Tier: Tier 1, pre-seed / bootstrapped, at the very bottom of the range.

## Channels currently active
- Acquisition: none live. Marketplace listing pending. Homepage and demo exist.
- Activation: no-login join, demo, summary email. No templates, no onboarding emails.
- Retention: none (summary email is transactional).
- Referral: none. Attendee recap exists and could carry a link.
- Revenue: free. Listing says "Pricing: Free". No pricing decision.

## Already done (acknowledge in plan)
- Full Phase 1 product built and tested (38 automated tests, browser test with 20 checks, principles guard test).
- PRD, UX/UI design package, clickable prototype, technical architecture, engineering plan, product plan report (PDFs).
- Google Meet add-on built, Marketplace listing kit written, rejection handled within a day.
- Homepage rewrite, live demo, share cards, privacy-first stance written into product rules and tests.
- Email (Resend): summary by email, confirmation, reset.

## In-flight and stuck
- Marketplace approval: pending Google review.
- Pilot hosts: "Needs a person" item in STATUS since 13 Oct. None found yet.
- Feedback survey form: not created (`ENGAGE_SURVEY_URL` unset).
- Picture-in-picture mini window: untested in a real browser.
- Deployment: live on Render, but sleeps; persistent disk status unknown.

## Strategic posture
- Founder's top priority (inferred from STATUS): get the first three pilot meetings.
- Constraints: one person, no money, product principles (privacy, calm, no rankings) enforced by a test.
- Tension found: PRD and principles say "aggregate trends, not people" and "nobody feels monitored". The current homepage and product show hosts a named list of who has gone quiet, and the summary email lists names with no activity. This is a positioning decision, not a copy fix.
- Name risk: "Engage" is a generic word. Slido's mid paid plan is also called "Engage" (Slido pricing, 2026). Branded search will be hard without a descriptor.

## Competitive context (web research, 2026)
- Mentimeter: per-presenter pricing, Basic about $11.99/mo and Pro $24.99/mo billed yearly; free tier 50 participants per month. Buyer is often the presenter or trainer paying for their own seat.
- Slido (Cisco/Webex): free 100 participants per event; Engage plan $17.50/mo, Professional $75/mo, billed yearly.
- Poll Everywhere: from $10/mo; free 40 audience members.
- Others: AhaSlides, Wooclap, Kahoot, plus native polls and Q&A in Google Meet (paid Workspace editions), Zoom and Teams.
- Gap Engage claims: live view of who has stopped taking part, recall check, engagement over time with dip suggestions, runs in the Meet side panel, calm by design.

## Current-state rubric scores (scored from materials)
See §3. Total 24 / 85.

## Materials read
- `README.md`, `docs/STATUS.md`, `docs/product-plan.md`, `docs/PRD.md` (scanned), `docs/START-HERE.md`, `integrations/google-meet/listing/LISTING.md`, `public/index.html`, git log to 26 Oct 2026. Copies in `materials/`.
