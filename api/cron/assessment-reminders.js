// Vercel Cron job — runs once daily at 03:30 UTC (09:00 IST). Hobby-plan
// Vercel accounts are hard-limited to one cron invocation per day (no
// sub-daily schedules at all), so both tiers below are built to work from
// that single daily check rather than true hour-by-hour polling:
//
// Tier 1 (exam is tomorrow): reminder notification to the program's
// Assessments Ops owners and Content heads, same as before.
// Tier 2 (exam is TODAY and still has no config): escalation notification
// to that program's Escalation Manager(s) (Settings -> Escalation Managers;
// falls back to every Admin if a program has none picked) -- this fires the
// morning of the exam, which in practice is ~24h after Tier 1's reminder
// would have gone out the day before. Carries along whatever reason Content
// logged on that reminder.
//
// Every write first checks whether its doc already exists before setting
// it, so a retried/duplicate run on the same day can't wipe out readBy or
// a reason someone already added.
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
// "now" so date-only comparisons ("is this tomorrow/today?") land on the IST day.
function istDateISO(offsetDays = 0) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const now = new Date(Date.now() + IST_OFFSET_MS);
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

async function docExists(db, id) {
  const snap = await db.collection("notifications").doc(id).get();
  return snap.exists;
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

  const today = istDateISO(0);
  const tomorrow = istDateISO(1);

  let batches;
  try {
    const snap = await db.collection("batches").get();
    batches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    return res.status(500).json({ error: "Failed to read batches: " + e.message });
  }

  function gapsFor(targetDate) {
    const out = [];
    for (const b of batches) {
      const program = b.program || "";
      const checks = [
        { type: "main", required: true, startAt: b.mainStartAt, configUrl: b.mainConfigUrl, label: "Main Assessment" },
        { type: "mock", required: !!b.mockRequired, startAt: b.mockStartAt, configUrl: b.mockConfigUrl, label: "Mock Assessment" },
      ];
      for (const c of checks) {
        if (!c.required || !c.startAt) continue;
        const date = String(c.startAt).split("T")[0];
        if (date !== targetDate) continue;
        if (c.configUrl) continue; // already submitted -- nothing to remind/escalate about
        out.push({ batch: b, ...c, program });
      }
    }
    return out;
  }

  const tier1Gaps = gapsFor(tomorrow);
  const tier2Gaps = gapsFor(today);

  let remindersSent = 0;
  for (const g of tier1Gaps) {
    const where = g.program + " · " + g.batch.batch;
    const docId = `reminder-${g.type}-${g.batch.id}-${tomorrow}`;
    try {
      if (await docExists(db, docId)) continue;
      await db.collection("notifications").doc(docId).set({
        type: "assessment-config-reminder",
        headline: "Reminder: " + g.label + " Config Missing — " + where,
        badgeLabel: "REMINDER",
        badgeTone: "attention",
        body: g.label + " for " + where + " is scheduled for tomorrow (" + tomorrow + ") and still has no config link. Please submit it today.",
        navSection: "topin",
        navTeamTab: null,
        navBatchId: g.batch.id,
        audienceUids: [],
        audienceProgram: g.program || null,
        audienceContentProgram: g.program || null,
        audienceAdmins: false,
        audienceTeams: [],
        reason: "",
        reasonBy: "",
        reasonAt: "",
        readBy: [],
        createdAt: new Date().toISOString(),
        createdBy: "system",
        createdByUid: "",
      });
      remindersSent++;
    } catch (e) { /* keep going -- one bad write shouldn't block the rest */ }
  }

  let escalationsSent = 0;
  for (const g of tier2Gaps) {
    const where = g.program + " · " + g.batch.batch;
    const escalationId = `escalation-${g.type}-${g.batch.id}-${today}`;
    try {
      if (await docExists(db, escalationId)) continue;

      let reasonLine = "";
      try {
        const reminderId = `reminder-${g.type}-${g.batch.id}-${today}`;
        const reminderSnap = await db.collection("notifications").doc(reminderId).get();
        const reason = reminderSnap.exists ? reminderSnap.data().reason : "";
        if (reason) reasonLine = " Reason given by Content: “" + reason + "”";
      } catch (e) { /* no reason available, continue without it */ }

      await db.collection("notifications").doc(escalationId).set({
        type: "assessment-config-escalation",
        headline: "SLA Breach: " + g.label + " Config Missing — " + where,
        badgeLabel: "SLA BREACH",
        badgeTone: "danger",
        body: g.label + " for " + where + " is scheduled for TODAY (" + today + ") and still has no config link." + reasonLine,
        navSection: "topin",
        navTeamTab: null,
        navBatchId: g.batch.id,
        audienceUids: [],
        audienceProgram: null,
        audienceContentProgram: null,
        audienceEscalationProgram: g.program || null,
        audienceAdmins: false,
        audienceTeams: [],
        readBy: [],
        createdAt: new Date().toISOString(),
        createdBy: "system",
        createdByUid: "",
      });
      escalationsSent++;
    } catch (e) { /* keep going */ }
  }

  res.status(200).json({ checked: batches.length, today, tomorrow, remindersSent, escalationsSent });
}
