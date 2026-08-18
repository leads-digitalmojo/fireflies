import "dotenv/config";
import fs from "fs";
import path from "path";

const FIREFLIES_ID = "01KYS5QD6WZA2BQA2099BWZ8T1";
const API_URL = "https://api.fireflies.ai/graphql";

// ── Exact TRANSCRIPT_FIELDS from services/fireflies.ts ────────────────────────
// Copy verbatim so this script tests the real query, not a simplified one.
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

async function main() {
  if (!process.env.FIREFLIES_API_KEY) {
    console.error("FIREFLIES_API_KEY is not set");
    process.exit(1);
  }

  const query = `query GetTranscript($id: String!) {
    transcript(id: $id) {
      ${TRANSCRIPT_FIELDS}
    }
  }`;

  const variables = { id: FIREFLIES_ID };

  console.log("\n── GraphQL Query ──────────────────────────────────────────");
  console.log(query);

  console.log("\n── Variables ──────────────────────────────────────────────");
  console.log(JSON.stringify(variables, null, 2));

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.FIREFLIES_API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  console.log(`\n── HTTP Status ─────────────────────────────────────────────`);
  console.log(`${res.status} ${res.statusText}`);

  const rawText = await res.text();

  console.log("\n── Raw Fireflies Response ──────────────────────────────────");
  console.log(rawText);

  // Save to debug file
  const debugPath = path.join(process.cwd(), "debug", "fireflies-response.json");
  fs.mkdirSync(path.dirname(debugPath), { recursive: true });
  fs.writeFileSync(
    debugPath,
    JSON.stringify(
      {
        id: FIREFLIES_ID,
        httpStatus: res.status,
        query,
        variables,
        response: JSON.parse(rawText),
      },
      null,
      2
    )
  );
  console.log(`\n✓ Saved to ${debugPath}`);

  // Parse and verdict
  const json = JSON.parse(rawText) as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    console.log("\n❌ GraphQL errors found:");
    json.errors.forEach((e) => console.log(" •", e.message));
  } else if (json.data) {
    console.log("\n✅ Success — transcript fetched");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
