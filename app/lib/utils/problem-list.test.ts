import { test } from "node:test";
import assert from "node:assert/strict";
import {
  careEpisodeLabel,
  careEpisodeOrder,
  conditionLabel,
  conditionSourceText,
  conditionTraitState,
  problemListOrder,
} from "./problem-list";

const row = (
  id: string,
  name: string,
  type: "CONDITION" | "ALLERGY",
  status: "ACTIVE" | "CHRONIC" | "RESOLVED",
  voided = false,
) => ({ id, name, type, status, voidedAt: voided ? new Date("2026-10-01T00:00:00Z") : null });

test("problemListOrder: allergies, live conditions, resolved, then voided, by name", () => {
  const ordered = problemListOrder([
    row("1", "Ringworm", "CONDITION", "ACTIVE", true),
    row("2", "flea infestation", "CONDITION", "RESOLVED"),
    row("3", "Heartworm disease", "CONDITION", "ACTIVE"),
    row("4", "Penicillin", "ALLERGY", "ACTIVE"),
    row("5", "Chicken", "ALLERGY", "CHRONIC"),
    row("6", "Congenital deafness", "CONDITION", "CHRONIC"),
    row("7", "Beef", "ALLERGY", "RESOLVED"),
  ]);
  assert.deepEqual(
    ordered.map((r) => r.name),
    [
      "Chicken",
      "Penicillin",
      "Congenital deafness",
      "Heartworm disease",
      "Beef",
      "flea infestation",
      "Ringworm",
    ],
  );
});

const episode = (
  id: string,
  startDate: string,
  endDate: string | null,
  voided = false,
  createdAt = "2026-10-01T00:00:00Z",
) => ({
  id,
  startDate,
  endDate,
  voidedAt: voided ? new Date("2026-10-02T00:00:00Z") : null,
  createdAt: new Date(createdAt),
});

test("careEpisodeOrder: the open episode first, then newest start first", () => {
  const ordered = careEpisodeOrder([
    episode("a", "2026-08-01", "2026-08-03"),
    episode("b", "2026-09-20", null),
    episode("c", "2026-09-25", null, true),
    episode("d", "2026-09-01", "2026-09-05"),
    episode("e", "2026-09-01", "2026-09-02", false, "2026-10-03T00:00:00Z"),
  ]);
  assert.deepEqual(
    ordered.map((e) => e.id),
    ["b", "c", "e", "d", "a"],
  );
});

test("conditionSourceText: a test by its item, an exam by its type", () => {
  assert.equal(
    conditionSourceText({
      kind: "TEST",
      examType: null,
      completedDate: "2026-09-03",
      item: { name: "Heartworm antigen" },
    }),
    "Heartworm antigen test of Sep 3, 2026",
  );
  assert.equal(
    conditionSourceText({
      kind: "EXAM",
      examType: "INTAKE",
      completedDate: "2026-08-01",
      item: null,
    }),
    "intake exam of Aug 1, 2026",
  );
});

test("conditionLabel and careEpisodeLabel: names for headings and buttons", () => {
  assert.equal(conditionLabel({ name: "Penicillin", type: "ALLERGY" }), "Penicillin (allergy)");
  assert.equal(
    careEpisodeLabel({
      type: "HOSPITALISED_IN_HOUSE",
      startDate: "2026-10-03",
      endDate: null,
      partner: null,
    }),
    "Hospitalised in house since Oct 3, 2026",
  );
  assert.equal(
    careEpisodeLabel({
      type: "HOSPITALISED_OFF_SITE",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      partner: { name: "Downtown Veterinary Clinic" },
    }),
    "Hospitalised at Downtown Veterinary Clinic, Sep 1, 2026 to Sep 5, 2026",
  );
});

test("conditionTraitState: add, cite, already cited, or nothing to offer", () => {
  const base = {
    id: "c1",
    status: "ACTIVE" as const,
    voidedAt: null,
    characteristicId: "t1",
    characteristic: { deletedAt: null },
    animal: { animalCharacteristics: [] as { characteristicId: string; sourceConditionId: string | null }[] },
  };
  assert.equal(conditionTraitState(base), "ADD");
  const carrying = (sourceConditionId: string | null) => ({
    ...base,
    animal: { animalCharacteristics: [{ characteristicId: "t1", sourceConditionId }] },
  });
  assert.equal(conditionTraitState(carrying(null)), "CITE");
  assert.equal(conditionTraitState(carrying("c2")), "CITE");
  assert.equal(conditionTraitState(carrying("c1")), "CITED");
  assert.equal(conditionTraitState({ ...base, status: "CHRONIC" }), "ADD");
  assert.equal(conditionTraitState({ ...base, status: "RESOLVED" }), null);
  assert.equal(conditionTraitState({ ...base, voidedAt: new Date() }), null);
  assert.equal(conditionTraitState({ ...base, characteristicId: null, characteristic: null }), null);
  assert.equal(conditionTraitState({ ...base, characteristic: { deletedAt: new Date() } }), null);
});
