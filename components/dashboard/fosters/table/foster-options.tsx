import { FosterStatus } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { buildOptions } from "@/app/lib/utils/option-utils";

const fosterStatusMeta: Record<FosterStatus, { label: string; icon: LucideIcon }> = {
  ACTIVE: { label: "Active", icon: CheckCircle2 },
  PAUSED: { label: "Paused", icon: PauseCircle },
  INACTIVE: { label: "Inactive", icon: XCircle },
};

export const FosterStatuses = buildOptions<FosterStatus>(fosterStatusMeta);

// Not a real column — "available" is the computed capacity filter
// (status ACTIVE AND open placements < maxAnimals), so
// this is a single-option facet rather than an enum-backed one.
export const FosterCapacityOptions = [{ value: "available", label: "Has Capacity" }];
