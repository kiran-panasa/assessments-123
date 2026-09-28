// Vercel Cron job — runs daily at 03:30 UTC (09:00 IST). Checks every Title's
// Main/Mock Assessment date; if it's tomorrow and that side's config link is
// still empty, writes a reminder notification for the program's Assessments
// Ops owners and Content heads (Settings -> Program Owners / Content Heads).
//
// Runs with Firebase Admin credentials (service account), which bypass the
// app's normal Firestore Security Rules -- this is the one part of the app
// that isn't driven by a signed-in user's own session.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_B64 is not set in Vercel environment variables.");
    const svc = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    initializeApp({ credential: cert(svc) });
  }
  return getFirestore();
}

// Vercel Cron runs in UTC; this app and its users are IST (UTC+5:30) -- shift
// "now" so date-only comparisons ("is this tomorrow?") land on the IST day.
function istDateISO(offsetDays = 0) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const now = new Date(Date.now() + IST_OFFSET_MS);
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers["authorization"] || "";
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  let db;
  try {
    db = getDb();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const tomorrow = istDateISO(1);

  let batches;
  try {
    const snap = await db.collection("batches").get();
    batches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return res.status(500).json({ error: "Failed to read batches: " + e.message });
  }

  const reminders = [];
  for (const b of batches) {
    const program = b.program || "";
    const checks = [
      { type: "main", required: true, startAt: b.mainStartAt, configUrl: b.mainConfigUrl, label: "Main Assessment" },
      { type: "mock", required: !!b.mockRequired, startAt: b.mockStartAt, configUrl: b.mockConfigUrl, label: "Mock Assessment" },
    ];
    for (const c of checks) {
      if (!c.required || !c.startAt) continue;
      const date = String(c.startAt).split("T")[0];
      if (date !== tomorrow) continue;
      if (c.configUrl) continue; // already submitted -- nothing to remind about
      reminders.push({ batch: b, ...c, program });
    }
  }

  let sent = 0;
  for (const r of reminders) {
    const docId = `reminder-${r.type}-${r.batch.id}-${tomorrow}`;
    const where = r.program + " · " + r.batch.batch;
    try {
      await db.collection("notifications").doc(docId).set({
        type: "assessment-config-reminder",
        headline: "Reminder: " + r.label + " Config Missing — " + where,
        badgeLabel: "REMINDER",
        badgeTone: "attention",
        body: r.label + " for " + where + " is scheduled for tomorrow (" + tomorrow + ") and still has no config link. Please submit it today.",
        navSection: "topin",
        navTeamTab: null,
        navBatchId: r.batch.id,
        audienceUids: [],
        audienceProgram: r.program || null,
        audienceContentProgram: r.program || null,
        audienceAdmins: false,
        audienceTeams: [],
        readBy: [],
        createdAt: new Date().toISOString(),
        createdBy: "system",
        createdByUid: "",
      }, { merge: true });
      sent++;
    } catch (e) {
      // keep going -- one bad write shouldn't block the rest of today's reminders
    }
  }

  res.status(200).json({ checked: batches.length, tomorrow, remindersSent: sent });
}
