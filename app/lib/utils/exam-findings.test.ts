import { test } from "node:test";
import assert from "node:assert/strict";
import { ExamFindingStatus } from "@/prisma/generated/enums";
import { EXAM_BODY_SYSTEM_KEYS } from "@/app/lib/constants/exam";
import { blankFindings, examFindingsIssue } from "./exam-findings";

const { NORMAL, ABNORMAL, NOT_EXAMINED } = ExamFindingStatus;

test("a blank exam has every body system, not examined and without a note", () => {
  const findings = blankFindings();
  assert.deepEqual(
    findings.map((finding) => finding.bodySystem),
    [...EXAM_BODY_SYSTEM_KEYS],
  );
  assert.equal(findings.length, 12);
  assert.ok(findings.every((finding) => finding.status === NOT_EXAMINED));
  assert.ok(findings.every((finding) => finding.notes === ""));
  // Fresh rows each time, so one form's edits don't reach another's.
  assert.notEqual(blankFindings()[0], blankFindings()[0]);
  assert.equal(examFindingsIssue(findings, EXAM_BODY_SYSTEM_KEYS), null);
});

test("one finding per system it is held to: an unknown, repeated or missing system is an issue", () => {
  const keys = ["EYES", "EARS", "HEART"];
  const row = (bodySystem: string, status: ExamFindingStatus = NORMAL) => ({
    bodySystem,
    status,
  });

  assert.equal(examFindingsIssue([row("EYES"), row("EARS"), row("HEART")], keys), null);
  assert.match(
    examFindingsIssue([row("EYES"), row("EARS"), row("HEART"), row("LUNGS")], keys)!,
    /doesn't look at/,
  );
  assert.equal(
    examFindingsIssue([row("EYES"), row("EARS"), row("HEART"), row("EARS")], keys),
    "Ears has more than one finding.",
  );
  assert.equal(
    examFindingsIssue([row("EARS")], keys),
    "A finding is needed for Eyes and Heart.",
  );
  assert.equal(
    examFindingsIssue([], ["NOSE_THROAT", "MOUTH_TEETH", "SKIN_COAT"]),
    "A finding is needed for Nose and throat, Mouth and teeth and Skin and coat.",
  );
});

test("an abnormal finding needs a note; other findings may have one", () => {
  const keys = ["EYES", "HEART"];
  assert.equal(
    examFindingsIssue(
      [
        { bodySystem: "EYES", status: NORMAL, notes: "Clear." },
        { bodySystem: "HEART", status: ABNORMAL, notes: "  " },
      ],
      keys,
    ),
    "Heart is abnormal: say what was found.",
  );
  assert.equal(
    examFindingsIssue(
      [
        { bodySystem: "EYES", status: NOT_EXAMINED, notes: null },
        { bodySystem: "HEART", status: ABNORMAL, notes: "Grade II/VI systolic murmur." },
      ],
      keys,
    ),
    null,
  );
});

test("a system no longer listed in code reads by its key", () => {
  assert.equal(
    examFindingsIssue([], ["RETIRED_SYSTEM"]),
    "A finding is needed for RETIRED_SYSTEM.",
  );
});
