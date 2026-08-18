import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import type { GeminiAnalysis } from "@/types";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set in environment");
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are the CEO's executive assistant analyzing meeting transcripts.
Evaluate: team performance, client health, risks, opportunities, meeting summary, minutes, action items, and employee-wise performance.
Rules:
- Scores are out of 10; be strict and objective; do not inflate scores
- Output ONLY valid JSON matching the exact schema provided — no markdown, no explanations, no code fences
- Identify deadlines and owners for action items
- Detect client frustration, upsell opportunities, churn risk, confidence, and professionalism
- If information is insufficient for a score, default to 5.0`;

function buildPrompt(transcript: string): string {
  return `Analyze the following meeting transcript and return ONLY this JSON structure:
{
  "overallTeamScore": <number 0-10>,
  "clientHealthScore": <number 0-10>,
  "clientSentiment": <"POSITIVE"|"NEUTRAL"|"NEGATIVE">,
  "riskLevel": <"LOW"|"MEDIUM"|"HIGH"|"CRITICAL">,
  "teamBreakdown": {
    "communication": <number 0-10>,
    "clarity": <number 0-10>,
    "professionalism": <number 0-10>,
    "problemSolving": <number 0-10>,
    "clientHandling": <number 0-10>
  },
  "summary": [<string>, ...],
  "minutesOfMeeting": [<string>, ...],
  "actionItems": [{"owner": <string>, "task": <string>, "deadline": <string>}, ...],
  "risks": [<string>, ...],
  "recommendations": [<string>, ...],
  "employeeScores": [{"name": <string>, "score": <number>, "strengths": [<string>], "improvements": [<string>]}, ...]
}

Scoring weights for overallTeamScore:
- communication: 25%
- professionalism: 20%
- clarity: 20%
- problemSolving: 20%
- clientHandling: 15%

Client health score bands: 9-10 excellent, 7-8.9 healthy, 5-6.9 warning, <5 critical.

TRANSCRIPT:
${transcript}`;
}

function extractJSON(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1);

  return raw.trim();
}

function normalizeAnalysis(raw: GeminiAnalysis): GeminiAnalysis {
  const clamp = (v: number) => Math.min(10, Math.max(0, Number(v.toFixed(1))));

  return {
    ...raw,
    overallTeamScore: clamp(raw.overallTeamScore),
    clientHealthScore: clamp(raw.clientHealthScore),
    clientSentiment: ["POSITIVE", "NEUTRAL", "NEGATIVE"].includes(raw.clientSentiment)
      ? raw.clientSentiment
      : "NEUTRAL",
    riskLevel: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(raw.riskLevel)
      ? raw.riskLevel
      : "MEDIUM",
    teamBreakdown: {
      communication: clamp(raw.teamBreakdown?.communication ?? 5),
      clarity: clamp(raw.teamBreakdown?.clarity ?? 5),
      professionalism: clamp(raw.teamBreakdown?.professionalism ?? 5),
      problemSolving: clamp(raw.teamBreakdown?.problemSolving ?? 5),
      clientHandling: clamp(raw.teamBreakdown?.clientHandling ?? 5),
    },
    summary: Array.isArray(raw.summary) ? raw.summary : [],
    minutesOfMeeting: Array.isArray(raw.minutesOfMeeting) ? raw.minutesOfMeeting : [],
    actionItems: Array.isArray(raw.actionItems) ? raw.actionItems : [],
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : [],
    employeeScores: Array.isArray(raw.employeeScores)
      ? raw.employeeScores.map((e) => ({
          ...e,
          score: clamp(e.score),
          strengths: Array.isArray(e.strengths) ? e.strengths : [],
          improvements: Array.isArray(e.improvements) ? e.improvements : [],
        }))
      : [],
  };
}

export async function analyzeTranscript(
  transcript: string,
  meetingTitle: string
): Promise<GeminiAnalysis> {
  logger.info("Sending transcript to Claude", { meetingTitle, length: transcript.length });

  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(transcript) }],
  });

  const rawText =
    message.content[0]?.type === "text" ? message.content[0].text : "";

  if (!rawText) {
    throw new Error("Claude returned empty response");
  }

  let parsed: GeminiAnalysis;
  try {
    const json = extractJSON(rawText);
    parsed = JSON.parse(json) as GeminiAnalysis;
  } catch (err) {
    logger.error("Failed to parse Claude response", { rawText, err });
    throw new Error("Claude response is not valid JSON");
  }

  const normalized = normalizeAnalysis(parsed);
  logger.info("Claude analysis complete", {
    meetingTitle,
    teamScore: normalized.overallTeamScore,
    clientScore: normalized.clientHealthScore,
    risk: normalized.riskLevel,
  });

  return normalized;
}
