import type { Sex, AnimalSize } from "@/prisma/generated/enums";
import type { LucideIcon } from "lucide-react"
import {
  Mars, Venus, HelpCircle as UnknownIcon,
  CircleDot, Circle as SmallCircle, CircleDashed, CircleEllipsis,
} from "lucide-react"
import { buildOptions } from "@/app/lib/utils/option-utils"

const sexMeta: Record<Sex, { label: string; icon: LucideIcon }> = {
  MALE:    { label: "Male",    icon: Mars },
  FEMALE:  { label: "Female",  icon: Venus },
  UNKNOWN: { label: "Unknown", icon: UnknownIcon },
}

const sizeMeta: Record<AnimalSize, { label: string; icon: LucideIcon }> = {
  SMALL:  { label: "Small",       icon: SmallCircle },
  MEDIUM: { label: "Medium",      icon: CircleDot },
  LARGE:  { label: "Large",       icon: CircleDashed },
  XLARGE: { label: "Extra Large", icon: CircleEllipsis },
}

export const sexOptions = buildOptions(sexMeta)
export const sizeOptions = buildOptions(sizeMeta)