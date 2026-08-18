CREATE TABLE "processed_meetings" (
    "id" TEXT NOT NULL,
    "firefliesMeetingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_meetings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processed_meetings_firefliesMeetingId_key" ON "processed_meetings"("firefliesMeetingId");
CREATE INDEX "processed_meetings_status_idx" ON "processed_meetings"("status");
