import { Badge } from "@/components/ui/badge";
import type { RiskLevel, Sentiment } from "@/types";

export function RiskBadge({ level }: { level: RiskLevel }) {
  const variants: Record<RiskLevel, "success" | "info" | "warning" | "danger"> = {
    LOW: "success",
    MEDIUM: "info",
    HIGH: "warning",
    CRITICAL: "danger",
  };
  return <Badge variant={variants[level]}>{level}</Badge>;
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const variants: Record<Sentiment, "success" | "neutral" | "danger"> = {
    POSITIVE: "success",
    NEUTRAL: "neutral",
    NEGATIVE: "danger",
  };
  return <Badge variant={variants[sentiment]}>{sentiment}</Badge>;
}
