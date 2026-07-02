import { Progress } from "@/components/ui/progress";

function indicatorFor(score: number) {
  if (score < 50) return "bg-destructive";
  if (score < 75) return "bg-warning";
  return "bg-success";
}

export function FactorMeter({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono-tabular text-foreground">{Math.round(score)}</span>
      </div>
      <Progress value={score} indicatorClassName={indicatorFor(score)} />
    </div>
  );
}
