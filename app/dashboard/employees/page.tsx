import { prisma } from "@/lib/prisma";
import { getSession, canAccessEmployeeAnalytics } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function getEmployeeData() {
  const analyses = await prisma.meetingAnalysis.findMany({
    select: { employeeScores: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const empMap = new Map<
    string,
    {
      scores: number[];
      strengths: string[];
      improvements: string[];
      meetingDates: Date[];
    }
  >();

  for (const a of analyses) {
    const scores = a.employeeScores as Array<{
      name: string;
      score: number;
      strengths: string[];
      improvements: string[];
    }> | null;
    if (!Array.isArray(scores)) continue;

    for (const e of scores) {
      const ex = empMap.get(e.name) ?? {
        scores: [],
        strengths: [],
        improvements: [],
        meetingDates: [],
      };
      ex.scores.push(e.score);
      ex.strengths.push(...(e.strengths ?? []));
      ex.improvements.push(...(e.improvements ?? []));
      ex.meetingDates.push(a.createdAt);
      empMap.set(e.name, ex);
    }
  }

  return Array.from(empMap.entries())
    .map(([name, data]) => {
      const avg = data.scores.reduce((s, v) => s + v, 0) / data.scores.length;
      const recent = data.scores[data.scores.length - 1] ?? 0;
      const trend = data.scores.length > 1 ? recent - data.scores[data.scores.length - 2] : 0;

      // Deduplicate strengths / improvements
      const uniqueStrengths = [...new Set(data.strengths)].slice(0, 5);
      const uniqueImprovements = [...new Set(data.improvements)].slice(0, 5);

      return {
        name,
        avgScore: Number(avg.toFixed(1)),
        recentScore: Number(recent.toFixed(1)),
        trend: Number(trend.toFixed(1)),
        meetingCount: data.scores.length,
        strengths: uniqueStrengths,
        improvements: uniqueImprovements,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
}

export default async function EmployeesPage() {
  const session = await getSession();
  if (!session || !canAccessEmployeeAnalytics(session.role)) {
    redirect("/dashboard");
  }

  const employees = await getEmployeeData();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Employee Performance
      </h1>

      {employees.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          No employee data yet. Meeting analyses will populate this page.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {employees.map((emp, i) => (
          <Card key={emp.name}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                      i === 0
                        ? "bg-yellow-400"
                        : i === 1
                        ? "bg-gray-400"
                        : i === 2
                        ? "bg-orange-400"
                        : "bg-blue-500"
                    }`}
                  >
                    {emp.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{emp.name}</div>
                    <div className="text-xs text-gray-400">
                      {emp.meetingCount} meeting{emp.meetingCount !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600">
                    {emp.avgScore}
                    <span className="text-sm font-normal text-gray-400">/10</span>
                  </div>
                  {emp.trend !== 0 && (
                    <div
                      className={`text-xs font-medium ${
                        emp.trend > 0 ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {emp.trend > 0 ? "▲" : "▼"} {Math.abs(emp.trend)} vs prev
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
                <div
                  className="bg-blue-500 h-1.5 rounded-full"
                  style={{ width: `${(emp.avgScore / 10) * 100}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="font-medium text-green-700 mb-1.5">Strengths</div>
                  <ul className="space-y-1">
                    {emp.strengths.map((s, j) => (
                      <li key={j} className="text-gray-500">• {s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-orange-700 mb-1.5">Improve</div>
                  <ul className="space-y-1">
                    {emp.improvements.map((s, j) => (
                      <li key={j} className="text-gray-500">• {s}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
