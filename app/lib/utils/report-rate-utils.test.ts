import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPercent, liveReleaseRate } from "./report-rate-utils";

test("the live release rate is live outcomes over all outcomes", () => {
  assert.equal(liveReleaseRate(86, 97), 86 / 97);
  assert.equal(formatPercent(liveReleaseRate(86, 97)), "88.7%");
});

test("with no outcomes the rate is undefined and shows as a dash, not 0%", () => {
  assert.equal(liveReleaseRate(0, 0), null);
  assert.equal(formatPercent(liveReleaseRate(0, 0)), "—");
});

test("outcomes that are all non-live give 0.0%, not a dash", () => {
  assert.equal(liveReleaseRate(0, 4), 0);
  assert.equal(formatPercent(liveReleaseRate(0, 4)), "0.0%");
});
