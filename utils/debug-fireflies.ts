import "dotenv/config";
import fs from "fs";
import path from "path";

const FIREFLIES_ID = "01KYS5QD6WZA2BQA2099BWZ8T1";
const API_URL = "https://api.fireflies.ai/graphql";

async function gql(label: string, query: string, variables?: Record<string, unknown>) {
  const body = JSON.stringify({ query, variables });

  console.log(`\n${"─".repeat(60)}`);
  console.log(`QUERY: ${label}`);
  console.log("SENT BODY:", body);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIREFLIES_API_KEY}`,
    },
    body,
  });

  const text = await res.text();
  console.log(`HTTP STATUS: ${res.status} ${res.statusText}`);
  console.log("RAW RESPONSE:", text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { rawText: text };
  }

  return { label, status: res.status, body: parsed };
}

async function main() {
  if (!process.env.FIREFLIES_API_KEY) {
    console.error("FIREFLIES_API_KEY is not set in .env");
    process.exit(1);
  }

  console.log(`\nDebugging Fireflies ID: ${FIREFLIES_ID}`);
  console.log(`API key: ${process.env.FIREFLIES_API_KEY?.slice(0, 8)}...`);

  const results: unknown[] = [];

  // ── Probe 1: singular transcript query with id ─────────────────────────────
  const r1 = await gql(
    "transcript(id:) — minimal fields",
    `query GetTranscript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
      }
    }`,
    { id: FIREFLIES_ID }
  );
  results.push(r1);

  // ── Probe 2: try transcriptId as argument name ─────────────────────────────
  const r2 = await gql(
    "transcript(transcriptId:) — minimal fields",
    `query GetTranscript($transcriptId: String!) {
      transcript(transcriptId: $transcriptId) {
        id
        title
        date
        duration
      }
    }`,
    { transcriptId: FIREFLIES_ID }
  );
  results.push(r2);

  // ── Probe 3: list recent and see if ID appears ─────────────────────────────
  const r3 = await gql(
    "transcripts list (limit 5) — check if ID appears",
    `query {
      transcripts(limit: 5) {
        id
        title
        date
      }
    }`
  );
  results.push(r3);

  // ── Probe 4: full fields with working query shape ──────────────────────────
  const r4 = await gql(
    "transcript — full fields including sentences",
    `query GetTranscript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        sentences {
          index
          speaker_name
          raw_text
          start_time
          end_time
        }
        speakers {
          name
          email
          duration
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
      }
    }`,
    { id: FIREFLIES_ID }
  );
  results.push(r4);

  // ── Save everything to debug file ─────────────────────────────────────────
  const debugPath = path.join(process.cwd(), "debug", "fireflies-error.json");
  fs.writeFileSync(debugPath, JSON.stringify({ id: FIREFLIES_ID, probes: results }, null, 2));

  console.log(`\n${"═".repeat(60)}`);
  console.log(`Full debug output saved to: ${debugPath}`);

  // ── Print verdict ──────────────────────────────────────────────────────────
  console.log("\n── VERDICT ──");
  for (const r of results as Array<{ label: string; status: number; body: unknown }>) {
    const body = r.body as { data?: unknown; errors?: unknown[] };
    const hasData = body?.data && Object.values(body.data as object).some(Boolean);
    const hasErrors = (body?.errors ?? []).length > 0;
    const icon = hasData ? "✅" : hasErrors ? "❌" : "⚠️ ";
    console.log(`${icon}  [${r.status}] ${r.label}`);
    if (hasErrors) {
      console.log("     Errors:", JSON.stringify(body.errors, null, 2));
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
