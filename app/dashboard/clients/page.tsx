import { prisma } from "@/lib/prisma";
import { getSession, canAccessAllMeetings } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { RiskBadge, SentimentBadge } from "@/components/dashboard/risk-badge";
import Link from "next/link";
import type { RiskLevel, Sentiment } from "@/types";

async function getClientData() {
  const meetings = await prisma.meeting.findMany({
    where: { clientName: { not: null } },
    include: {
      analysis: {
        select: {
          overallTeamScore: true,
          clientHealthScore: true,
          clientSentiment: true,
          riskLevel: true,
        },
      },
    },
    orderBy: { meetingDate: "desc" },
  });

  const clientMap = new Map<
    string,
    {
      meetings: number;
      lastMeeting: Date | null;
      lastMeetingId: string;
      avgTeam: number;
      avgClient: number;
      riskLevel: string;
      sentiment: string;
      analysedCount: number;
    }
  >();

  for (const m of meetings) {
    if (!m.clientName) continue;
    const ex = clientMap.get(m.clientName) ?? {
      meetings: 0,
      lastMeeting: null,
      lastMeetingId: m.id,
      avgTeam: 0,
      avgClient: 0,
      riskLevel: "LOW",
      sentiment: "NEUTRAL",
      analysedCount: 0,
    };

    ex.meetings++;
    if (!ex.lastMeeting || (m.meetingDate && m.meetingDate > ex.lastMeeting)) {
      ex.lastMeeting = m.meetingDate;
      ex.lastMeetingId = m.id;
    }

    if (m.analysis) {
      ex.avgTeam += Number(m.analysis.overallTeamScore);
      ex.avgClient += Number(m.analysis.clientHealthScore);
      ex.analysedCount++;
      // Latest analysis determines risk/sentiment
      if (ex.lastMeetingId === m.id) {
        ex.riskLevel = m.analysis.riskLevel;
        ex.sentiment = m.analysis.clientSentiment;
      }
    }

    clientMap.set(m.clientName, ex);
  }

  return Array.from(clientMap.entries())
    .map(([name, data]) => ({
      name,
      meetingCount: data.meetings,
      lastMeeting: data.lastMeeting,
      lastMeetingId: data.lastMeetingId,
      avgTeam:
        data.analysedCount > 0
          ? Number((data.avgTeam / data.analysedCount).toFixed(1))
          : null,
      avgClient:
        data.analysedCount > 0
          ? Number((data.avgClient / data.analysedCount).toFixed(1))
          : null,
      riskLevel: data.riskLevel as RiskLevel,
      sentiment: data.sentiment as Sentiment,
    }))
    .sort((a, b) => (b.lastMeeting?.getTime() ?? 0) - (a.lastMeeting?.getTime() ?? 0));
}

export default async function ClientsPage() {
  const session = await getSession();
  if (!session || !canAccessAllMeetings(session.role)) {
    redirect("/dashboard");
  }

  const clients = await getClientData();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Client Health</h1>

      {clients.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          No client data yet. Client names are derived from meeting titles.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {clients.map((client) => (
          <Card key={client.name}>
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-gray-900 text-base">
                    {client.name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {client.meetingCount} meeting
                    {client.meetingCount !== 1 ? "s" : ""} ·{" "}
                    {client.lastMeeting
                      ? new Date(client.lastMeeting).toLocaleDateString("en-IN")
                      : "—"}
                  </div>
                </div>
                <div className="flex flex-col gap-1 items-end">
                  <RiskBadge level={client.riskLevel} />
                  <SentimentBadge sentiment={client.sentiment} />
                </div>
              </div>

              <div className="flex gap-4 text-sm">
                <div>
                  <div className="text-gray-400 text-xs mb-0.5">Team Score</div>
                  <div className="font-bold text-blue-600">
                    {client.avgTeam ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs mb-0.5">Client Health</div>
                  <div className="font-bold text-green-600">
                    {client.avgClient ?? "—"}
                  </div>
                </div>
              </div>

              <Link
                href={`/dashboard/meetings/${client.lastMeetingId}`}
                className="mt-3 text-xs text-blue-600 hover:underline block"
              >
                View latest meeting →
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
