import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyLocationsState, parseLocationStatus } from "./location-status";

test("no status, or active alone, shows the live locations", () => {
  assert.equal(parseLocationStatus(undefined), "active");
  assert.equal(parseLocationStatus(""), "active");
  assert.equal(parseLocationStatus("active"), "active");
});

test("deleted alone shows the deleted locations", () => {
  assert.equal(parseLocationStatus("deleted"), "deleted");
});

test("both statuses show every location", () => {
  assert.equal(parseLocationStatus("active,deleted"), "all");
  assert.equal(parseLocationStatus("deleted,active"), "all");
});

test("an empty Deleted view says nothing is deleted and offers no Add Location", () => {
  assert.deepEqual(emptyLocationsState(parseLocationStatus("deleted")), {
    message: "There are no deleted locations.",
    offerAdd: false,
  });
});

test("an empty view of live locations, or of every location, offers Add Location", () => {
  for (const status of [undefined, "active", "active,deleted"]) {
    assert.deepEqual(
      emptyLocationsState(parseLocationStatus(status)),
      { message: "No locations have been created yet.", offerAdd: true },
      String(status),
    );
  }
});
