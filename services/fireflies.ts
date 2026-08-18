import fs from "fs";
import path from "path";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type {
  FirefliesTranscript,
  FirefliesSentence,
  FirefliesAttendee,
} from "@/types";

const FIREFLIES_API_URL = "https://api.fireflies.ai/graphql";

function saveDebug(filename: string, data: unknown) {
  try {
    const dir = path.join(process.cwd(), "debug");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2));
  } catch {
    // non-fatal
  }
}

async function graphqlRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const requestBody = { query, variables };

  logger.debug("Fireflies GraphQL request", {
    url: FIREFLIES_API_URL,
    variables,
    query: query.replace(/\s+/g, " ").trim(),
  });

  let rawText = "";
  let httpStatus = 0;

  try {
    const response = await fetch(FIREFLIES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.FIREFLIES_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    httpStatus = response.status;
    rawText = await response.text();

    logger.debug("Fireflies GraphQL response", { status: httpStatus, body: rawText.slice(0, 500) });

    if (!response.ok) {
      saveDebug("fireflies-error.json", { requestBody, httpStatus, rawResponse: rawText });
      throw new Error(
        `Fireflies API HTTP error: ${response.status} ${response.statusText}\nBody: ${rawText.slice(0, 300)}`
      );
    }

    const json = JSON.parse(rawText) as { data?: T; errors?: unknown[] };

    if (json.errors?.length) {
      saveDebug("fireflies-error.json", { requestBody, httpStatus, json });
      logger.error("Fireflies GraphQL errors", {
        errors: json.errors,
        variables,
        query: query.replace(/\s+/g, " ").trim(),
      });
      throw new Error(
        `Fireflies GraphQL error: ${JSON.stringify(json.errors)}`
      );
    }

    return json.data as T;
  } catch (err) {
    if (!(err instanceof Error && err.message.startsWith("Fireflies"))) {
      // unexpected error (network, JSON parse, etc.)
      saveDebug("fireflies-error.json", { requestBody, httpStatus, rawResponse: rawText, error: String(err) });
      logger.error("Fireflies request failed (unexpected)", {
        message: (err as Error).message,
        stack: (err as Error).stack,
        httpStatus,
        rawResponse: rawText.slice(0, 500),
        variables,
      });
    }
    throw err;
  }
}

const TRANSCRIPT_FIELDS = `
  id
  title
  date
  duration
  transcript_url
  sentences {
    index
    speaker_name
    raw_text
    start_time
    end_time
  }
  speakers {
    name
  }
  meeting_attendees {
    displayName
    email
    name
  }
  summary {
    keywords
    action_items
    outline
    overview
    shorthand_bullet
  }
`;

export async function getTranscriptById(
  transcriptId: string
): Promise<FirefliesTranscript> {
  logger.info("Fetching Fireflies transcript", { transcriptId });

  const data = await graphqlRequest<{ transcript: FirefliesTranscript }>(
    `query GetTranscript($id: String!) {
      transcript(id: $id) {
        ${TRANSCRIPT_FIELDS}
      }
    }`,
    { id: transcriptId }
  );

  return data.transcript;
}

export async function getTranscriptDetails(
  transcriptId: string
): Promise<FirefliesTranscript> {
  return getTranscriptById(transcriptId);
}

export function buildFullTranscript(sentences: FirefliesSentence[]): string {
  return sentences
    .sort((a, b) => a.index - b.index)
    .map((s) => `${s.speaker_name}: ${s.raw_text}`)
    .join("\n");
}

export async function syncMeeting(firefliesId: string): Promise<string> {
  logger.info("Syncing meeting from Fireflies", { firefliesId });

  const transcript = await getTranscriptById(firefliesId);

  const fullTranscript = buildFullTranscript(transcript.sentences ?? []);

  const attendees: FirefliesAttendee[] = transcript.meeting_attendees ?? [];

  const clientName = deriveClientName(transcript.title, attendees);

  const meeting = await prisma.meeting.upsert({
    where: { firefliesId: transcript.id },
    update: {
      title: transcript.title,
      clientName,
      meetingDate: new Date(transcript.date * 1000),
      duration: transcript.duration,
      transcript: fullTranscript,
      rawJson: transcript as object,
      updatedAt: new Date(),
    },
    create: {
      firefliesId: transcript.id,
      title: transcript.title,
      clientName,
      meetingDate: new Date(transcript.date * 1000),
      duration: transcript.duration,
      transcript: fullTranscript,
      rawJson: transcript as object,
    },
  });

  // Upsert participants
  if (attendees.length > 0) {
    await prisma.meetingParticipant.deleteMany({ where: { meetingId: meeting.id } });
    await prisma.meetingParticipant.createMany({
      data: attendees.map((a) => ({
        meetingId: meeting.id,
        name: a.displayName ?? a.name ?? "Unknown",
        email: a.email ?? null,
        role: null,
      })),
    });
  }

  logger.info("Meeting synced successfully", { meetingId: meeting.id, firefliesId });
  return meeting.id;
}

function deriveClientName(
  title: string,
  attendees: FirefliesAttendee[]
): string | null {
  // Attempt to extract client name from title patterns like "Call with Acme Corp"
  const patterns = [
    /(?:call|meeting|sync|chat|discussion)\s+with\s+(.+)/i,
    /(.+?)\s+-\s+(?:call|meeting|sync)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  // Fall back to external attendee domain
  const internalDomains = ["digitalmojo.in"];
  const external = attendees.find((a) => {
    if (!a.email) return false;
    const domain = a.email.split("@")[1];
    return domain && !internalDomains.includes(domain);
  });

  if (external?.email) {
    return external.email.split("@")[1].replace(/\.(com|in|io|co)$/i, "");
  }

  return null;
}

export async function listRecentTranscripts(
  limit = 20
): Promise<Array<{ id: string; title: string; date: number }>> {
  const data = await graphqlRequest<{
    transcripts: Array<{ id: string; title: string; date: number }>;
  }>(
    `query ListTranscripts($limit: Int) {
      transcripts(limit: $limit) {
        id
        title
        date
      }
    }`,
    { limit }
  );
  return data.transcripts ?? [];
}

export async function syncRecentMeetings(limit = 20): Promise<string[]> {
  logger.info("Syncing recent meetings", { limit });

  const data = await graphqlRequest<{ transcripts: FirefliesTranscript[] }>(
    `query GetTranscripts($limit: Int) {
      transcripts(limit: $limit) {
        ${TRANSCRIPT_FIELDS}
      }
    }`,
    { limit }
  );

  const meetingIds: string[] = [];

  for (const transcript of data.transcripts ?? []) {
    try {
      const id = await syncMeeting(transcript.id);
      meetingIds.push(id);
    } catch (err) {
      logger.error("Failed to sync meeting", { firefliesId: transcript.id, err });
    }
  }

  return meetingIds;
}

export function verifyWebhook(
  payload: string,
  signature: string
): boolean {
  // Fireflies sends HMAC-SHA256 in X-Fireflies-Signature header
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("FIREFLIES_WEBHOOK_SECRET not set, skipping verification");
    return true;
  }

  const crypto = require("crypto") as typeof import("crypto");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
