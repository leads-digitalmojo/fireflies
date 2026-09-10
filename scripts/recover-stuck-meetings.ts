/**
 * One-time recovery script: queue all meetings that have transcripts in DB
 * but were never analyzed/emailed directly to the analysis queue.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/recover-stuck-meetings.ts
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { analysisQueue } from "@/jobs/queues";
import { logger } from "@/lib/logger";

async function main() {
  // Find all meetings that have a transcript in DB but no analysis yet,
  // and whose processedMeeting record is not yet completed.
  const stuck = await prisma.$queryRaw<
    Array<{ firefliesId: string; meetingId: string; title: string; transcript_len: number }>
  >`
    SELECT
      m."firefliesId" AS "firefliesId",
      m.id            AS "meetingId",
      m.title,
      length(m.transcript) AS transcript_len
    FROM meetings m
    INNER JOIN processed_meetings pm ON pm."firefliesMeetingId" = m."firefliesId"
    LEFT JOIN meeting_analysis ma ON ma."meetingId" = m.id
    WHERE ma.id IS NULL
      AND pm.status != 'completed'
      AND m.transcript IS NOT NULL
      AND length(m.transcript) > 200
    ORDER BY length(m.transcript) ASC
  `;

  console.log(`Found ${stuck.length} meetings to recover`);

  for (const meeting of stuck) {
    // Reset processedMeeting to 'processing' so the email worker can mark it
    // completed once analysis + email are done.
    await prisma.processedMeeting.update({
      where: { firefliesMeetingId: meeting.firefliesId },
      data: { status: "processing", error: null },
    });

    // Queue directly to analysis — transcript already in DB, no Fireflies API call.
    // Use a unique jobId so BullMQ doesn't deduplicate against old stuck jobs.
    await analysisQueue.add(
      "analyze-meeting",
      { meetingId: meeting.meetingId, firefliesId: meeting.firefliesId },
      { jobId: `analysis-recover-${meeting.meetingId}` }
    );

    console.log(`Queued: "${meeting.title}" (${meeting.transcript_len} chars)`);
    logger.info("Recovery: queued for analysis", {
      title: meeting.title,
      meetingId: meeting.meetingId,
      firefliesId: meeting.firefliesId,
    });
  }

  console.log("Done. Restart the worker if it is not already running.");
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Recovery script failed:", err);
  process.exit(1);
});
