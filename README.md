# Cohort Ledger

Editable table dashboard for tracking batch syllabus, main exams, mock assessments, and mock interview schedules.

Static, single-file site (`index.html`) — no build step. Deployed on Vercel with auto-deploy on every push to `main`.

Data is saved to each visitor's own browser (`localStorage`) unless Firestore sync is configured, in which case batch and student records sync live across visitors.

## Publishing to Topin

The **Assessments** page's Publish and Invite Students actions drive a real Topin integration, ported from the IOE Admin Portal:

- **Publish** clones the assessment's config link on the live `config.topin.tech` UI (via a local Playwright automation server) and captures the real, published assessment link.
- **Invite Students** sends the batch's students (matched by `batch` from Students Data) to Topin's production invite API through a Vercel serverless function.

Both require one-time setup:

1. **Automation server** — `cd server && npm install && npx playwright install chromium`, then `node index.js` (or run `server/start.ps1`). It listens on `http://localhost:3001` by default; point the app at it from **Assessments → Automation Server**. The first publish each session prompts for a Topin OTP login (sent to your registered mobile) — after that, the session is cached until it expires.
2. **Invite API key** — set `TOPIN_INVITE_API_KEY` as an environment variable on the Vercel project (Settings → Environment Variables). Without it, `/api/invite` returns a 503.

The automation server runs only on your own machine — Vercel can't run a browser — and is never deployed. Publishing and inviting are live, production actions on Topin: they create real assessments and email real students.
