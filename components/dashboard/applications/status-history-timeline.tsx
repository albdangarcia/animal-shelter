import type { ApplicationStatus } from "@/prisma/generated/enums";
import { Badge } from "@/components/ui/badge";
import { formatTimeAgo } from "@/app/lib/utils/date-utils";
import { ApplicationStatuses } from "@/components/dashboard/my-adoption-applications/table/my-applications-options";

// `ApplicationStatusHistory` and `FosterApplicationStatusHistory` are
// field-for-field identical; this is the shared shape both timelines render,
// including the `changedBy: { name }` selection both queries add.
export type StatusHistoryEntry = {
  id: string;
  status: ApplicationStatus;
  statusChangeReason: string;
  changedAt: Date;
  changedBy: { name: string | null } | null;
};

export const StatusHistoryTimeline = ({
  history,
}: {
  history: StatusHistoryEntry[];
}) => (
  <div className="space-y-6">
    {history.map((entry) => {
      const meta = ApplicationStatuses.find((s) => s.value === entry.status);
      const Icon = meta?.icon;
      return (
        <div key={entry.id} className="relative flex items-start space-x-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-4 ring-card">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="min-w-0 grow">
            <div className="flex flex-wrap items-center gap-x-2 text-sm">
              <Badge variant="outline">{meta?.label ?? entry.status}</Badge>
              {entry.changedBy && (
                <span className="text-muted-foreground">
                  by {entry.changedBy.name}
                </span>
              )}
              <span className="text-muted-foreground/70">
                &bull; {formatTimeAgo(entry.changedAt)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {entry.statusChangeReason}
            </p>
          </div>
        </div>
      );
    })}
  </div>
);
