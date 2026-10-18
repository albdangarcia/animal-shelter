import type { MedicalOutputAnimal } from "@/app/lib/utils/medical-output";
import { medicalOutputDayText as day } from "@/app/lib/utils/medical-output";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

export function OutputIdentity({ animal: a, generatedDate, generatedAt }: {
  animal: MedicalOutputAnimal; generatedDate: CalendarDay; generatedAt: Date;
}) {
  return <dl><dt>Animal ID</dt><dd>{a.id}</dd><dt>Species</dt><dd>{a.species}</dd>
    <dt>Breeds</dt><dd>{a.breeds.join(", ") || "Not recorded"}</dd><dt>Sex</dt><dd>{{ MALE: "Male", FEMALE: "Female", UNKNOWN: "Unknown" }[a.sex]}</dd>
    <dt>Birth date</dt><dd>{day(a.birthDate)}</dd><dt>Color</dt><dd>{a.primaryColor}</dd>
    <dt>Generated day</dt><dd>{day(generatedDate)} (shelter calendar)</dd><dt>Generated at</dt><dd>{generatedAt.toISOString()} (UTC instant)</dd></dl>;
}
