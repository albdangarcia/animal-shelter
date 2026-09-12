// Pure tests for the findings -> characteristics mapping. No database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fromZonedTime } from "date-fns-tz";
import { SHELTER_TIMEZONE } from "../constants/constants";
import {
  contradictionsByCharacteristic,
  contradictionsOf,
  proposalsOf,
  suggestionActionFor,
  summarizeAssessmentCharacteristics,
  type ActiveCharacteristicAssignment,
  type RecordedAssessment,
  type RecordedField,
} from "./proposals";

const CATS = { id: "char-cats", name: "Good with cats" };
const DOGS = { id: "char-dogs", name: "Good with other dogs" };

const catRecommendation: RecordedField = {
  key: "recommendation",
  label: "Recommendation",
  concerningValues: ["Not cat-safe"],
  proposesOnValues: ["Cat-safe"],
  proposes: CATS,
};

const dogRecommendation: RecordedField = {
  key: "recommendation",
  label: "Recommendation",
  concerningValues: ["Solo-dog home"],
  proposesOnValues: ["Dog-social"],
  proposes: DOGS,
};

const day = (n: number) => new Date(Date.UTC(2026, 8, n));

/** A wall-clock time on September `n` in the shelter's timezone. */
const at = (n: number, time: string) =>
  fromZonedTime(`2026-09-${String(n).padStart(2, "0")} ${time}`, SHELTER_TIMEZONE);

/** A cat test answered `value`, observed on September `observed` (or at an
 *  exact time). */
const catTest = (
  id: string,
  value: string | null,
  observed: number | Date,
): RecordedAssessment => ({
  id,
  templateName: "Cat Test",
  observedAt: typeof observed === "number" ? day(observed) : observed,
  fields: [catRecommendation],
  answers: value === null ? [] : [{ fieldKey: "recommendation", value }],
});

const assigned = (
  characteristic: { id: string; name: string },
  source: string | null,
): ActiveCharacteristicAssignment => ({
  characteristicId: characteristic.id,
  characteristicName: characteristic.name,
  sourceAssessmentId: source,
});

/** The summary of `assessment`'s findings, given the animal's assignments and
 *  its other live assessments (this one included unless deleted). */
const summarize = (
  assessment: RecordedAssessment,
  assignments: ActiveCharacteristicAssignment[],
  others: RecordedAssessment[] = [],
  deleted = false,
) =>
  summarizeAssessmentCharacteristics({
    assessment,
    deleted,
    assignments,
    liveAssessments: deleted ? others : [assessment, ...others],
  });

// --- Reading one assessment's findings ---------------------------------------

test("an affirming answer proposes the trait its field row points at", () => {
  assert.deepEqual(proposalsOf(catTest("a", "Cat-safe", 1)), [
    {
      characteristicId: "char-cats",
      characteristicName: "Good with cats",
      fieldKey: "recommendation",
      fieldLabel: "Recommendation",
      answerValue: "Cat-safe",
    },
  ]);
});

test("a neutral, concerning or missing answer proposes nothing", () => {
  for (const value of ["Cat-tolerant with management", "Not cat-safe", null]) {
    assert.deepEqual(proposalsOf(catTest("a", value, 1)), []);
  }
});

test("a concerning answer on a proposing field contradicts the trait", () => {
  const [c] = contradictionsOf(catTest("a", "Not cat-safe", 1));
  assert.equal(c.characteristicId, "char-cats");
  assert.equal(c.answerValue, "Not cat-safe");
  assert.deepEqual(contradictionsOf(catTest("a", "Cat-safe", 1)), []);
});

test("answers are judged by the field row they were recorded on", () => {
  // A later template version may use other wording; this row is what counts.
  const v1 = {
    ...catTest("a", "Safe around cats", 1),
    fields: [{ ...catRecommendation, proposesOnValues: ["Safe around cats"] }],
  };
  assert.equal(proposalsOf(v1)[0]?.characteristicId, "char-cats");
});

test("a field whose trait was retired from the catalog proposes and contradicts nothing", () => {
  const retired = (value: string) => ({
    ...catTest("a", value, 1),
    fields: [{ ...catRecommendation, proposes: null }],
  });
  assert.deepEqual(proposalsOf(retired("Cat-safe")), []);
  assert.deepEqual(contradictionsOf(retired("Not cat-safe")), []);
});

// --- Across the animal's assessments -----------------------------------------

