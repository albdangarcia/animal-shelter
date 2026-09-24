import type { ApplicationStatus } from "@/prisma/generated/enums";
import type { LucideIcon } from "lucide-react";
import { Hourglass, FileCheck2, List, UserCheck, UserX, XCircle } from "lucide-react";
import { buildOptions } from "@/app/lib/utils/option-utils";

const fosterApplicationStatusMeta: Record<
  ApplicationStatus,
  { label: string; icon: LucideIcon }
> = {
  PENDING: { label: "Pending", icon: Hourglass },
  REVIEWING: { label: "Reviewing", icon: FileCheck2 },
  WAITLISTED: { label: "Waitlisted", icon: List },
  APPROVED: { label: "Approved", icon: UserCheck },
  REJECTED: { label: "Rejected", icon: UserX },
  WITHDRAWN: { label: "Withdrawn", icon: XCircle },
};

export const FosterApplicationStatuses = buildOptions<ApplicationStatus>(
  fosterApplicationStatusMeta,
);
