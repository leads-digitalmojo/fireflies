import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { verifyWebhook } from "@/services/fireflies";
import { queueTranscriptProcessing } from "@/jobs/queues";

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

  // Fireflies uses meetingId for the transcript webhook
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

  // Only process transcript-ready events
  const event = (payload.eventType ?? "").toLowerCase();
  const isTranscriptReady =
    event.includes("transcript") ||
    event.includes("completed") ||
    event.includes("ready") ||
    event === ""; // accept empty for manual triggers

  if (!isTranscriptReady) {
    logger.info("Ignoring non-transcript webhook event", { event });
    return NextResponse.json({ received: true, queued: false });
  }

  try {
    await queueTranscriptProcessing(firefliesId);
    logger.info("Transcript queued for processing", { firefliesId });
    return NextResponse.json({ received: true, queued: true });
  } catch (err) {
    logger.error("Failed to queue transcript", { firefliesId, err });
    return NextResponse.json(
      { error: "Failed to queue processing" },
      { status: 500 }
    );
  }
}
