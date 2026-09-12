/**
 * What recorded findings suggest about an animal's characteristics. Pure —
 * the data layer loads the rows and passes them in.
 *
 * A recorded answer is judged against the template field row it was recorded
 * on (the version it points at), never against the registry's current
 * definition: a later version, a retired template or a renamed trait must not
 * change what an old finding meant. Traits are matched by id, through the
 * field row's `proposesCharacteristicId`.
 *
 * Nothing here is a decision to store. A proposal becomes "Add to animal" or
 * "Cite this assessment" on the assessment's own page; a contradiction is a
 * warning on the Characteristics tab. Both are recomputed from live data on
 * every read, so there is nothing to keep in sync and nothing to gate.
 *
 * Evidence is ordered by the calendar day it was observed on, in the
 * shelter's timezone. "Observed on" defaults to the moment of recording while
 * a date picked in the calendar is midnight, so two findings from the same day
 * carry clock times that say nothing about which came first.
 */

import { formatInTimeZone } from "date-fns-tz";
import { SHELTER_TIMEZONE } from "../constants/constants";

const shelterDay = (date: Date) =>
  formatInTimeZone(date, SHELTER_TIMEZONE, "yyyy-MM-dd");

/** Whether `a` was observed on a strictly later day than `b`. */
export const observedOnLaterDay = (a: Date, b: Date): boolean =>
  shelterDay(a) > shelterDay(b);

/** A proposing field of the template version an assessment was recorded on. */
export interface RecordedField {
  key: string;
  label: string;
  concerningValues: readonly string[];
  proposesOnValues: readonly string[];
  /** The trait this field proposes, as the catalog calls it now. Null when it
   *  proposes nothing, or the trait has been retired from the catalog. */
  proposes: { id: string; name: string } | null;
}

export interface RecordedAnswer {
  fieldKey: string;
  value: string;
}

/** An assessment as far as its findings are concerned. */
export interface RecordedAssessment {
  id: string;
  templateName: string;
  observedAt: Date;
  /** At least every field of its template version that proposes a trait. */
  fields: readonly RecordedField[];
  answers: readonly RecordedAnswer[];
}

/**
 * A characteristic a recorded finding suggests. Staff act on it from the
 * assessment's own page; nothing is stored until they do.
 */
export interface CharacteristicProposal {
  characteristicId: string;
  characteristicName: string;
  fieldKey: string;
  fieldLabel: string;
  /** The affirming answer that triggered the proposal. */
  answerValue: string;
}

/** A finding that argues against a trait — a concerning answer on a field
 *  that otherwise proposes it. */
export interface CharacteristicContradiction {
  characteristicId: string;
  characteristicName: string;
  fieldKey: string;
  fieldLabel: string;
  answerValue: string;
}

/** A contradicting finding with enough of its assessment to cite it. */
export interface ContradictingFinding extends CharacteristicContradiction {
  assessmentId: string;
  templateName: string;
  observedAt: Date;
}

/** A contradicting finding that a later-observed finding has overtaken. */
export interface SupersededFinding extends CharacteristicContradiction {
  assessmentId: string;
  supersededBy: { assessmentId: string; templateName: string; observedAt: Date };
}

/** One of the animal's active characteristic assignments. */
export interface ActiveCharacteristicAssignment {
  characteristicId: string;
  characteristicName: string;
  /** Null for a manual assignment. */
  sourceAssessmentId: string | null;
}

const proposingFields = (fields: readonly RecordedField[]) =>
  fields.filter(
    (f): f is RecordedField & { proposes: { id: string; name: string } } =>
      f.proposes !== null && f.proposesOnValues.length > 0,
  );

const answerFor = (
  a: Pick<RecordedAssessment, "answers">,
  fieldKey: string,
): RecordedAnswer | undefined => a.answers.find((x) => x.fieldKey === fieldKey);

/** The characteristics an assessment's recorded answers propose. */
export function proposalsOf(
  a: Pick<RecordedAssessment, "fields" | "answers">,
): CharacteristicProposal[] {
  const out: CharacteristicProposal[] = [];
  for (const field of proposingFields(a.fields)) {
    const answer = answerFor(a, field.key);
    if (answer && field.proposesOnValues.includes(answer.value)) {
      out.push({
        characteristicId: field.proposes.id,
        characteristicName: field.proposes.name,
        fieldKey: field.key,
        fieldLabel: field.label,
        answerValue: answer.value,
      });
    }
  }
  return out;
}

/**
 * The characteristics an assessment's recorded answers argue against: a
 * concerning answer on a field that proposes the trait.
 */
export function contradictionsOf(
  a: Pick<RecordedAssessment, "fields" | "answers">,
): CharacteristicContradiction[] {
  const out: CharacteristicContradiction[] = [];
  for (const field of proposingFields(a.fields)) {
    const answer = answerFor(a, field.key);
    if (answer && field.concerningValues.includes(answer.value)) {
      out.push({
        characteristicId: field.proposes.id,
        characteristicName: field.proposes.name,
        fieldKey: field.key,
        fieldLabel: field.label,
        answerValue: answer.value,
      });
    }
  }
  return out;
}

type Entry<A> = { assessment: A; contradiction: CharacteristicContradiction };

/** Every contradiction across an animal's live assessments, by trait id. */
export interface AnimalContradictions<A extends RecordedAssessment> {
  /** Still speaking against the trait. Assessments keep the order given. */
  live: Map<string, Entry<A>[]>;
  /** Overtaken by a later-observed finding that proposes the same trait. */
  superseded: Map<string, (Entry<A> & { supersededBy: A })[]>;
}

