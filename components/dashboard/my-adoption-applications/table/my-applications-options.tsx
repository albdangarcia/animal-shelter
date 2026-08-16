import type { ApplicationStatus } from "@/prisma/generated/enums";
import type { LucideIcon } from "lucide-react";
import {
  Hourglass,
  FileCheck2,
  List,
  UserCheck,
  UserX,
  XCircle,
  Heart,
} from "lucide-react";
import { buildOptions } from "@/app/lib/utils/option-utils";

const applicationStatusMeta: Record<
  ApplicationStatus,
  { label: string; icon: LucideIcon }
> = {
  PENDING: { label: "Pending", icon: Hourglass },
  REVIEWING: { label: "Reviewing", icon: FileCheck2 },
  WAITLISTED: { label: "Waitlisted", icon: List },
  APPROVED: { label: "Approved", icon: UserCheck },
  REJECTED: { label: "Rejected", icon: UserX },
  WITHDRAWN: { label: "Withdrawn", icon: XCircle },
  ADOPTED: { label: "Adopted", icon: Heart },
};

export const ApplicationStatuses = buildOptions<ApplicationStatus>(
  applicationStatusMeta,
);
