import { NextRequest, NextResponse } from "next/server";
import { getSession, canAccessEmployeeAnalytics } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session || !canAccessEmployeeAnalytics(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalMeetings,
    meetingsThisMonth,
    analyses,
    riskyCount,
  ] = await Promise.all([
    prisma.meeting.count(),
    prisma.meeting.count({ where: { meetingDate: { gte: monthStart } } }),
    prisma.meetingAnalysis.findMany({
      select: {
        overallTeamScore: true,
        clientHealthScore: true,
        clientSentiment: true,
        riskLevel: true,
        employeeScores: true,
        actionItems: true,
        createdAt: true,
      },
    }),
    prisma.meetingAnalysis.count({
      where: { riskLevel: { in: ["HIGH", "CRITICAL"] } },
    }),
  ]);

  const avgTeamScore =
    analyses.length > 0
      ? analyses.reduce((sum: number, a: any) => sum + Number(a.overallTeamScore), 0) /
        analyses.length
      : 0;

  const avgClientHealth =
    analyses.length > 0
      ? analyses.reduce((sum: number, a: any) => sum + Number(a.clientHealthScore), 0) /
        analyses.length
      : 0;

  // Aggregate employee scores across all meetings
  const employeeMap = new Map<
    string,
    { totalScore: number; count: number }
  >();

  for (const analysis of analyses) {
    const scores = analysis.employeeScores as Array<{
      name: string;
      score: number;
    }> | null;
    if (!Array.isArray(scores)) continue;
    for (const emp of scores) {
      const existing = employeeMap.get(emp.name) ?? { totalScore: 0, count: 0 };
      employeeMap.set(emp.name, {
        totalScore: existing.totalScore + emp.score,
        count: existing.count + 1,
      });
    }
  }

  const employeeRankings = Array.from(employeeMap.entries())
    .map(([name, { totalScore, count }]) => ({
      name,
      avgScore: Number((totalScore / count).toFixed(1)),
      meetingCount: count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Sentiment distribution
  const sentimentCounts = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  for (const a of analyses) {
    if (a.clientSentiment in sentimentCounts) {
      sentimentCounts[a.clientSentiment as keyof typeof sentimentCounts]++;
    }
  }

  // Pending action items count
  const pendingActionItems = analyses.reduce((sum: number, a: any) => {
    const items = a.actionItems as unknown[];
    return sum + (Array.isArray(items) ? items.length : 0);
  }, 0);

  // Monthly trend (last 6 months)
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const trendMeetings = await prisma.meeting.findMany({
    where: { meetingDate: { gte: sixMonthsAgo } },
    include: {
      analysis: {
        select: { overallTeamScore: true, clientHealthScore: true },
      },
    },
    orderBy: { meetingDate: "asc" },
  });

  const monthlyTrend: Record<
    string,
    { month: string; avgTeam: number; avgClient: number; count: number }
  > = {};

  for (const m of trendMeetings) {
    if (!m.meetingDate || !m.analysis) continue;
    const key = `${m.meetingDate.getFullYear()}-${String(m.meetingDate.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyTrend[key]) {
      monthlyTrend[key] = {
        month: key,
        avgTeam: 0,
        avgClient: 0,
        count: 0,
      };
    }
    monthlyTrend[key].avgTeam += Number(m.analysis.overallTeamScore);
    monthlyTrend[key].avgClient += Number(m.analysis.clientHealthScore);
    monthlyTrend[key].count++;
  }

  const trend = Object.values(monthlyTrend).map((t) => ({
    month: t.month,
    avgTeam: Number((t.avgTeam / t.count).toFixed(1)),
    avgClient: Number((t.avgClient / t.count).toFixed(1)),
    count: t.count,
  }));

  return NextResponse.json({
    totalMeetings,
    meetingsThisMonth,
    avgTeamScore: Number(avgTeamScore.toFixed(1)),
    avgClientHealthScore: Number(avgClientHealth.toFixed(1)),
    riskyClients: riskyCount,
    pendingActionItems,
    sentimentDistribution: sentimentCounts,
    employeeRankings,
    monthlyTrend: trend,
  });
}
