import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { pollNow } from "@/jobs/queues";
import { listRecentTranscripts } from "@/services/fireflies";
import { processMeeting } from "@/jobs/pipeline";
import { prisma } from "@/lib/prisma";

// Allow up to 5 minutes for the cron path — may process several meetings
export const maxDuration = 300;

// ── Cron path — called by GitHub Actions every 15 min ────────────────────────
// Authenticates via x-cron-secret header. Runs the polling pipeline
// synchronously (no BullMQ worker needed on Render).
async function handleCronSync(limit = 10) {
  const transcripts = await listRecentTranscripts(limit);
  const results: Array<{ id: string; status: string }> = [];

  for (const t of transcripts) {
    // Skip meetings already fully processed
    const existing = await prisma.processedMeeting.findUnique({
      where: { firefliesMeetingId: t.id },
    });
    if (existing?.status === "completed") continue;

    try {
      const result = await processMeeting(t.id);
      results.push({ id: t.id, status: result.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Cron sync failed for meeting", { firefliesId: t.id, error: msg });
      results.push({ id: t.id, status: "error" });
    }
  }

  return results;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Auth: GitHub Actions cron uses x-cron-secret header ──────────────────
  const cronSecret = process.env.CRON_SECRET;
  const incomingSecret = request.headers.get("x-cron-secret");

  logger.info("CRON_SECRET debug", { hasCronSecret: !!cronSecret, cronSecretLen: cronSecret?.length, hasIncoming: !!incomingSecret, incomingLen: incomingSecret?.length, match: incomingSecret === cronSecret });
  if (cronSecret && incomingSecret && incomingSecret === cronSecret) {
    logger.info("Cron sync triggered via secret header");
    try {
      const results = await handleCronSync();
      const processed = results.filter((r) => r.status === "completed").length;
      const skipped = results.filter((r) => r.status === "skipped" || r.status === "duplicate").length;
      const errors = results.filter((r) => r.status === "error").length;
      logger.info("Cron sync complete", { processed, skipped, errors, total: results.length });
      return NextResponse.json({ ok: true, processed, skipped, errors, results });
    } catch (err) {
      logger.error("Cron sync failed", err);
      return NextResponse.json({ error: "Cron sync failed" }, { status: 500 });
    }
  }

  // ── Auth: Dashboard UI uses JWT session cookie ────────────────────────────
  const session = await getSession();
  if (!session || !["CEO", "HR", "MANAGER"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logger.info("Manual sync triggered", { by: session.email });

  try {
    await pollNow();
    return NextResponse.json({ queued: true, message: "Poll job enqueued" });
  } catch (err) {
    logger.error("Sync trigger failed", err);
    return NextResponse.json({ error: "Failed to enqueue poll" }, { status: 500 });
  }
}
