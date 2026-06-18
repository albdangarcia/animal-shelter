import { Role } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { User, Users, Handshake, CheckCircle2, XCircle } from "lucide-react";
import { buildOptions } from "@/app/lib/utils/option-utils";

type VisibleRole = Exclude<Role, "ADMIN">;

const roleMeta: Record<
  VisibleRole,
  { label: string; icon: LucideIcon; className: string }
> = {
  USER: {
    label: "User",
    icon: User,
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  STAFF: {
    label: "Staff",
    icon: Users,
    className:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  },
  VOLUNTEER: {
    label: "Volunteer",
    icon: Handshake,
    className:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  },
};

export const UserRoles = buildOptions<VisibleRole>(roleMeta);

export const UserStatuses = [
  { value: "active", label: "Active", icon: CheckCircle2 },
  { value: "deactivated", label: "Deactivated", icon: XCircle },
];
