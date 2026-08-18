import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { pollNow } from "@/jobs/queues";

export async function POST(request: NextRequest): Promise<NextResponse> {
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
