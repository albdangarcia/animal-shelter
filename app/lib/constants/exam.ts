/**
 * The body systems an exam looks at, in the order the exam form lists them.
 * Each one is a finding on the exam: normal, abnormal (with a note) or not
 * examined.
 *
 * Defined here rather than by admins, so every exam reads the same way. A
 * finding stores the system's `key`, a plain string the database doesn't
 * check, so adding a system needs no migration, and exams recorded before it
 * keep the systems they were recorded with. Rename a `label` freely; never
 * reuse or repurpose a `key`, since stored findings match on it.
 *
 * Whether the animal is intact or altered isn't a body system: it is the
 * exam's reproductive status, a field of its own.
 */
export const EXAM_BODY_SYSTEMS = [
  { key: "GENERAL_APPEARANCE", label: "General appearance" },
  { key: "EYES", label: "Eyes" },
  { key: "EARS", label: "Ears" },
  { key: "NOSE_THROAT", label: "Nose and throat" },
  { key: "MOUTH_TEETH", label: "Mouth and teeth" },
  { key: "SKIN_COAT", label: "Skin and coat" },
  { key: "EXTERNAL_PARASITES", label: "External parasites" },
  { key: "HEART", label: "Heart" },
  { key: "LUNGS", label: "Lungs" },
  { key: "ABDOMEN", label: "Abdomen" },
  { key: "MUSCULOSKELETAL", label: "Musculoskeletal" },
  { key: "NEUROLOGICAL", label: "Neurological" },
] as const satisfies readonly { key: string; label: string }[];

export type ExamBodySystemKey = (typeof EXAM_BODY_SYSTEMS)[number]["key"];

/** The keys of every body system an exam is recorded against today. */
export const EXAM_BODY_SYSTEM_KEYS: readonly string[] = EXAM_BODY_SYSTEMS.map(
  (system) => system.key,
);

/**
 * A system's label, or the key itself for a system no longer listed, so an
 * old finding still reads.
 */
export const examBodySystemLabel = (key: string): string =>
  EXAM_BODY_SYSTEMS.find((system) => system.key === key)?.label ?? key;
