import type { PartnerType } from "@/prisma/generated/enums";
import {
  Building2,
  HeartHandshake,
  Stethoscope,
  Landmark,
  CheckCircle2,
  CircleSlash,
} from "lucide-react";
import { buildOptions, type OptionMeta } from "@/app/lib/utils/option-utils";

const partnerTypeMeta: Record<PartnerType, OptionMeta> = {
  SHELTER: {
    label: "Shelter",
    icon: Building2,
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  RESCUE_GROUP: {
    label: "Rescue Group",
    icon: HeartHandshake,
    className:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  },
  VET_CLINIC: {
    label: "Vet Clinic",
    icon: Stethoscope,
    className:
      "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  },
  GOVERNMENT_AGENCY: {
    label: "Government Agency",
    icon: Landmark,
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  },
};

export const PartnerTypesOptions = buildOptions<PartnerType>(partnerTypeMeta);

type ActiveStatusValue = "active" | "inactive";

const activeStatusMeta: Record<ActiveStatusValue, OptionMeta> = {
  active: {
    label: "Active",
    icon: CheckCircle2,
    className:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  },
  inactive: {
    label: "Inactive",
    icon: CircleSlash,
    className:
      "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700",
  },
};

export const ActiveStatusesOptions = buildOptions<ActiveStatusValue>(
  activeStatusMeta,
);