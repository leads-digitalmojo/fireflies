import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession, canAccessAllMeetings } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge, SentimentBadge } from "@/components/dashboard/risk-badge";
import { ScoreRing } from "@/components/ui/score-ring";
import type {
  RiskLevel,
  Sentiment,
  ActionItem,
  EmployeeScore,
  TeamBreakdown,
} from "@/types";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: { analysis: true, participants: true },
  });

  if (!meeting) notFound();

  if (session && !canAccessAllMeetings(session.role)) {
    const isParticipant = meeting.participants.some(
      (p) => p.email === session.email
    );
    if (!isParticipant) notFound();
  }

  const a = meeting.analysis;
  const teamScore = a ? Number(a.overallTeamScore) : null;
  const clientScore = a ? Number(a.clientHealthScore) : null;
  const summary = (a?.summary as unknown as string[]) ?? [];
  const minutes = (a?.minutesOfMeeting as unknown as string[]) ?? [];
  const actionItems = (a?.actionItems as unknown as ActionItem[]) ?? [];
  const risks = (a?.risks as unknown as string[]) ?? [];
  const recommendations = (a?.recommendations as unknown as string[]) ?? [];
  const employeeScores = (a?.employeeScores as unknown as EmployeeScore[]) ?? [];
  const teamBreakdown = (a?.teamBreakdown as unknown as TeamBreakdown) ?? null;

  const durationMin = meeting.duration
    ? Math.floor(meeting.duration / 60)
    : null;

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{meeting.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              {meeting.clientName && <span>Client: {meeting.clientName}</span>}
              {meeting.meetingDate && (
                <span>
                  {new Date(meeting.meetingDate).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              )}
              {durationMin && <span>{durationMin} min</span>}
            </div>
          </div>
          {a && (
            <div className="flex gap-3">
              <RiskBadge level={a.riskLevel as RiskLevel} />
              <SentimentBadge sentiment={a.clientSentiment as Sentiment} />
            </div>
          )}
        </div>
      </div>

      {!a && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-6 py-4 mb-6 text-sm text-yellow-800">
          Analysis is being generated. Refresh in a moment.
        </div>
      )}

      {a && (
        <>
          {/* Score rings */}
          <Card className="mb-6">
            <CardContent className="py-6">
              <div className="flex flex-wrap gap-8 justify-center">
                <ScoreRing score={teamScore!} label="Team Performance" />
                <ScoreRing score={clientScore!} label="Client Health" />
                {teamBreakdown && (
                  <>
                    <ScoreRing score={teamBreakdown.communication} label="Communication" size={80} />
                    <ScoreRing score={teamBreakdown.clarity} label="Clarity" size={80} />
                    <ScoreRing score={teamBreakdown.professionalism} label="Professionalism" size={80} />
                    <ScoreRing score={teamBreakdown.problemSolving} label="Problem Solving" size={80} />
                    <ScoreRing score={teamBreakdown.clientHandling} label="Client Handling" size={80} />
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Summary */}
            <Card>
              <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {summary.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-blue-500 mt-0.5">•</span> {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Minutes */}
            <Card>
              <CardHeader><CardTitle>Minutes of Meeting</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {minutes.map((m, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-gray-400 font-mono w-5 shrink-0">{i + 1}.</span> {m}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>

          {/* Action Items */}
          <Card className="mb-6">
            <CardHeader><CardTitle>Action Items</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {actionItems.length === 0 && (
                  <p className="text-sm text-gray-400">No action items.</p>
                )}
                {actionItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 p-3 bg-blue-50 rounded-lg border border-blue-100"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-blue-900 text-sm">
                        {item.owner}
                      </div>
                      <div className="text-sm text-gray-700 mt-0.5">{item.task}</div>
                    </div>
                    <div className="text-xs text-gray-500 shrink-0 bg-white px-2 py-1 rounded border border-gray-200">
                      {item.deadline}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Risks */}
            <Card>
              <CardHeader><CardTitle>Risks</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {risks.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-red-500 mt-0.5">⚠</span> {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card>
              <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {recommendations.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="text-green-500 mt-0.5">✓</span> {r}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Employee Scores */}
          <Card className="mb-6">
            <CardHeader><CardTitle>Employee Performance</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                {employeeScores
                  .sort((a, b) => b.score - a.score)
                  .map((emp, i) => (
                    <div key={i} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-gray-900">{emp.name}</div>
                        <div className="text-xl font-bold text-blue-600">
                          {emp.score.toFixed(1)}<span className="text-sm font-normal text-gray-400">/10</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full"
                          style={{ width: `${(emp.score / 10) * 100}%` }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-green-600 font-medium mb-1">Strengths</div>
                          {emp.strengths.map((s, j) => (
                            <div key={j} className="text-gray-500">• {s}</div>
                          ))}
                        </div>
                        <div>
                          <div className="text-orange-600 font-medium mb-1">Improve</div>
                          {emp.improvements.map((s, j) => (
                            <div key={j} className="text-gray-500">• {s}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Participants */}
      <Card className="mb-6">
        <CardHeader><CardTitle>Participants</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {meeting.participants.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm"
              >
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-gray-700">{p.name}</span>
                {p.email && (
                  <span className="text-gray-400 text-xs">{p.email}</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Transcript */}
      {meeting.transcript && (
        <Card>
          <CardHeader><CardTitle>Full Transcript</CardTitle></CardHeader>
          <CardContent>
            <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              {meeting.transcript}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
