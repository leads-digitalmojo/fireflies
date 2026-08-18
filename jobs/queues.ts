import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

export const QUEUE_NAMES = {
  TRANSCRIPT_PROCESSING: "transcript-processing",
  MEETING_ANALYSIS: "meeting-analysis",
  EMAIL_DELIVERY: "email-delivery",
  POLLING: "fireflies-polling",
} as const;

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 200 },
};

export const transcriptQueue = new Queue(QUEUE_NAMES.TRANSCRIPT_PROCESSING, {
  connection: redis,
  defaultJobOptions,
});

export const analysisQueue = new Queue(QUEUE_NAMES.MEETING_ANALYSIS, {
  connection: redis,
  defaultJobOptions: { ...defaultJobOptions, attempts: 2 },
});

export const emailQueue = new Queue(QUEUE_NAMES.EMAIL_DELIVERY, {
  connection: redis,
  defaultJobOptions: { ...defaultJobOptions, attempts: 5 },
});

export const pollingQueue = new Queue(QUEUE_NAMES.POLLING, {
  connection: redis,
  defaultJobOptions: { removeOnComplete: 10, removeOnFail: 50 },
});

export async function queueTranscriptProcessing(firefliesId: string) {
  // No static jobId — processed_meetings is the deduplication layer.
  return transcriptQueue.add("process-transcript", { firefliesId });
}

// firefliesId is threaded through so the email worker can mark processed_meetings
export async function queueMeetingAnalysis(meetingId: string, firefliesId: string) {
  return analysisQueue.add(
    "analyze-meeting",
    { meetingId, firefliesId },
    { jobId: `analysis-${meetingId}` }
  );
}

export async function queueEmailDelivery(meetingId: string, firefliesId: string) {
  return emailQueue.add(
    "send-email",
    { meetingId, firefliesId },
    { jobId: `email-${meetingId}` }
  );
}

export async function schedulePolling() {
  await pollingQueue.add(
    "poll-fireflies",
    { limit: 20 },
    {
      repeat: { pattern: "* * * * *" },
      jobId: "fireflies-poll-recurring",
    }
  );
}

export async function pollNow() {
  return pollingQueue.add(
    "poll-now",
    { limit: 20 },
    { jobId: `poll-startup-${Date.now()}` }
  );
}
