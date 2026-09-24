import type { IntakeType } from "@/prisma/generated/enums";
import {
  ArrowRightLeft,
  Baby,
  BedDouble,
  Gavel,
  House,
  MapPin,
  Siren,
} from "lucide-react";
import { buildOptions, type OptionMeta } from "@/app/lib/utils/option-utils";

// Labels match `intakeTypeOptions`, which the type filter and the intake
// forms show, so a badge reads the same as the option that produced it.
const intakeTypeMeta: Record<IntakeType, OptionMeta> = {
  OWNER_SURRENDER: { label: "Owner Surrender", icon: House },
  STRAY:           { label: "Stray",           icon: MapPin },
  BORN_IN_CARE:    { label: "Born In Care",    icon: Baby },
  TRANSFER_IN:     { label: "Transfer In",     icon: ArrowRightLeft },
  SEIZE:           { label: "Seize",           icon: Gavel },
  SERVICE_IN:      { label: "Service In",      icon: BedDouble },
  ACO_IMPOUND:     { label: "Aco Impound",     icon: Siren },
};

export const IntakeTypesOptions = buildOptions<IntakeType>(intakeTypeMeta);
