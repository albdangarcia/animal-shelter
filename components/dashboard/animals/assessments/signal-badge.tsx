import { AssessmentSignal } from "@/prisma/generated/enums";
import { Badge } from "@/components/ui/badge";
import { formatSignal } from "@/app/lib/assessments/signal";
import { cn } from "@/lib/utils";

const VARIANT: Record<
  AssessmentSignal,
  { variant: "outline" | "secondary" | "destructive"; className?: string }
> = {
  [AssessmentSignal.NO_CONCERNS]: { variant: "outline" },
  [AssessmentSignal.MONITOR]: { variant: "secondary" },
  [AssessmentSignal.FOLLOW_UP]: {
    variant: "secondary",
    className:
      "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  },
  [AssessmentSignal.ESCALATE]: { variant: "destructive" },
};

export function SignalBadge({ signal }: { signal: AssessmentSignal }) {
  const { variant, className } = VARIANT[signal];
  return (
    <Badge variant={variant} className={cn(className)}>
      {formatSignal(signal)}
    </Badge>
  );
}