test("contradictions are grouped by trait across assessments", () => {
  const { live } = contradictionsByCharacteristic([
    catTest("cat-1", "Not cat-safe", 5),
    catTest("cat-2", "Not cat-safe", 3),
    {
      id: "dog-1",
      templateName: "Dog-to-Dog Introduction",
      observedAt: day(4),
      fields: [dogRecommendation],
      answers: [{ fieldKey: "recommendation", value: "Solo-dog home" }],
    },
  ]);
  assert.deepEqual([...live.keys()].sort(), ["char-cats", "char-dogs"]);
  assert.deepEqual(
    live.get("char-cats")?.map((e) => e.assessment.id),
    ["cat-1", "cat-2"],
  );
});

test("a later affirming finding supersedes an older contradiction", () => {
  const { live, superseded } = contradictionsByCharacteristic([
    catTest("retest", "Cat-safe", 10),
    catTest("first", "Not cat-safe", 2),
  ]);
  assert.equal(live.size, 0);
  const [entry] = superseded.get("char-cats") ?? [];
  assert.equal(entry.assessment.id, "first");
  assert.equal(entry.supersededBy.id, "retest");
});

test("a contradiction observed after the latest affirming finding still counts", () => {
  const { live, superseded } = contradictionsByCharacteristic([
    catTest("second", "Not cat-safe", 12),
    catTest("retest", "Cat-safe", 10),
    catTest("first", "Not cat-safe", 2),
  ]);
  assert.deepEqual(
    live.get("char-cats")?.map((e) => e.assessment.id),
    ["second"],
  );
  assert.deepEqual(
    superseded.get("char-cats")?.map((e) => e.assessment.id),
    ["first"],
  );
});

test("a backdated affirming finding doesn't supersede a newer contradiction", () => {
  const { live } = contradictionsByCharacteristic([
    catTest("not-safe", "Not cat-safe", 9),
    catTest("backdated", "Cat-safe", 5),
  ]);
  assert.equal(live.get("char-cats")?.length, 1);
});

test("an affirming and a contradicting finding on the same day: the contradiction stands, whichever clock time is later", () => {
  // "Observed on" defaults to the moment of recording, a picked date is
  // midnight: clock times on one day say nothing about order.
  for (const [affirmingAt, contradictingAt] of [
    [at(7, "16:30"), at(7, "09:00")],
    [at(7, "09:00"), at(7, "16:30")],
    [at(7, "00:00"), at(7, "23:59")],
    [at(7, "23:59"), at(7, "00:00")],
  ]) {
    const { live, superseded } = contradictionsByCharacteristic([
      catTest("affirming", "Cat-safe", affirmingAt),
      catTest("contradicting", "Not cat-safe", contradictingAt),
    ]);
    assert.equal(live.get("char-cats")?.length, 1);
    assert.equal(superseded.size, 0);
  }
});

test("the observation day is the shelter's, not UTC's", () => {
  // 23:30 and 00:30 local, an hour apart, are different days; 01:00 and
  // 23:00 local fall on one day even where UTC has already moved on.
  const { superseded } = contradictionsByCharacteristic([
    catTest("affirming", "Cat-safe", at(8, "00:30")),
    catTest("contradicting", "Not cat-safe", at(7, "23:30")),
  ]);
  assert.equal(superseded.get("char-cats")?.length, 1);

  const { live } = contradictionsByCharacteristic([
    catTest("affirming", "Cat-safe", at(7, "23:00")),
    catTest("contradicting", "Not cat-safe", at(7, "01:00")),
  ]);
  assert.equal(live.get("char-cats")?.length, 1);
});

// --- summarizeAssessmentCharacteristics, table-driven over the state table --
//
// Each case is one (trait, proposing-assessment) state from the state table
// in docs/specs/animal-readiness.md's Step 5 section. Nothing here is a
// decision to store, so every case is checked from a fresh call — there is no
// "before" and "after" to diff.

test("state table: unassigned — suggests adding it", () => {
  const here = catTest("here", "Cat-safe", 1);
  const [s] = summarize(here, []).suggestions;
  assert.equal(s.characteristicId, "char-cats");
  assert.equal(s.action, "ADD");
  assert.deepEqual(s.contradictions, []);
});

test("state table: cited by this assessment — nothing to suggest", () => {
  const here = catTest("here", "Cat-safe", 1);
  assert.deepEqual(summarize(here, [assigned(CATS, "here")]).suggestions, []);
});

