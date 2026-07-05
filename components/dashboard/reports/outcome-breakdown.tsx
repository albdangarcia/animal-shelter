import { formatSingleEnumOption } from "@/app/lib/utils/enum-formatter";
import { cn } from "@/lib/utils";
import type { OutcomeReportRow } from "@/app/lib/data/reports/outcome-report.data";

/**
 * Outcomes-by-type breakdown as a server-rendered horizontal bar list — one row
 * per outcome type present in the period, each showing its share of total
 * outcomes. Live and non-live types are drawn in two colors (see the legend) so
 * the live-vs-non-live split reads at a glance without any client JS.
 */
export function OutcomeBreakdown({ rows }: { rows: OutcomeReportRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No outcomes recorded in this period.
      </p>
    );
  }

  // Scale bar widths to the largest slice so the chart uses its full width even
  // when no single type dominates; the printed percent is always of the total.
  const maxPercent = Math.max(...rows.map((r) => r.percentOfTotal));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const percent = row.percentOfTotal * 100;
          const width = maxPercent > 0 ? (row.percentOfTotal / maxPercent) * 100 : 0;
          return (
            <div key={row.type} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {formatSingleEnumOption(row.type)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {row.count} · {percent.toFixed(1)}%
                </span>
              </div>
              <div className="bg-muted h-2.5 w-full overflow-hidden rounded-full">
                <div
                  className={cn(
                    "h-full rounded-full",
                    row.isLive
                      ? "bg-green-500 dark:bg-green-400"
                      : "bg-zinc-400 dark:bg-zinc-500",
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        <LegendSwatch className="bg-green-500 dark:bg-green-400" label="Live outcome" />
        <LegendSwatch className="bg-zinc-400 dark:bg-zinc-500" label="Non-live outcome" />
      </div>
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}
