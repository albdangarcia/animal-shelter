import type { Sex, AnimalSize } from "@/prisma/generated/enums";
import type { LucideIcon } from "lucide-react"
import {
  Mars, Venus, HelpCircle as UnknownIcon,
  CircleDot, Circle as SmallCircle, CircleDashed, CircleEllipsis,
} from "lucide-react"
import { buildOptions } from "@/app/lib/utils/option-utils"
import { ANIMAL_SIZE_LABELS } from "@/app/lib/utils/enum-formatter"

const sexMeta: Record<Sex, { label: string; icon: LucideIcon }> = {
  MALE:    { label: "Male",    icon: Mars },
  FEMALE:  { label: "Female",  icon: Venus },
  UNKNOWN: { label: "Unknown", icon: UnknownIcon },
}

const sizeMeta: Record<AnimalSize, { label: string; icon: LucideIcon }> = {
  SMALL:  { label: ANIMAL_SIZE_LABELS.SMALL,  icon: SmallCircle },
  MEDIUM: { label: ANIMAL_SIZE_LABELS.MEDIUM, icon: CircleDot },
  LARGE:  { label: ANIMAL_SIZE_LABELS.LARGE,  icon: CircleDashed },
  XLARGE: { label: ANIMAL_SIZE_LABELS.XLARGE, icon: CircleEllipsis },
}

export const sexOptions = buildOptions(sexMeta)
export const sizeOptions = buildOptions(sizeMeta)