"use client";

interface ScoreRingProps {
  score: number;
  label: string;
  size?: number;
}

function getColor(score: number): string {
  if (score >= 9) return "#16a34a";
  if (score >= 7) return "#2563eb";
  if (score >= 5) return "#ca8a04";
  return "#dc2626";
}

export function ScoreRing({ score, label, size = 100 }: ScoreRingProps) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 10) * circumference;
  const color = getColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={8}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={8}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div
        style={{ marginTop: -(size / 2 + 24), color }}
        className="text-2xl font-bold"
      >
        {score.toFixed(1)}
      </div>
      <div className="text-xs text-gray-500 text-center mt-1">{label}</div>
    </div>
  );
}
