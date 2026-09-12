/**
 * Which assessment templates an animal needs on file, and how often. Derived
 * from the code-defined template registry rather than duplicated here: a
 * template's `species` scopes who needs it, and `stage` marks it as a real
 * prerequisite rather than a purely informational check (e.g. `HANDLING`,
 * which has no `stage`, never blocks readiness).
 *
 * Every requirement is evaluated independently — none are hidden behind an
 * earlier one being unmet. A manager scanning the readiness board wants the
 * full list of what a given animal still needs, not a drip-fed queue; a dog
 * can get its cat test scheduled the same week as its intake exam.
 */

import {
  ASSESSMENT_TEMPLATES,
  getActiveTemplate,
  type AssessmentTemplateDef,
} from "../assessments/templates";

/**
 * Recurring checks go stale after this many days and need a fresh one; a
 * template absent from this map only needs to have been done once, ever.
 * Daily Rounds is the one recurring check today — the seed's ~12-day-old
 * record exists specifically to exercise it going stale after a single day.
 */
const RECURRING_MAX_AGE_DAYS: Partial<Record<string, number>> = {
  DAILY_ROUNDS: 1,
};

export interface ReadinessRequirement {
  templateKey: string;
  templateName: string;
  /** Set only for a recurring check; a one-time check has no staleness. */
  maxAgeDays?: number;
}

const activeStageGatedTemplates = (): AssessmentTemplateDef[] => {
  const keys = new Set(ASSESSMENT_TEMPLATES.map((t) => t.key));
  const active: AssessmentTemplateDef[] = [];
  for (const key of keys) {
    const template = getActiveTemplate(key);
    if (template && template.stage !== undefined) {
      active.push(template);
    }
  }
  return active;
};

/**
 * The requirements that apply to an animal of the given species. An
 * assessment satisfies a requirement by its template `key`, whichever
 * version it was recorded against — a superseded version still counts as the
 * check having been done.
 */
export function readinessRequirementsFor(
  speciesName: string,
): ReadinessRequirement[] {
  return activeStageGatedTemplates()
    .filter((t) => !t.species || t.species === speciesName)
    .map((t) => ({
      templateKey: t.key,
      templateName: t.name,
      maxAgeDays: RECURRING_MAX_AGE_DAYS[t.key],
    }));
}
