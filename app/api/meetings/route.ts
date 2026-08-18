import { NextRequest, NextResponse } from "next/server";
import { getSession, canAccessAllMeetings } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { AnalyticsFilters } from "@/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filters: AnalyticsFilters = {
    client: searchParams.get("client") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    riskLevel: (searchParams.get("riskLevel") as AnalyticsFilters["riskLevel"]) ?? undefined,
    sentiment: (searchParams.get("sentiment") as AnalyticsFilters["sentiment"]) ?? undefined,
  };

  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));

  const where: Prisma.MeetingWhereInput = {};

  if (filters.client) {
    where.clientName = { contains: filters.client, mode: "insensitive" };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.meetingDate = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
    };
  }

  if (filters.riskLevel || filters.sentiment) {
    where.analysis = {
      ...(filters.riskLevel ? { riskLevel: filters.riskLevel } : {}),
      ...(filters.sentiment ? { clientSentiment: filters.sentiment } : {}),
    };
  }

  // Employees only see their own meetings
  if (!canAccessAllMeetings(session.role)) {
    where.participants = {
      some: { email: session.email },
    };
  }

  const [meetings, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      include: {
        analysis: {
          select: {
            overallTeamScore: true,
            clientHealthScore: true,
            clientSentiment: true,
            riskLevel: true,
          },
        },
        participants: { select: { name: true, email: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { meetingDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.meeting.count({ where }),
  ]);

  return NextResponse.json({
    data: meetings,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
