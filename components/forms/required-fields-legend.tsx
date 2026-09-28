import { cn } from "@/lib/utils";

/**
 * Explains the asterisk `<FormLabel required>` draws. Meant for forms the
 * public fills in; staff forms go without it.
 */
export function RequiredFieldsLegend({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      Fields marked with <span className="text-destructive">*</span> are
      required.
    </p>
  );
}
