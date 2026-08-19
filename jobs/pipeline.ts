import { prisma, Prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { syncMeeting } from "@/services/fireflies";
import { analyzeTranscript } from "@/services/gemini";
import { sendMeetingReport } from "@/services/email";
import type { ActionItem, EmployeeScore, TeamBreakdown, GeminiAnalysis } from "@/types";

const STALE_MS = 30 * 60 * 1000;

async function markFailed(firefliesMeetingId: string, error: string) {
  await prisma.processedMeeting
    .update({ where: { firefliesMeetingId }, data: { status: "failed", error } })
    .catch(() => {});
}

export type PipelineResult =
  | { status: "completed"; meetingId: string }
  | { status: "skipped"; meetingId: string }
  | { status: "duplicate" };

/**
 * Full end-to-end pipeline: fetch transcript → Claude analysis → email.
 * Uses the processed_meetings table for deduplication so it's safe to call
 * from both the webhook handler (synchronous) and the BullMQ polling workers.
 */
export async function processMeeting(firefliesId: string): Promise<PipelineResult> {
  // ── Deduplication ────────────────────────────────────────────────────────────
  const existing = await prisma.processedMeeting.findUnique({
    where: { firefliesMeetingId: firefliesId },
  });

  if (existing?.status === "completed") {
    logger.info("Meeting already processed — skipping", { firefliesId });
    return { status: "duplicate" };
  }

  if (existing?.status === "processing") {
    const age = Date.now() - existing.createdAt.getTime();
    if (age < STALE_MS) {
      logger.info("Meeting already in-flight — skipping", { firefliesId });
      return { status: "duplicate" };
    }
    // Stale lock — reset and take over
    await prisma.processedMeeting.update({
      where: { firefliesMeetingId: firefliesId },
      data: { status: "processing", error: null },
    });
  } else if (!existing) {
    try {
      await prisma.processedMeeting.create({
        data: { firefliesMeetingId: firefliesId, status: "processing" },
      });
    } catch {
      // Unique constraint — another process already claimed it
      return { status: "duplicate" };
    }
  }

  // ── Step 1: Fetch transcript from Fireflies ──────────────────────────────────
  let meetingId: string;
  try {
    meetingId = await syncMeeting(firefliesId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[pipeline] Transcript fetch failed", { firefliesId, error: msg });
    await markFailed(firefliesId, msg);
    throw err;
  }

  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
  const wordCount = meeting?.transcript?.split(/\s+/).filter(Boolean).length ?? 0;

  // Fireflies may return before transcription is complete — reset so next poll retries
  if (wordCount < 20) {
    logger.info(`[pipeline] Transcript not ready (${wordCount} words) — will retry on next poll`, {
      firefliesId,
      meetingId,
      words: wordCount,
    });
    await prisma.processedMeeting.delete({ where: { firefliesMeetingId: firefliesId } }).catch(() => {});
    return { status: "skipped", meetingId };
  }

  logger.info(`[pipeline] Transcript ready: "${meeting?.title ?? firefliesId}"`, {
    firefliesId,
    meetingId,
    words: wordCount,
  });

  // ── Step 2: Claude analysis ──────────────────────────────────────────────────
  let analysis: GeminiAnalysis;
  try {
    analysis = await analyzeTranscript(meeting!.transcript!, meeting!.title);
  } catch (err) {
    await markFailed(firefliesId, String(err));
    throw err;
  }

  logger.info("[pipeline] Analysis completed", {
    teamScore: analysis.overallTeamScore,
    clientHealth: analysis.clientHealthScore,
    risk: analysis.riskLevel,
    sentiment: analysis.clientSentiment,
  });

  // ── Step 3: Persist analysis ─────────────────────────────────────────────────
  const sentimentMap = { POSITIVE: "POSITIVE", NEUTRAL: "NEUTRAL", NEGATIVE: "NEGATIVE" } as const;
  const riskMap = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", CRITICAL: "CRITICAL" } as const;

  const jsonFields = {
    teamBreakdown: analysis.teamBreakdown as unknown as Prisma.InputJsonValue,
    summary: analysis.summary as unknown as Prisma.InputJsonValue,
    minutesOfMeeting: analysis.minutesOfMeeting as unknown as Prisma.InputJsonValue,
    actionItems: analysis.actionItems as unknown as Prisma.InputJsonValue,
    risks: analysis.risks as unknown as Prisma.InputJsonValue,
    recommendations: analysis.recommendations as unknown as Prisma.InputJsonValue,
    employeeScores: analysis.employeeScores as unknown as Prisma.InputJsonValue,
  };

  await prisma.meetingAnalysis.upsert({
    where: { meetingId },
    update: {
      overallTeamScore: analysis.overallTeamScore,
      clientHealthScore: analysis.clientHealthScore,
      clientSentiment: sentimentMap[analysis.clientSentiment],
      riskLevel: riskMap[analysis.riskLevel],
      ...jsonFields,
    },
    create: {
      meetingId,
      overallTeamScore: analysis.overallTeamScore,
      clientHealthScore: analysis.clientHealthScore,
      clientSentiment: sentimentMap[analysis.clientSentiment],
      riskLevel: riskMap[analysis.riskLevel],
      ...jsonFields,
    },
  });

  // ── Step 4: Send email ───────────────────────────────────────────────────────
  const fullMeeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: { analysis: true, participants: true },
  });

  const meetingForEmail = {
    ...fullMeeting,
    analysis: {
      ...fullMeeting.analysis!,
      overallTeamScore: Number(fullMeeting.analysis!.overallTeamScore),
      clientHealthScore: Number(fullMeeting.analysis!.clientHealthScore),
      summary: (fullMeeting.analysis!.summary as unknown as string[]) ?? [],
      minutesOfMeeting: (fullMeeting.analysis!.minutesOfMeeting as unknown as string[]) ?? [],
      actionItems: (fullMeeting.analysis!.actionItems as unknown as ActionItem[]) ?? [],
      risks: (fullMeeting.analysis!.risks as unknown as string[]) ?? [],
      recommendations: (fullMeeting.analysis!.recommendations as unknown as string[]) ?? [],
      employeeScores: (fullMeeting.analysis!.employeeScores as unknown as EmployeeScore[]) ?? [],
      teamBreakdown: fullMeeting.analysis!.teamBreakdown as unknown as TeamBreakdown | null,
    },
  };

  try {
    await sendMeetingReport(meetingForEmail);
  } catch (err) {
    await markFailed(firefliesId, String(err));
    throw err;
  }

  // ── Step 5: Mark completed ───────────────────────────────────────────────────
  await prisma.processedMeeting.update({
    where: { firefliesMeetingId: firefliesId },
    data: { status: "completed", processedAt: new Date() },
  });

  logger.info("[pipeline] Meeting fully processed ✓", { firefliesId, meetingId });

  return { status: "completed", meetingId };
}
