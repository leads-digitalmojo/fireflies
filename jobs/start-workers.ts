import "dotenv/config";
import { gracefulShutdown, transcriptWorker, analysisWorker, emailWorker, pollingWorker } from "./workers";
import { schedulePolling, pollNow } from "./queues";
import { logger } from "@/lib/logger";

async function main() {
  logger.info("Starting Digital Mojo Meeting Intelligence workers...");

  // Register the recurring every-5-minute cron
  await schedulePolling();

  // Trigger an immediate poll right now — don't wait for the first cron tick
  await pollNow();

  logger.info("Workers started", {
    workers: ["polling", "transcript", "analysis", "email"],
    schedule: "Fireflies polled immediately + every 5 minutes",
  });

  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received — shutting down");
    await gracefulShutdown();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received — shutting down");
    await gracefulShutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error("Failed to start workers", err);
  process.exit(1);
});

// Keep process alive
void [transcriptWorker, analysisWorker, emailWorker, pollingWorker];
