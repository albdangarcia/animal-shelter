import { Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Marks an outcome that was reversed. A reversed outcome is kept wherever it
 * appears rather than hidden: it was recorded, and staff reading a record
 * need to see that it was voided, not a gap where it used to be.
 */
export function ReversedOutcomeBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-destructive/40 text-destructive dark:border-destructive/60",
        className,
      )}
    >
      <Undo2 />
      Reversed
    </Badge>
  );
}
