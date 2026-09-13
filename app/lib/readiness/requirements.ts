/**
 * Which assessment templates an animal needs on file. Derived from the
 * code-defined template registry rather than duplicated here: a template's
 * `species` scopes who needs it, and its `stage` decides whether it is a
 * readiness prerequisite at all. Only `intake` and `adoption-prep` stages
 * gate readiness — an `in-care` check like Daily Rounds is ongoing husbandry,
 * not something that stands between an animal and being adoptable, and a
 * template with no `stage` (e.g. `HANDLING`) is purely informational.
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

const READINESS_STAGES = new Set(["intake", "adoption-prep"]);

export interface ReadinessRequirement {
  templateKey: string;
  templateName: string;
}

const activeStageGatedTemplates = (): AssessmentTemplateDef[] => {
  const keys = new Set(ASSESSMENT_TEMPLATES.map((t) => t.key));
  const active: AssessmentTemplateDef[] = [];
  for (const key of keys) {
    const template = getActiveTemplate(key);
    if (template?.stage !== undefined && READINESS_STAGES.has(template.stage)) {
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
    }));
}
