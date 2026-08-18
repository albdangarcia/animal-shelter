import { Sex, AnimalSize } from "@/prisma/generated/enums";
import { ANIMAL_SIZE_LABELS } from "@/app/lib/utils/enum-formatter";

// Plain { label, value } options for the public pets faceted filters.
//
// NOTE: no `icon` field here on purpose. These options are created in a Server
// Component (page.tsx) and passed as props into the client-side faceted filter.
// A lucide icon is a React component and can't be serialized across the
// server→client boundary ("Only plain objects can be passed..."). The color
// filter beside these is also icon-less, so this stays visually consistent.

// UNKNOWN is intentionally omitted — adopters filter for "male" or "female";
// pets with UNKNOWN sex simply don't match a sex filter (they show when none set).
export const SexOptions: { label: string; value: string }[] = [
  { label: "Male", value: Sex.MALE },
  { label: "Female", value: Sex.FEMALE },
];

export const SizeOptions: { label: string; value: string }[] = (
  Object.entries(ANIMAL_SIZE_LABELS) as [AnimalSize, string][]
).map(([value, label]) => ({ label, value }));