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
2. **Automation key** — the server generates a random key on first run (`server/automation-key.json`, gitignored) and prints it to the console. Every route except `/api/health` requires it. If you're the only one using it, paste the printed key into **Assessments → Automation Server** once and forget it. If a teammate is hosting the server for the team, they share that key (and their machine's address) with everyone who needs to publish.
3. **Invite API key** — set `TOPIN_INVITE_API_KEY` as an environment variable on the Vercel project (Settings → Environment Variables). Without it, `/api/invite` returns a 503.

The automation server runs only on a real machine — Vercel can't run a browser — and is never deployed there. Publishing and inviting are live, production actions on Topin: they create real assessments and email real students. If you expose the server beyond `localhost` (e.g. over a LAN or a tunnel) so teammates can reach it from elsewhere, the automation key is what stops a stranger who finds that address from triggering OTP sends, publishes, or cancellations — don't run it with `AUTOMATION_KEY` disabled or share the key outside your team.
