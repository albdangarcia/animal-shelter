import type { OutcomeType } from "@/prisma/generated/enums";
import {
  HeartHandshake,
  ArrowRightLeft,
  Home,
  HeartCrack,
  Cross,
  Info,
  MapPin,
  CircleQuestionMark,
  type LucideIcon,
} from "lucide-react"
import { buildOptions, type OptionMeta } from "@/app/lib/utils/option-utils"
import { OUTCOME_TYPE_LABELS } from "@/app/lib/utils/outcome-types"

// Named from OUTCOME_TYPE_LABELS, so a badge reads as the form, the filter and
// the reports do.
const outcomeTypeIcons: Record<OutcomeType, LucideIcon> = {
  ADOPTION: HeartHandshake,
  TRANSFER_OUT: ArrowRightLeft,
  RETURN_TO_OWNER: Home,
  RETURN_TO_FIELD: MapPin,
  OTHER: Info,
  DECEASED: HeartCrack,
  EUTHANIZED: Cross,
  LOST_IN_CARE: CircleQuestionMark,
}

const outcomeTypeMeta = Object.fromEntries(
  Object.entries(outcomeTypeIcons).map(([type, icon]) => [
    type,
    { label: OUTCOME_TYPE_LABELS[type as OutcomeType], icon },
  ]),
) as Record<OutcomeType, OptionMeta>

export const OutcomeTypesOptions = buildOptions<OutcomeType>(outcomeTypeMeta)