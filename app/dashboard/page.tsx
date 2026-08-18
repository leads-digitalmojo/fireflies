import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge, SentimentBadge } from "@/components/dashboard/risk-badge";
import Link from "next/link";
import type { RiskLevel, Sentiment } from "@/types";

async function getDashboardData() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalMeetings, meetingsThisMonth, analyses, recentMeetings] =
    await Promise.all([
      prisma.meeting.count(),
      prisma.meeting.count({ where: { meetingDate: { gte: monthStart } } }),
      prisma.meetingAnalysis.findMany({
        select: {
          overallTeamScore: true,
          clientHealthScore: true,
          riskLevel: true,
        },
      }),
      prisma.meeting.findMany({
        take: 5,
        orderBy: { meetingDate: "desc" },
        include: {
          analysis: {
            select: {
              overallTeamScore: true,
              clientSentiment: true,
              riskLevel: true,
            },
          },
        },
      }),
    ]);

  const avgTeamScore =
    analyses.length > 0
      ? analyses.reduce((s, a) => s + Number(a.overallTeamScore), 0) /
        analyses.length
      : 0;

  const avgClientHealth =
    analyses.length > 0
      ? analyses.reduce((s, a) => s + Number(a.clientHealthScore), 0) /
        analyses.length
      : 0;

  const riskyClients = analyses.filter(
    (a) => a.riskLevel === "HIGH" || a.riskLevel === "CRITICAL"
  ).length;

  return {
    totalMeetings,
    meetingsThisMonth,
    avgTeamScore: Number(avgTeamScore.toFixed(1)),
    avgClientHealth: Number(avgClientHealth.toFixed(1)),
    riskyClients,
    recentMeetings,
  };
}

export default async function DashboardPage() {
  const session = await getSession();
  const data = await getDashboardData();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back{session?.email ? `, ${session.email.split("@")[0]}` : ""}
        </h1>
        <p className="text-gray-500 mt-1">
          Here&apos;s your meeting intelligence overview
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Meetings"
          value={data.totalMeetings}
          sub="All time"
          color="blue"
        />
        <StatCard
          label="This Month"
          value={data.meetingsThisMonth}
          sub="Meetings recorded"
          color="green"
        />
        <StatCard
          label="Avg Team Score"
          value={`${data.avgTeamScore}/10`}
          sub="Across all meetings"
          color="blue"
        />
        <StatCard
          label="Risky Clients"
          value={data.riskyClients}
          sub="High / Critical risk"
          color={data.riskyClients > 0 ? "red" : "green"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Meetings</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {data.recentMeetings.length === 0 && (
                <div className="px-6 py-8 text-center text-gray-400 text-sm">
                  No meetings yet. Sync from Fireflies to get started.
                </div>
              )}
              {data.recentMeetings.map((m) => (
                <Link
                  key={m.id}
                  href={`/dashboard/meetings/${m.id}`}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {m.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {m.clientName ?? "—"} ·{" "}
                      {m.meetingDate
                        ? new Date(m.meetingDate).toLocaleDateString("en-IN")
                        : "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.analysis && (
                      <>
                        <span className="text-sm font-semibold text-blue-600">
                          {Number(m.analysis.overallTeamScore).toFixed(1)}
                        </span>
                        <RiskBadge level={m.analysis.riskLevel as RiskLevel} />
                      </>
                    )}
                    {!m.analysis && (
                      <span className="text-xs text-gray-400">Processing…</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Score Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Avg Team Performance</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${(data.avgTeamScore / 10) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-blue-600 w-8 text-right">
                    {data.avgTeamScore}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Avg Client Health</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${(data.avgClientHealth / 10) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-green-600 w-8 text-right">
                    {data.avgClientHealth}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