test("acting on a suggestion this assessment already cites does nothing", () => {
  // A second tab still showing "Add to animal" or "Cite this assessment"
  // after the first tab's click: the write must not re-stamp or re-log.
  assert.equal(suggestionActionFor(assigned(CATS, "here"), "here"), null);
  assert.equal(suggestionActionFor(assigned(CATS, "elsewhere"), "here"), "CITE");
  assert.equal(suggestionActionFor(undefined, "here"), "ADD");
});

test("state table: cited elsewhere — suggests citing this one instead", () => {
  const here = catTest("here", "Cat-safe", 1);
  const [s] = summarize(here, [assigned(CATS, "elsewhere")]).suggestions;
  assert.equal(s.action, "CITE");
});

test("state table: added by hand — suggests citing this one", () => {
  const here = catTest("here", "Cat-safe", 1);
  const [s] = summarize(here, [assigned(CATS, null)]).suggestions;
  assert.equal(s.action, "CITE");
});

test("state table: removed — reads the same as unassigned", () => {
  // A removed row isn't among the active assignments passed in at all.
  const here = catTest("here", "Cat-safe", 1);
  const [s] = summarize(here, []).suggestions;
  assert.equal(s.action, "ADD");
});

test("state table: deleted source — nothing to suggest, nothing superseded", () => {
  const here = catTest("here", "Cat-safe", 1);
  const summary = summarize(here, [assigned(CATS, "here")], [], true);
  assert.deepEqual(summary.suggestions, []);
  assert.deepEqual(summary.superseded, []);
});

test("state table: restored — resumes reading as its citation now stands", () => {
  // Never actually deleted from the pure function's point of view: restoring
  // is deleted:true -> deleted:false with the citation unchanged.
  const here = catTest("here", "Cat-safe", 1);
  assert.deepEqual(
    summarize(here, [assigned(CATS, "here")], [], false).suggestions,
    [],
  );
});

test("state table: edited away — no longer proposes, so no row at all", () => {
  const here = catTest("here", "Cat-tolerant with management", 1);
  assert.deepEqual(summarize(here, [assigned(CATS, "here")]).suggestions, []);
  assert.deepEqual(summarize(here, []).suggestions, []);
});

test("state table: contradicted, live — a warning under the suggestion, never a gate", () => {
  const affirming = catTest("affirming", "Cat-safe", 3);
  const contradicting = catTest("contradicting", "Not cat-safe", 9);
  const [s] = summarize(affirming, [], [contradicting]).suggestions;
  assert.equal(s.action, "ADD");
  assert.equal(s.contradictions.length, 1);
  assert.equal(s.contradictions[0].assessmentId, "contradicting");

  // The contradicting assessment's own page proposes nothing, so it shows no
  // suggestion row at all — the warning lives only on the tab and on the
  // trait it affirms.
  assert.deepEqual(
    summarize(contradicting, [], [affirming]).suggestions,
    [],
  );
});

test("state table: contradicted, overtaken — superseded on the older page, no warning elsewhere", () => {
  const older = catTest("older", "Not cat-safe", 2);
  const newer = catTest("newer", "Cat-safe", 10);

  const onOlder = summarize(older, [], [newer]);
  assert.deepEqual(onOlder.suggestions, []); // older doesn't propose anything
  assert.equal(onOlder.superseded.length, 1);
  assert.equal(onOlder.superseded[0].supersededBy.assessmentId, "newer");

  // The newer, affirming assessment suggests adding the trait with no
  // warning — the overtaken contradiction doesn't count.
  const onNewer = summarize(newer, [], [older]);
  assert.equal(onNewer.suggestions[0]?.contradictions.length, 0);
});

test("state table: catalog rename — matched by id; only the shown name changes", () => {
  const renamed = { id: "char-cats", name: "Cat-friendly" };
  const here = {
    ...catTest("here", "Cat-safe", 1),
    fields: [{ ...catRecommendation, proposes: renamed }],
  };
  // Already cited by this assessment under the trait's id: nothing to
  // suggest, whatever the assignment's stored name reads.
  assert.deepEqual(summarize(here, [assigned(CATS, "here")]).suggestions, []);
  // Cited elsewhere: the suggestion carries the catalog's current name.
  const [s] = summarize(here, [assigned(CATS, "elsewhere")]).suggestions;
  assert.equal(s.characteristicName, "Cat-friendly");
});
