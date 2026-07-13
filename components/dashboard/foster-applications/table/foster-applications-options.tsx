import { ApplicationStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { Hourglass, FileCheck2, List, UserCheck, UserX, XCircle } from "lucide-react";
import { buildOptions } from "@/app/lib/utils/option-utils";

// Foster applications reuse ApplicationStatus, but ADOPTED is never used for
// them — omitted here so it can't show up as a filter or
// status-change option.
type FosterApplicationStatus = Exclude<ApplicationStatus, "ADOPTED">;

const fosterApplicationStatusMeta: Record<
  FosterApplicationStatus,
  { label: string; icon: LucideIcon }
> = {
  PENDING: { label: "Pending", icon: Hourglass },
  REVIEWING: { label: "Reviewing", icon: FileCheck2 },
  WAITLISTED: { label: "Waitlisted", icon: List },
  APPROVED: { label: "Approved", icon: UserCheck },
  REJECTED: { label: "Rejected", icon: UserX },
  WITHDRAWN: { label: "Withdrawn", icon: XCircle },
};

export const FosterApplicationStatuses = buildOptions<FosterApplicationStatus>(
  fosterApplicationStatusMeta,
);
