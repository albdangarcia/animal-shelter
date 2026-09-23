import type { EffectiveApplicationStatus } from "@/app/lib/utils/derive-application-status";
import type { LucideIcon } from "lucide-react";
import {
  Hourglass,
  FileCheck2,
  List,
  UserCheck,
  UserX,
  XCircle,
  Heart,
  Archive,
} from "lucide-react";
import { buildOptions } from "@/app/lib/utils/option-utils";

const applicationStatusMeta: Record<
  EffectiveApplicationStatus,
  { label: string; icon: LucideIcon }
> = {
  PENDING: { label: "Pending", icon: Hourglass },
  REVIEWING: { label: "Reviewing", icon: FileCheck2 },
  WAITLISTED: { label: "Waitlisted", icon: List },
  APPROVED: { label: "Approved", icon: UserCheck },
  REJECTED: { label: "Rejected", icon: UserX },
  WITHDRAWN: { label: "Withdrawn", icon: XCircle },
  ADOPTED: { label: "Adopted", icon: Heart },
  // Never a review decision: an outcome for the animal was recorded while this
  // application was open, and the status is derived from that. Not a
  // rejection, and the one status that leaves the applicant free to apply
  // again.
  CLOSED: { label: "Closed", icon: Archive },
};

export const ApplicationStatuses = buildOptions<EffectiveApplicationStatus>(
  applicationStatusMeta,
);
