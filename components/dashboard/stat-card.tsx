interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: "blue" | "green" | "yellow" | "red" | "default";
}

const colorMap = {
  blue: "text-blue-600 bg-blue-50",
  green: "text-green-600 bg-green-50",
  yellow: "text-yellow-600 bg-yellow-50",
  red: "text-red-600 bg-red-50",
  default: "text-gray-900 bg-gray-50",
};

export function StatCard({ label, value, sub, color = "default" }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="text-sm font-medium text-gray-500 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color].split(" ")[0]}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
