import "dotenv/config";
import { Worker, Job } from "bullmq";
import { redis } from "@/lib/redis";
import { prisma, Prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { listRecentTranscripts, syncMeeting } from "@/services/fireflies";
import { analyzeTranscript } from "@/services/gemini";
import { sendMeetingReport } from "@/services/email";
import { QUEUE_NAMES, queueMeetingAnalysis, queueEmailDelivery } from "./queues";
import type { ActionItem, EmployeeScore, TeamBreakdown, GeminiAnalysis } from "@/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function step(n: number, message: string, extra?: Record<string, unknown>) {
  logger.info(`[${n}] ${message}`, extra);
}

// 30-minute stale threshold for in-flight jobs
const STALE_MS = 30 * 60 * 1000;
// 1-hour wait before retrying a failed meeting
const RETRY_AFTER_MS = 60 * 60 * 1000;

async function markFailed(firefliesMeetingId: string, error: string) {
  await prisma.processedMeeting
    .update({
      where: { firefliesMeetingId },
      data: { status: "failed", error },
    })
    .catch(() => {
      // record might not exist if failure happened before create
    });
}

// ── [1][2] Polling Worker — runs every 5 min ──────────────────────────────────

const pollingWorker = new Worker(
  QUEUE_NAMES.POLLING,
  async (job: Job<{ limit?: number }>) => {
    step(1, "Checking Fireflies for new meetings");

    const transcripts = await listRecentTranscripts(job.data.limit ?? 20);
    let queued = 0;

    for (const t of transcripts) {
      const existing = await prisma.processedMeeting.findUnique({
        where: { firefliesMeetingId: t.id },
      });

      if (existing) {
        if (existing.status === "completed") continue;

        // Allow retry of failed meetings after RETRY_AFTER_MS
        if (existing.status === "failed") {
          const age = Date.now() - existing.createdAt.getTime();
          if (age < RETRY_AFTER_MS) continue;
          await prisma.processedMeeting.update({
            where: { firefliesMeetingId: t.id },
            data: { status: "processing", error: null },
          });
        }

        // Skip in-flight jobs unless they're stale
        if (existing.status === "processing") {
          const age = Date.now() - existing.createdAt.getTime();
          if (age < STALE_MS) continue;
          // Stale — reset and retry
          await prisma.processedMeeting.update({
            where: { firefliesMeetingId: t.id },
            data: { status: "processing", error: null },
          });
        }
      } else {
        // Claim this meeting atomically via unique constraint
        try {
          await prisma.processedMeeting.create({
            data: { firefliesMeetingId: t.id, status: "processing" },
          });
        } catch {
          // Another worker already claimed it — skip
          continue;
        }
      }

      step(2, `New meeting found: "${t.title}"`, { firefliesId: t.id });

      // No static jobId — processed_meetings table is the deduplication layer.
      // A static jobId would cause BullMQ to silently return the old failed job
      // instead of creating a new one, permanently blocking retries.
      await import("./queues").then((q) =>
        q.transcriptQueue.add("process-transcript", { firefliesId: t.id })
      );
      queued++;
    }

    logger.info(
      queued > 0
        ? `Queued ${queued} new meeting(s) for processing`
        : "No new meetings found — all up to date",
      { checked: transcripts.length, queued }
    );

    return { checked: transcripts.length, queued };
  },
  { connection: redis, concurrency: 1 }
);

// ── [3] Transcript Worker — fetches full transcript + stores in DB ─────────────

const transcriptWorker = new Worker(
  QUEUE_NAMES.TRANSCRIPT_PROCESSING,
  async (job: Job<{ firefliesId: string }>) => {
    const { firefliesId } = job.data;

    let meetingId: string;
    try {
      meetingId = await syncMeeting(firefliesId);
    } catch (err) {
      const e = err as Error;
      logger.error("Transcript fetch failed", {
        firefliesId,
        message: e.message,
        stack: e.stack,
      });
      await markFailed(firefliesId, e.message ?? String(err));
      throw err;
    }

    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    const wordCount = meeting?.transcript?.split(/\s+/).filter(Boolean).length ?? 0;

    // Fireflies returns the meeting immediately but may not have finished
    // transcribing yet — transcript will be empty or near-empty. Reset the
    // processed_meetings record so the next 5-min poll retries automatically
    // rather than marking it failed and waiting an hour.
    if (wordCount < 20) {
      logger.info(`[3] Transcript not ready yet for "${meeting?.title ?? firefliesId}" (${wordCount} words) — will retry on next poll`, {
        firefliesId,
        meetingId,
        words: wordCount,
      });
      await prisma.processedMeeting.delete({ where: { firefliesMeetingId: firefliesId } }).catch(() => {});
      return { meetingId, skipped: true };
    }

    step(3, `Transcript downloaded: "${meeting?.title ?? firefliesId}"`, {
      firefliesId,
      meetingId,
      words: wordCount,
    });

    await queueMeetingAnalysis(meetingId, firefliesId);

    return { meetingId };
  },
  { connection: redis, concurrency: 2 }
);

