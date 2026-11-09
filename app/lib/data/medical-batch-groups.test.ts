import { test } from "node:test";
import assert from "node:assert/strict";
import {
  animalsOfGroup,
  groupBatchAnimals,
  type MedicalBatchAnimal,
} from "./medical-batch-groups";
import type { MedicalDuePlace } from "./medical-due-groups";

const animal = (name: string, place: MedicalDuePlace): MedicalBatchAnimal => ({
  id: name.toLowerCase(),
  name,
  species: { id: "dog", name: "Dog" },
  sex: "MALE",
  primaryColor: "Black",
  birthDate: "2024-01-01",
  place,
});
const unit = (locationId: string, locationName: string, unitId: string, unitName: string): MedicalDuePlace => ({
  type: "UNIT",
  locationId,
  locationName,
  unitId,
  unitName,
});

test("groupBatchAnimals: locations then fosters then not housed, each by name", () => {
  const groups = groupBatchAnimals([
    animal("Zed", { type: "NOT_HOUSED" }),
    animal("Juno", { type: "FOSTER", fosterPersonId: "p2", fosterName: "Sam" }),
    animal("Ivy", { type: "FOSTER", fosterPersonId: "p1", fosterName: "Ana" }),
    animal("Max", unit("l2", "Medical wing", "u3", "MED-1")),
    animal("Bea", unit("l1", "Dog kennels", "u2", "K-2")),
    animal("Abe", unit("l1", "Dog kennels", "u1", "K-1")),
    animal("Cy", unit("l1", "Dog kennels", "u1", "K-1")),
  ]);

  assert.deepEqual(
    groups.map((group) => [group.type, group.title]),
    [
      ["LOCATION", "Dog kennels"],
      ["LOCATION", "Medical wing"],
      ["FOSTER", "Ana"],
      ["FOSTER", "Sam"],
      ["NOT_HOUSED", "Not housed"],
    ],
  );
  const kennels = groups[0];
  assert.equal(kennels.type, "LOCATION");
  if (kennels.type !== "LOCATION") throw new Error("unreachable");
  assert.deepEqual(
    kennels.units.map((set) => [set.title, set.animals.map((a) => a.name)]),
    [
      ["K-1", ["Abe", "Cy"]],
      ["K-2", ["Bea"]],
    ],
  );
  assert.deepEqual(animalsOfGroup(kennels).map((a) => a.name), ["Abe", "Cy", "Bea"]);
});

test("groupBatchAnimals: same-named units and locations stay apart, keys unique", () => {
  const groups = groupBatchAnimals([
    animal("A", unit("l1", "Annex", "u1", "Room 1")),
    animal("B", unit("l2", "Annex", "u2", "Room 1")),
    animal("C", unit("l1", "Annex", "u3", "Room 1")),
  ]);
  assert.equal(groups.length, 2);
  const keys = groups.flatMap((group) =>
    group.type === "LOCATION"
      ? [group.key, ...group.units.map((set) => set.key)]
      : [group.key],
  );
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(
    groups.reduce((sum, group) => sum + animalsOfGroup(group).length, 0),
    3,
  );
});

test("groupBatchAnimals: no Not housed group when everyone is housed", () => {
  assert.deepEqual(groupBatchAnimals([]), []);
  assert.ok(
    groupBatchAnimals([animal("A", unit("l1", "Annex", "u1", "R1"))]).every(
      (group) => group.type !== "NOT_HOUSED",
    ),
  );
});
