import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { verifyWebhook } from "@/services/fireflies";
import { processMeeting } from "@/jobs/pipeline";

// Allow up to 5 minutes — Claude analysis on long transcripts can take ~2 min
export const maxDuration = 300;

interface FirefliesWebhookPayload {
  meetingId?: string;
  transcriptId?: string;
  eventType?: string;
  clientReferenceId?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  const signature =
    request.headers.get("x-fireflies-signature") ??
    request.headers.get("x-hub-signature-256") ??
    "";

  if (!verifyWebhook(rawBody, signature)) {
    logger.warn("Webhook signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: FirefliesWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as FirefliesWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  logger.info("Fireflies webhook received", {
    eventType: payload.eventType,
    meetingId: payload.meetingId,
    transcriptId: payload.transcriptId,
  });

  const firefliesId =
    payload.transcriptId ??
    payload.meetingId ??
    payload.clientReferenceId;

  if (!firefliesId) {
    logger.warn("Webhook payload missing meeting/transcript ID", { payload });
    return NextResponse.json(
      { error: "Missing meetingId or transcriptId" },
      { status: 400 }
    );
  }

  // Fireflies sends no eventType field — the event is selected in the dashboard.
  // Accept anything that looks transcript-related, or an empty/missing eventType.
  const event = (payload.eventType ?? "").toLowerCase();
  const isTranscriptReady =
    event.includes("transcript") ||
    event.includes("completed") ||
    event.includes("ready") ||
    event === "";

  if (!isTranscriptReady) {
    logger.info("Ignoring non-transcript webhook event", { event });
    return NextResponse.json({ received: true, queued: false });
  }

  // Process synchronously so Render's web service handles everything — no
  // separate worker process required. The processed_meetings table prevents
  // double-processing if the 15-min polling fallback also picks up this meeting.
  try {
    const result = await processMeeting(firefliesId);
    logger.info("Webhook processing complete", { firefliesId, result });
    return NextResponse.json({ received: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("Webhook processing failed", { firefliesId, error: msg });
    // Return 200 so Fireflies doesn't retry — we log the failure and the
    // 15-min polling fallback will attempt to reprocess it.
    return NextResponse.json({ received: true, error: msg }, { status: 200 });
  }
}