/**
 * Groups the contradictions in an animal's live assessments by trait, and
 * sets aside the ones newer evidence has overtaken: a contradicting finding
 * stops counting once a finding observed on a later day proposes the same
 * trait. A later contradicting finding always counts, and two findings from
 * the same day leave the contradiction standing, whatever their clock times.
 */
export function contradictionsByCharacteristic<A extends RecordedAssessment>(
  assessments: readonly A[],
): AnimalContradictions<A> {
  const latestAffirming = new Map<string, A>();
  for (const assessment of assessments) {
    for (const p of proposalsOf(assessment)) {
      const current = latestAffirming.get(p.characteristicId);
      if (!current || assessment.observedAt > current.observedAt) {
        latestAffirming.set(p.characteristicId, assessment);
      }
    }
  }

  const live: AnimalContradictions<A>["live"] = new Map();
  const superseded: AnimalContradictions<A>["superseded"] = new Map();
  for (const assessment of assessments) {
    for (const contradiction of contradictionsOf(assessment)) {
      const id = contradiction.characteristicId;
      const affirming = latestAffirming.get(id);
      if (
        affirming &&
        observedOnLaterDay(affirming.observedAt, assessment.observedAt)
      ) {
        const list = superseded.get(id) ?? [];
        list.push({ assessment, contradiction, supersededBy: affirming });
        superseded.set(id, list);
      } else {
        const list = live.get(id) ?? [];
        list.push({ assessment, contradiction });
        live.set(id, list);
      }
    }
  }
  return { live, superseded };
}

/** The live findings against one trait, cited. Never marked settled — there
 *  is nothing on the trait that could cover one. */
export function findingsAgainst(
  contradictions: AnimalContradictions<RecordedAssessment>,
  characteristicId: string,
): ContradictingFinding[] {
  return (contradictions.live.get(characteristicId) ?? []).map(
    ({ assessment, contradiction }) => ({
      ...contradiction,
      assessmentId: assessment.id,
      templateName: assessment.templateName,
      observedAt: assessment.observedAt,
    }),
  );
}

/** One assessment's own contradicting findings that a later-observed
 *  affirming finding has overtaken — shown on its own page. */
export function supersededFindingsOf<A extends RecordedAssessment>(
  assessmentId: string,
  contradictions: AnimalContradictions<A>,
): SupersededFinding[] {
  return [...contradictions.superseded.values()]
    .flat()
    .filter((e) => e.assessment.id === assessmentId)
    .map(
      (e): SupersededFinding => ({
        ...e.contradiction,
        assessmentId: e.assessment.id,
        supersededBy: {
          assessmentId: e.supersededBy.id,
          templateName: e.supersededBy.templateName,
          observedAt: e.supersededBy.observedAt,
        },
      }),
    );
}

/** What one assessment's findings suggest doing with a trait they propose. */
export interface CharacteristicSuggestion {
  characteristicId: string;
  characteristicName: string;
  fieldLabel: string;
  answerValue: string;
  /** "ADD" when the trait isn't assigned anywhere; "CITE" when it is, from a
   *  different citation (or none) — acting on it moves the citation here. */
  action: "ADD" | "CITE";
  /** Live findings against the trait, whatever their source. Shown as a
   *  warning under the suggestion; never disables it. */
  contradictions: ContradictingFinding[];
}

/**
 * What acting on an assessment's proposal of a trait does, given the trait's
 * active assignment (undefined when it has none): add it, move its citation
 * here, or nothing at all when this assessment already sources it. The page
 * and the write both ask this, so a stale page can't make the write re-stamp
 * a citation that is already in place.
 */
export function suggestionActionFor(
  assignment: Pick<ActiveCharacteristicAssignment, "sourceAssessmentId"> | undefined,
  assessmentId: string,
): CharacteristicSuggestion["action"] | null {
  if (!assignment) return "ADD";
  return assignment.sourceAssessmentId === assessmentId ? null : "CITE";
}

export interface AssessmentCharacteristicsSummary {
  /** What this assessment's findings suggest doing. Empty for a deleted
   *  assessment (nothing to add from one), or one that already sources
   *  everything it currently proposes. */
  suggestions: CharacteristicSuggestion[];
  /** This assessment's own contradicting findings that a later-observed
   *  affirming finding has overtaken. */
  superseded: SupersededFinding[];
}

/**
 * What one assessment's findings say about the animal's characteristics,
 * given the animal's active assignments and its live assessments (this one
 * included, unless it is deleted).
 */
export function summarizeAssessmentCharacteristics(input: {
  assessment: RecordedAssessment;
  deleted: boolean;
  assignments: readonly ActiveCharacteristicAssignment[];
  liveAssessments: readonly RecordedAssessment[];
}): AssessmentCharacteristicsSummary {
  const { assessment, deleted, assignments, liveAssessments } = input;
  const contradictions = contradictionsByCharacteristic(liveAssessments);

  // A deleted assessment can't source anything; its own superseded findings
  // aren't shown either — it no longer speaks for the animal at all.
  if (deleted) return { suggestions: [], superseded: [] };

  const assignmentById = new Map(
    assignments.map((a) => [a.characteristicId, a]),
  );

  const suggestions: CharacteristicSuggestion[] = [];
  for (const p of proposalsOf(assessment)) {
    const action = suggestionActionFor(
      assignmentById.get(p.characteristicId),
      assessment.id,
    );
    // Already settled: this assessment already sources the trait.
    if (action === null) continue;
    suggestions.push({
      characteristicId: p.characteristicId,
      characteristicName: p.characteristicName,
      fieldLabel: p.fieldLabel,
      answerValue: p.answerValue,
      action,
      contradictions: findingsAgainst(contradictions, p.characteristicId),
    });
  }

  return {
    suggestions,
    superseded: supersededFindingsOf(assessment.id, contradictions),
  };
}
