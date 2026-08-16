import type { OutcomeType } from "@/prisma/generated/enums";
import {
  HeartHandshake,
  ArrowRightLeft,
  Home,
  HeartCrack,
  Cross,
  Info,
} from "lucide-react"
import { buildOptions, type OptionMeta } from "@/app/lib/utils/option-utils"

const outcomeTypeMeta: Record<OutcomeType, OptionMeta> = {
  ADOPTION:        { label: "Adoption",        icon: HeartHandshake },
  TRANSFER_OUT:    { label: "Transfer Out",    icon: ArrowRightLeft },
  RETURN_TO_OWNER: { label: "Return to Owner", icon: Home },
  DECEASED:        { label: "Deceased",        icon: HeartCrack },
  EUTHANIZED:      { label: "Euthanized",      icon: Cross },
  OTHER:           { label: "Other",           icon: Info },
}

export const OutcomeTypesOptions = buildOptions<OutcomeType>(outcomeTypeMeta)