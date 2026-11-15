import { test } from "node:test";
import assert from "node:assert/strict";
import { fromZonedTime } from "date-fns-tz";
import type { AnimalListingStatus } from "@/prisma/generated/enums";
import type { ReadinessBlocker } from "./compute-readiness";
import type { CalendarDay } from "../utils/shelter-day";
import {
  buildReadinessBoard,
  type AnimalReadiness,
  type ReadinessBlockerKind,
  type ReadinessBoardFilters,
} from "./board";
import {
  READY_DRAFTS_NAMED,
  groupCountNoun,
  groupLine,
  moreLine,
  publishedBlockedLine,
  readinessHeadline,
  readyDraftsLine,
  summariseReadiness as rawSummariseReadiness,
} from "./summary";

const SHELTER_TIMEZONE = "America/New_York";
const at = (day: number) =>
  fromZonedTime(`2026-09-${String(day).padStart(2, "0")} 12:00`, SHELTER_TIMEZONE);
const NOW = at(12);
const summariseReadiness = (readiness: AnimalReadiness[]) =>
  rawSummariseReadiness(readiness, NOW, SHELTER_TIMEZONE);

// One blocker of each kind, enough for the summary to count and group.
const blocker = (kind: ReadinessBlockerKind): ReadinessBlocker => {
  const since = at(1);
  switch (kind) {
    case "MISSING_ASSESSMENT":
      return { kind, templateKey: "DOG_TEST", templateName: "Dog test", since };
    case "ESCALATED_FINDING":
      return { kind, assessmentId: "a1", templateName: "Dog test", observedAt: since, since };
    case "UNSUPPORTED_CHARACTERISTIC":
      return { kind, characteristicId: "c1", characteristicName: "Good with cats", issue: "SOURCE_DELETED", since };
    case "NEEDS_VET_REVIEW":
      return { kind, entryId: "e1", examType: "INTAKE", examDate: "2026-09-01" as CalendarDay, since };
    case "UNDER_CARE":
      return { kind, episodeId: "ep1", episodeType: "HOSPITALISED_IN_HOUSE", startDate: "2026-09-01" as CalendarDay, partnerName: null, since };
    case "NO_INTAKE_EXAM":
    case "NOT_SPAYED_NEUTERED":
    case "NO_PHOTO":
      return { kind, since };
  }
};

let nextId = 0;
const entry = (
  listingStatus: AnimalListingStatus,
  kinds: ReadinessBlockerKind[] = [],
  name = `Animal ${++nextId}`,
): AnimalReadiness => ({
  animal: {
    id: `id-${name}`,
    name,
    species: "Dog",
    listingStatus,
    placement: { kind: "FOSTER" },
  },
  blockers: kinds.map(blocker),
});

test("ready and total come from every animal on the board, blocked or not", () => {
  const summary = summariseReadiness([
    entry("DRAFT"),
    entry("PUBLISHED"),
    entry("PENDING_ADOPTION", ["NO_PHOTO"]),
    entry("DRAFT", ["NO_PHOTO", "NO_INTAKE_EXAM"]),
  ]);
  assert.equal(summary.animalCount, 4);
  assert.equal(summary.readyCount, 2);
});

test("ready drafts: only drafts with no blockers are counted and named, by name", () => {
  const summary = summariseReadiness([
    entry("DRAFT", [], "Rocket"),
    entry("DRAFT", [], "Biscuit"),
    entry("DRAFT", ["NO_PHOTO"], "Blocked draft"),
    entry("PUBLISHED", [], "Ready published"),
    entry("PENDING_ADOPTION", [], "Ready pending"),
  ]);
  assert.equal(summary.readyDrafts.count, 2);
  assert.deepEqual(
    summary.readyDrafts.named.map((a) => a.name),
    ["Biscuit", "Rocket"],
  );
  assert.equal(summary.readyDrafts.named[0].id, "id-Biscuit");
});

