import type { LucideIcon } from "lucide-react"

export type OptionMeta = { label: string; icon: LucideIcon; className?: string }

export const buildOptions = <T extends string>(
  meta: Record<T, OptionMeta>,
) => (Object.keys(meta) as T[]).map((value) => ({ value, ...meta[value] }))