// ── [4][5][6] Analysis Worker — Gemini + store in DB ──────────────────────────

const analysisWorker = new Worker(
  QUEUE_NAMES.MEETING_ANALYSIS,
  async (job: Job<{ meetingId: string; firefliesId: string }>) => {
    const { meetingId, firefliesId } = job.data;

    const meeting = await prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
    });

    if (!meeting.transcript) {
      throw new Error(`Meeting ${meetingId} has no transcript`);
    }

    step(4, `Sending to Claude`, {
      meetingId,
      title: meeting.title,
      transcriptLength: meeting.transcript.length,
    });

    let analysis: GeminiAnalysis;
    try {
      analysis = await analyzeTranscript(meeting.transcript, meeting.title);
    } catch (err) {
      await markFailed(firefliesId, String(err));
      throw err;
    }

    step(5, "Analysis completed", {
      teamScore: analysis.overallTeamScore,
      clientHealth: analysis.clientHealthScore,
      risk: analysis.riskLevel,
      sentiment: analysis.clientSentiment,
    });

    step(6, "Saving to database", { meetingId });

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

    await queueEmailDelivery(meetingId, firefliesId);

    return { meetingId };
  },
  { connection: redis, concurrency: 1 }
);

// ── [7][8] Email Worker — send report + mark processed ────────────────────────

const emailWorker = new Worker(
  QUEUE_NAMES.EMAIL_DELIVERY,
  async (job: Job<{ meetingId: string; firefliesId: string }>) => {
    const { meetingId, firefliesId } = job.data;

    const meeting = await prisma.meeting.findUniqueOrThrow({
      where: { id: meetingId },
      include: { analysis: true, participants: true },
    });

    if (!meeting.analysis) {
      throw new Error(`Meeting ${meetingId} has no analysis`);
    }

    const recipients = [process.env.CEO_EMAIL, process.env.HR_EMAIL]
      .filter(Boolean)
      .join(", ");

    step(7, `Sending email to ${recipients}`, { meetingId, title: meeting.title });

    const meetingWithAnalysis = {
      ...meeting,
      analysis: {
        ...meeting.analysis,
        overallTeamScore: Number(meeting.analysis.overallTeamScore),
        clientHealthScore: Number(meeting.analysis.clientHealthScore),
        summary: (meeting.analysis.summary as unknown as string[]) ?? [],
        minutesOfMeeting: (meeting.analysis.minutesOfMeeting as unknown as string[]) ?? [],
        actionItems: (meeting.analysis.actionItems as unknown as ActionItem[]) ?? [],
        risks: (meeting.analysis.risks as unknown as string[]) ?? [],
        recommendations: (meeting.analysis.recommendations as unknown as string[]) ?? [],
        employeeScores: (meeting.analysis.employeeScores as unknown as EmployeeScore[]) ?? [],
        teamBreakdown: meeting.analysis.teamBreakdown as unknown as TeamBreakdown | null,
      },
    };

    try {
      await sendMeetingReport(meetingWithAnalysis);
    } catch (err) {
      await markFailed(firefliesId, String(err));
      throw err;
    }

    await prisma.processedMeeting.update({
      where: { firefliesMeetingId: firefliesId },
      data: { status: "completed", processedAt: new Date() },
    });

    step(8, `Marked as processed ✓`, { firefliesId, meetingId });

    return { meetingId };
  },
  {
    connection: redis,
    concurrency: 2,
    limiter: { max: 10, duration: 60000 },
  }
);

// ── Error handlers ────────────────────────────────────────────────────────────

function attachErrorHandlers(worker: Worker, name: string) {
  worker.on("failed", (job, err) => {
    logger.error(`${name} job failed`, { jobId: job?.id, jobData: job?.data, error: err });
  });

  worker.on("error", (err) => {
    logger.error(`${name} worker connection error`, err);
  });
}

attachErrorHandlers(pollingWorker, "polling");
attachErrorHandlers(transcriptWorker, "transcript");
attachErrorHandlers(analysisWorker, "analysis");
attachErrorHandlers(emailWorker, "email");

export { pollingWorker, transcriptWorker, analysisWorker, emailWorker };

export async function gracefulShutdown() {
  logger.info("Shutting down workers...");
  await Promise.all([
    pollingWorker.close(),
    transcriptWorker.close(),
    analysisWorker.close(),
    emailWorker.close(),
  ]);
  logger.info("All workers stopped");
}