test("ready drafts: the count is uncapped while only the first few are named", () => {
  const drafts = Array.from({ length: READY_DRAFTS_NAMED + 2 }, (_, i) =>
    entry("DRAFT", [], `Draft ${String.fromCharCode(71 - i)}`),
  );
  const summary = summariseReadiness(drafts);
  assert.equal(summary.readyDrafts.count, READY_DRAFTS_NAMED + 2);
  assert.equal(summary.readyDrafts.named.length, READY_DRAFTS_NAMED);
  assert.equal(summary.readyDrafts.named[0].name, "Draft A");
});

test("a published animal is counted once however many blockers it has; other stages are not counted", () => {
  const summary = summariseReadiness([
    entry("PUBLISHED", ["NO_PHOTO", "NOT_SPAYED_NEUTERED", "MISSING_ASSESSMENT"]),
    entry("PUBLISHED", ["NO_PHOTO"]),
    entry("PUBLISHED"),
    entry("DRAFT", ["NO_PHOTO"]),
    entry("PENDING_ADOPTION", ["NO_PHOTO"]),
  ]);
  assert.equal(summary.publishedBlockedCount, 2);
});

test("groups: the largest first, ties in board order, three at most", () => {
  const summary = summariseReadiness([
    entry("DRAFT", ["NO_PHOTO", "NO_INTAKE_EXAM", "MISSING_ASSESSMENT", "NOT_SPAYED_NEUTERED"]),
    entry("DRAFT", ["NO_PHOTO", "NO_INTAKE_EXAM", "MISSING_ASSESSMENT"]),
    entry("DRAFT", ["NO_PHOTO"]),
  ]);
  // NO_PHOTO 3; MISSING_ASSESSMENT and NO_INTAKE_EXAM tie at 2, in board
  // order; NOT_SPAYED_NEUTERED (1) does not fit.
  assert.deepEqual(
    summary.groups.map((g) => [g.kind, g.count]),
    [
      ["NO_PHOTO", 3],
      ["MISSING_ASSESSMENT", 2],
      ["NO_INTAKE_EXAM", 2],
    ],
  );
  assert.equal(summary.groups[0].title, "No photo");
});

test("groups: urgent kinds come first whenever non-zero, however small", () => {
  const summary = summariseReadiness([
    entry("DRAFT", ["NO_PHOTO", "NEEDS_VET_REVIEW"]),
    entry("DRAFT", ["NO_PHOTO", "MISSING_ASSESSMENT"]),
    entry("DRAFT", ["NO_PHOTO", "MISSING_ASSESSMENT"]),
    entry("DRAFT", ["ESCALATED_FINDING"]),
  ]);
  assert.deepEqual(
    summary.groups.map((g) => g.kind),
    ["ESCALATED_FINDING", "NEEDS_VET_REVIEW", "NO_PHOTO"],
  );
});

test("groups: the two urgent kinds keep board order, whichever is larger", () => {
  const summary = summariseReadiness([
    entry("DRAFT", ["NEEDS_VET_REVIEW"]),
    entry("DRAFT", ["NEEDS_VET_REVIEW"]),
    entry("DRAFT", ["NEEDS_VET_REVIEW", "NO_PHOTO"]),
    entry("DRAFT", ["ESCALATED_FINDING", "NO_PHOTO"]),
  ]);
  assert.deepEqual(
    summary.groups.map((g) => [g.kind, g.count]),
    [
      ["ESCALATED_FINDING", 1],
      ["NEEDS_VET_REVIEW", 3],
      ["NO_PHOTO", 2],
    ],
  );
});

test("groups: Under care is left out (it has its own card), and empty groups are not shown", () => {
  const summary = summariseReadiness([
    entry("PUBLISHED", ["UNDER_CARE"]),
    entry("PUBLISHED", ["UNDER_CARE", "NO_PHOTO"]),
  ]);
  assert.deepEqual(
    summary.groups.map((g) => [g.kind, g.count]),
    [["NO_PHOTO", 1]],
  );
  // The animal blocked only by care still counts as not ready.
  assert.equal(summary.readyCount, 0);
  assert.equal(summary.publishedBlockedCount, 2);
});

