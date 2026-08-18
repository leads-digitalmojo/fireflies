-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CEO', 'HR', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meetings" (
    "id" TEXT NOT NULL,
    "firefliesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientName" TEXT,
    "meetingDate" TIMESTAMP(3),
    "duration" INTEGER,
    "transcript" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_analysis" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "overallTeamScore" DECIMAL(3,1) NOT NULL,
    "clientHealthScore" DECIMAL(3,1) NOT NULL,
    "clientSentiment" "Sentiment" NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "teamBreakdown" JSONB,
    "summary" JSONB,
    "minutesOfMeeting" JSONB,
    "actionItems" JSONB,
    "risks" JSONB,
    "recommendations" JSONB,
    "employeeScores" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT,
    "queue" TEXT NOT NULL,
    "jobId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "meetings_firefliesId_key" ON "meetings"("firefliesId");

-- CreateIndex
CREATE INDEX "meetings_meetingDate_idx" ON "meetings"("meetingDate");

-- CreateIndex
CREATE INDEX "meetings_clientName_idx" ON "meetings"("clientName");

-- CreateIndex
CREATE INDEX "participants_meetingId_idx" ON "participants"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_analysis_meetingId_key" ON "meeting_analysis"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_analysis_riskLevel_idx" ON "meeting_analysis"("riskLevel");

-- CreateIndex
CREATE INDEX "meeting_analysis_clientSentiment_idx" ON "meeting_analysis"("clientSentiment");

-- CreateIndex
CREATE UNIQUE INDEX "processing_jobs_jobId_key" ON "processing_jobs"("jobId");

-- CreateIndex
CREATE INDEX "processing_jobs_status_idx" ON "processing_jobs"("status");

-- CreateIndex
CREATE INDEX "processing_jobs_queue_idx" ON "processing_jobs"("queue");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_analysis" ADD CONSTRAINT "meeting_analysis_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
