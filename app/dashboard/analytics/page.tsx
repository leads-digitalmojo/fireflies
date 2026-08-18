import { prisma } from "@/lib/prisma";
import { getSession, canAccessEmployeeAnalytics } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/dashboard/risk-badge";
import type { RiskLevel } from "@/types";

async function getAnalyticsData() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [analyses, meetingsThisMonth, riskyCount, trendMeetings] =
    await Promise.all([
      prisma.meetingAnalysis.findMany({
        include: { meeting: { select: { title: true, clientName: true } } },
      }),
      prisma.meeting.count({ where: { meetingDate: { gte: monthStart } } }),
      prisma.meetingAnalysis.count({
        where: { riskLevel: { in: ["HIGH", "CRITICAL"] } },
      }),
      prisma.meeting.findMany({
        where: { meetingDate: { gte: sixMonthsAgo } },
        include: { analysis: { select: { overallTeamScore: true, clientHealthScore: true } } },
        orderBy: { meetingDate: "asc" },
      }),
    ]);

  const avgTeam =
    analyses.length > 0
      ? analyses.reduce((s, a) => s + Number(a.overallTeamScore), 0) / analyses.length
      : 0;

  const avgClient =
    analyses.length > 0
      ? analyses.reduce((s, a) => s + Number(a.clientHealthScore), 0) / analyses.length
      : 0;

  // Employee rankings
  const empMap = new Map<string, { total: number; count: number }>();
  for (const a of analyses) {
    const scores = a.employeeScores as Array<{ name: string; score: number }> | null;
    if (!Array.isArray(scores)) continue;
    for (const e of scores) {
      const ex = empMap.get(e.name) ?? { total: 0, count: 0 };
      empMap.set(e.name, { total: ex.total + e.score, count: ex.count + 1 });
    }
  }

  const employeeRankings = Array.from(empMap.entries())
    .map(([name, { total, count }]) => ({
      name,
      avg: Number((total / count).toFixed(1)),
      meetings: count,
    }))
    .sort((a, b) => b.avg - a.avg);

  // Sentiment counts
  const sentiment = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  for (const a of analyses) {
    const s = a.clientSentiment as keyof typeof sentiment;
    if (s in sentiment) sentiment[s]++;
  }

  // Monthly trend
  const trend: Record<string, { team: number; client: number; count: number }> = {};
  for (const m of trendMeetings) {
    if (!m.meetingDate || !m.analysis) continue;
    const key = `${m.meetingDate.getFullYear()}-${String(m.meetingDate.getMonth() + 1).padStart(2, "0")}`;
    if (!trend[key]) trend[key] = { team: 0, client: 0, count: 0 };
    trend[key].team += Number(m.analysis.overallTeamScore);
    trend[key].client += Number(m.analysis.clientHealthScore);
    trend[key].count++;
  }

  const trendData = Object.entries(trend)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { team, client, count }]) => ({
      month,
      team: Number((team / count).toFixed(1)),
      client: Number((client / count).toFixed(1)),
    }));

  // Action items count
  const pendingActions = analyses.reduce((s, a) => {
    const items = a.actionItems as unknown[];
    return s + (Array.isArray(items) ? items.length : 0);
  }, 0);

  return {
    avgTeam: Number(avgTeam.toFixed(1)),
    avgClient: Number(avgClient.toFixed(1)),
    totalMeetings: analyses.length,
    meetingsThisMonth,
    riskyCount,
    pendingActions,
    employeeRankings,
    sentiment,
    trendData,
  };
}

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session || !canAccessEmployeeAnalytics(session.role)) {
    redirect("/dashboard");
  }

  const data = await getAnalyticsData();
  const totalSentiment =
    data.sentiment.POSITIVE + data.sentiment.NEUTRAL + data.sentiment.NEGATIVE;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <StatCard label="Avg Team Score" value={`${data.avgTeam}/10`} color="blue" />
        <StatCard label="Avg Client Health" value={`${data.avgClient}/10`} color="green" />
        <StatCard label="Meetings Analysed" value={data.totalMeetings} />
        <StatCard label="This Month" value={data.meetingsThisMonth} />
        <StatCard
          label="Risky Clients"
          value={data.riskyCount}
          color={data.riskyCount > 0 ? "red" : "green"}
        />
        <StatCard label="Action Items" value={data.pendingActions} color="yellow" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Employee Rankings */}
        <Card>
          <CardHeader>
            <CardTitle>Employee Rankings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {data.employeeRankings.slice(0, 10).map((e, i) => (
                <div key={e.name} className="flex items-center px-6 py-3 gap-4">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      i === 0
                        ? "bg-yellow-400"
                        : i === 1
                        ? "bg-gray-400"
                        : i === 2
                        ? "bg-orange-400"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm text-gray-900">{e.name}</div>
                    <div className="text-xs text-gray-400">{e.meetings} meetings</div>
                  </div>
                  <div className="w-24 bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full"
                      style={{ width: `${(e.avg / 10) * 100}%` }}
                    />
                  </div>
                  <div className="font-bold text-blue-600 text-sm w-10 text-right">
                    {e.avg}
                  </div>
                </div>
              ))}
              {data.employeeRankings.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-400 text-sm">
                  No employee data yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sentiment Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Client Sentiment</CardTitle>
          </CardHeader>
          <CardContent>
            {totalSentiment === 0 ? (
              <p className="text-sm text-gray-400">No data yet.</p>
            ) : (
              <div className="space-y-4">
                {(
                  [
                    { key: "POSITIVE", color: "bg-green-500", label: "Positive" },
                    { key: "NEUTRAL", color: "bg-gray-400", label: "Neutral" },
                    { key: "NEGATIVE", color: "bg-red-500", label: "Negative" },
                  ] as const
                ).map(({ key, color, label }) => {
                  const count = data.sentiment[key];
                  const pct =
                    totalSentiment > 0
                      ? Math.round((count / totalSentiment) * 100)
                      : 0;
                  return (
                    <div key={key}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{label}</span>
                        <span className="font-medium text-gray-900">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className={`${color} h-2 rounded-full transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trend Table */}
      {data.trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trend (last 6 months)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Month</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Avg Team Score</th>
                  <th className="text-right px-6 py-3 font-medium text-gray-500">Avg Client Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.trendData.map((row) => (
                  <tr key={row.month} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{row.month}</td>
                    <td className="px-6 py-3 text-right text-blue-600 font-semibold">
                      {row.team}
                    </td>
                    <td className="px-6 py-3 text-right text-green-600 font-semibold">
                      {row.client}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
