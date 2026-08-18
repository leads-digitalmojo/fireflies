import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";
import type { MeetingWithAnalysis } from "@/types";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST ?? "smtp.zoho.in",
    port: Number(process.env.ZOHO_SMTP_PORT ?? 465),
    secure: true, // SSL on port 465
    auth: {
      user: process.env.ZOHO_SMTP_USER,
      pass: process.env.ZOHO_SMTP_APP_PASSWORD,
    },
    pool: true,
    maxConnections: 3,
    rateDelta: 1000,
    rateLimit: 5,
  });
}

function formatScore(score: number | string): string {
  return Number(score).toFixed(1);
}

function buildEmailHtml(meeting: MeetingWithAnalysis): string {
  const { analysis, title, clientName, meetingDate, duration, participants } = meeting;
  if (!analysis) throw new Error("No analysis found for meeting");

  const dateStr = meetingDate
    ? new Date(meetingDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Unknown date";

  const durationStr = duration
    ? `${Math.floor(duration / 60)} min`
    : "Unknown";

  const riskColor: Record<string, string> = {
    LOW: "#16a34a",
    MEDIUM: "#ca8a04",
    HIGH: "#ea580c",
    CRITICAL: "#dc2626",
  };

  const sentimentColor: Record<string, string> = {
    POSITIVE: "#16a34a",
    NEUTRAL: "#6b7280",
    NEGATIVE: "#dc2626",
  };

  const riskBg = riskColor[analysis.riskLevel] ?? "#6b7280";
  const sentimentBg = sentimentColor[analysis.clientSentiment] ?? "#6b7280";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Meeting Analysis Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; margin: 0; padding: 24px; color: #1f2937; }
  .container { max-width: 700px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
  .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff; padding: 32px; }
  .header h1 { margin: 0 0 8px; font-size: 22px; font-weight: 700; }
  .header p { margin: 0; opacity: 0.85; font-size: 14px; }
  .scores { display: flex; gap: 16px; padding: 24px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; }
  .score-card { flex: 1; text-align: center; padding: 16px; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; }
  .score-card .number { font-size: 32px; font-weight: 800; color: #1e3a8a; }
  .score-card .label { font-size: 12px; color: #6b7280; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #fff; }
  .section { padding: 24px; border-bottom: 1px solid #f3f4f6; }
  .section h2 { font-size: 16px; font-weight: 700; color: #1e3a8a; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #dbeafe; }
  .section ul { margin: 0; padding-left: 20px; }
  .section li { margin-bottom: 6px; font-size: 14px; line-height: 1.5; }
  .action-item { background: #f0f9ff; border-left: 4px solid #3b82f6; padding: 10px 14px; border-radius: 4px; margin-bottom: 8px; }
  .action-item .owner { font-weight: 700; color: #1e3a8a; font-size: 13px; }
  .action-item .task { font-size: 14px; margin: 4px 0; }
  .action-item .deadline { font-size: 12px; color: #6b7280; }
  .employee-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
  .employee-row:last-child { border-bottom: none; }
  .emp-name { font-weight: 600; font-size: 14px; }
  .emp-score { font-size: 18px; font-weight: 800; color: #1e3a8a; }
  .meta-row { display: flex; gap: 16px; padding: 16px 24px; background: #f8fafc; font-size: 13px; color: #6b7280; }
  .meta-row span { display: flex; align-items: center; gap: 6px; }
  .footer { text-align: center; padding: 20px; font-size: 12px; color: #9ca3af; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>Meeting Analysis Report</h1>
    <p>${title}${clientName ? ` · ${clientName}` : ""} · ${dateStr} · ${durationStr}</p>
  </div>

  <div class="meta-row">
    <span>Participants: ${participants.map((p) => p.name).join(", ")}</span>
  </div>

  <div class="scores">
    <div class="score-card">
      <div class="number">${formatScore(analysis.overallTeamScore)}</div>
      <div class="label">Team Score</div>
    </div>
    <div class="score-card">
      <div class="number">${formatScore(analysis.clientHealthScore)}</div>
      <div class="label">Client Health</div>
    </div>
    <div class="score-card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
      <span class="badge" style="background:${sentimentBg}">${analysis.clientSentiment}</span>
      <span class="badge" style="background:${riskBg}">Risk: ${analysis.riskLevel}</span>
    </div>
  </div>

  <div class="section">
    <h2>Summary</h2>
    <ul>${analysis.summary.map((s) => `<li>${s}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <h2>Minutes of Meeting</h2>
    <ul>${analysis.minutesOfMeeting.map((m) => `<li>${m}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <h2>Action Items</h2>
    ${analysis.actionItems
      .map(
        (a) => `<div class="action-item">
      <div class="owner">${a.owner}</div>
      <div class="task">${a.task}</div>
      <div class="deadline">Deadline: ${a.deadline}</div>
    </div>`
      )
      .join("")}
  </div>

  <div class="section">
    <h2>Risks</h2>
    <ul>${analysis.risks.map((r) => `<li>${r}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <h2>Recommendations</h2>
    <ul>${analysis.recommendations.map((r) => `<li>${r}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <h2>Employee Performance</h2>
    ${analysis.employeeScores
      .sort((a, b) => b.score - a.score)
      .map(
        (e) => `<div class="employee-row">
      <div>
        <div class="emp-name">${e.name}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px">${e.strengths.slice(0, 2).join(" · ")}</div>
      </div>
      <div class="emp-score">${formatScore(e.score)}<span style="font-size:14px;font-weight:400;color:#9ca3af">/10</span></div>
    </div>`
      )
      .join("")}
  </div>

  <div class="footer">
    Generated automatically by Digital Mojo Meeting Intelligence · ${new Date().toLocaleDateString("en-IN")}
  </div>
</div>
</body>
</html>`;
}

function buildPlainText(meeting: MeetingWithAnalysis): string {
  const { analysis, title, clientName, meetingDate } = meeting;
  if (!analysis) return "";

  const dateStr = meetingDate
    ? new Date(meetingDate).toLocaleDateString("en-IN")
    : "Unknown";

  const lines = [
    `MEETING ANALYSIS REPORT`,
    `═══════════════════════`,
    `Meeting: ${title}`,
    clientName ? `Client: ${clientName}` : null,
    `Date: ${dateStr}`,
    ``,
    `SCORES`,
    `──────`,
    `Team Score:    ${formatScore(analysis.overallTeamScore)} / 10`,
    `Client Health: ${formatScore(analysis.clientHealthScore)} / 10`,
    `Sentiment:     ${analysis.clientSentiment}`,
    `Risk Level:    ${analysis.riskLevel}`,
    ``,
    `SUMMARY`,
    `───────`,
    ...analysis.summary.map((s) => `• ${s}`),
    ``,
    `MINUTES OF MEETING`,
    `──────────────────`,
    ...analysis.minutesOfMeeting.map((m) => `• ${m}`),
    ``,
    `ACTION ITEMS`,
    `────────────`,
    ...analysis.actionItems.map((a) => `• ${a.owner} → ${a.task} (by ${a.deadline})`),
    ``,
    `RISKS`,
    `─────`,
    ...analysis.risks.map((r) => `• ${r}`),
    ``,
    `RECOMMENDATIONS`,
    `───────────────`,
    ...analysis.recommendations.map((r) => `• ${r}`),
    ``,
    `EMPLOYEE SCORES`,
    `───────────────`,
    ...analysis.employeeScores
      .sort((a, b) => b.score - a.score)
      .map((e) => `${e.name}: ${formatScore(e.score)} / 10`),
  ].filter((l) => l !== null) as string[];

  return lines.join("\n");
}

export async function sendMeetingReport(
  meeting: MeetingWithAnalysis
): Promise<void> {
  const { analysis, title, clientName, meetingDate } = meeting;
  if (!analysis) throw new Error("No analysis available for email");

  // Base recipients: CEO + HR
  const base = [process.env.CEO_EMAIL, process.env.HR_EMAIL].filter(Boolean) as string[];

  // Also send to every @digitalmojo.in participant in the meeting
  // (covers the meeting creator + any pod manager who was on the call)
  const internalParticipants = meeting.participants
    .map((p) => p.email?.trim().toLowerCase())
    .filter((e): e is string => !!e && e.endsWith("@digitalmojo.in"));

  // Deduplicate (case-insensitive)
  const recipients = [...new Set([...base.map((r) => r.toLowerCase()), ...internalParticipants])];

  if (recipients.length === 0) {
    throw new Error("No recipients configured (CEO_EMAIL / HR_EMAIL)");
  }

  const dateStr = meetingDate
    ? new Date(meetingDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Unknown";

  const subject = `Meeting Analysis | ${clientName ?? title} | ${dateStr}`;

  const transport = createTransport();

  logger.info("Sending meeting report email", { subject, recipients });

  await transport.sendMail({
    from: `"Digital Mojo Intelligence" <${process.env.ZOHO_SMTP_USER}>`,
    to: recipients.join(", "),
    subject,
    text: buildPlainText(meeting),
    html: buildEmailHtml(meeting),
  });

  logger.info("Email sent successfully", { subject });
}

export async function verifySmtpConnection(): Promise<boolean> {
  try {
    const transport = createTransport();
    await transport.verify();
    return true;
  } catch (err) {
    logger.error("SMTP connection verification failed", err);
    return false;
  }
}
