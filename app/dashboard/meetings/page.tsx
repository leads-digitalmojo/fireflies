import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getSession, canAccessAllMeetings } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { RiskBadge, SentimentBadge } from "@/components/dashboard/risk-badge";
import Link from "next/link";
import type { RiskLevel, Sentiment } from "@/types";

interface SearchParams {
  client?: string;
  page?: string;
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = 20;

  const where: Prisma.MeetingWhereInput = {};

  if (params.client) {
    where.clientName = { contains: params.client, mode: "insensitive" };
  }

  if (session && !canAccessAllMeetings(session.role)) {
    where.participants = { some: { email: session.email } };
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
        _count: { select: { participants: true } },
      },
      orderBy: { meetingDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.meeting.count({ where }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total recordings</p>
        </div>
        <form method="GET" className="flex gap-2">
          <input
            name="client"
            defaultValue={params.client}
            placeholder="Filter by client…"
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Filter
          </button>
        </form>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 font-medium text-gray-500">Meeting</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Client</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Date</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Team</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Client Health</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Risk</th>
                <th className="text-left px-6 py-3 font-medium text-gray-500">Sentiment</th>
                <th className="text-right px-6 py-3 font-medium text-gray-500">Participants</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                    No meetings found.
                  </td>
                </tr>
              )}
              {meetings.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link
                      href={`/dashboard/meetings/${m.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{m.clientName ?? "—"}</td>
                  <td className="px-6 py-4 text-gray-500">
                    {m.meetingDate
                      ? new Date(m.meetingDate).toLocaleDateString("en-IN")
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.analysis ? (
                      <span className="font-semibold text-blue-600">
                        {Number(m.analysis.overallTeamScore).toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {m.analysis ? (
                      <span className="font-semibold text-green-600">
                        {Number(m.analysis.clientHealthScore).toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {m.analysis ? (
                      <RiskBadge level={m.analysis.riskLevel as RiskLevel} />
                    ) : (
                      <span className="text-gray-300 text-xs">pending</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {m.analysis ? (
                      <SentimentBadge
                        sentiment={m.analysis.clientSentiment as Sentiment}
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-500">
                    {m._count.participants}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`?page=${p}${params.client ? `&client=${params.client}` : ""}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