test("empty states: no animals, and none blocked", () => {
  const none = summariseReadiness([]);
  assert.deepEqual(none, {
    animalCount: 0,
    readyCount: 0,
    readyDrafts: { count: 0, named: [] },
    publishedBlockedCount: 0,
    groups: [],
  });
  assert.equal(readinessHeadline(none), "No animals in care");

  const allReady = summariseReadiness([entry("PUBLISHED"), entry("DRAFT")]);
  assert.equal(allReady.groups.length, 0);
  assert.equal(allReady.publishedBlockedCount, 0);
  assert.equal(readinessHeadline(allReady), "Every animal is ready");
});

test("line wording, singular and plural", () => {
  assert.equal(readinessHeadline({ animalCount: 12, readyCount: 4 }), "4 of 12 animals ready");
  assert.equal(readinessHeadline({ animalCount: 1, readyCount: 0 }), "0 of 1 animal ready");
  assert.equal(readyDraftsLine(0), "None ready but not published");
  assert.equal(readyDraftsLine(1), "1 ready but not published");
  assert.equal(readyDraftsLine(6), "6 ready but not published");
  assert.equal(publishedBlockedLine(0), "None published with something outstanding");
  assert.equal(publishedBlockedLine(2), "2 published with something outstanding");
  assert.equal(moreLine(3), "and 3 more");
  assert.equal(groupLine({ kind: "NO_PHOTO", title: "No photo", count: 7 }), "No photo · 7");
  assert.equal(groupCountNoun({ kind: "NO_PHOTO", title: "No photo", count: 7 }), "animals");
  assert.equal(groupCountNoun({ kind: "NO_PHOTO", title: "No photo", count: 1 }), "animal");
});

// The card's rule: every number is the one the board shows behind the line's
// link. Checked against the board itself, not against expected values, so a
// line counted any other way fails here.
test("every count equals what the board shows behind its link", () => {
  const readiness = [
    entry("DRAFT", [], "Ready draft"),
    entry("DRAFT", ["NO_PHOTO", "MISSING_ASSESSMENT"]),
    entry("DRAFT", ["ESCALATED_FINDING", "UNDER_CARE"]),
    entry("PUBLISHED"),
    entry("PUBLISHED", ["NO_PHOTO", "NOT_SPAYED_NEUTERED", "NO_PHOTO"]),
    entry("PUBLISHED", ["NEEDS_VET_REVIEW", "MISSING_ASSESSMENT"]),
    entry("PUBLISHED", ["UNSUPPORTED_CHARACTERISTIC", "NO_INTAKE_EXAM"]),
    entry("PENDING_ADOPTION", ["MISSING_ASSESSMENT"]),
    entry("PENDING_ADOPTION"),
  ];
  const summary = summariseReadiness(readiness);
  const board = (filters: Partial<ReadinessBoardFilters>) =>
    buildReadinessBoard(
      readiness,
      { species: [], locations: [], stages: [], kind: null, ...filters },
      NOW,
      1,
      SHELTER_TIMEZONE,
    );

  // "N of M animals ready" → /dashboard/readiness
  const all = board({});
  assert.equal(summary.animalCount, all.animalCount);
  assert.equal(summary.readyCount, all.animalCount - all.blockedCount);

  // "N published with something outstanding" → ?stage=PUBLISHED
  assert.equal(
    summary.publishedBlockedCount,
    board({ stages: ["PUBLISHED"] }).blockedCount,
  );

  // Ready drafts: the draft board's ready count, and exactly those named.
  const drafts = board({ stages: ["DRAFT"] });
  assert.equal(summary.readyDrafts.count, drafts.animalCount - drafts.blockedCount);
  assert.equal(summary.readyDrafts.named.length, summary.readyDrafts.count);

  // Each group → ?kind=<KIND>, whose page lists that many rows.
  assert.ok(summary.groups.length > 0);
  for (const group of summary.groups) {
    const detail = board({ kind: group.kind });
    assert.equal(detail.view, "detail");
    if (detail.view === "detail") {
      assert.equal(group.count, detail.totalRows, group.kind);
    }
  }
});
