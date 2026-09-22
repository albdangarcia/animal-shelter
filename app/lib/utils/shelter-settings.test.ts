import { test } from "node:test";
import assert from "node:assert/strict";
import { shelterDayKey } from "./shelter-day";
import { resolveReportRange } from "./report-date-utils";
import { formatWeight, weightUnits } from "./weight-format";
import { normalizePhone } from "./phone";
import { fallbackShelterSettings, resolveShelterSettings } from "./shelter-settings";

test("a missing settings row uses the configured fallback", () => {
  assert.deepEqual(resolveShelterSettings(null), fallbackShelterSettings());
});

test("settings from the database control all three organization values", () => {
  const settings = resolveShelterSettings({
    timezone: "Pacific/Auckland",
    weightUnitSystem: "imperial",
    defaultPhoneCountry: "GB",
  });
  assert.deepEqual(settings, {
    timezone: "Pacific/Auckland",
    weightUnitSystem: "imperial",
    defaultPhoneCountry: "GB",
  });

  const instant = new Date("2026-09-18T23:30:00Z");
  assert.equal(shelterDayKey(instant, settings.timezone), "2026-09-19");
  assert.equal(shelterDayKey(instant, "America/New_York"), "2026-09-18");
  assert.equal(resolveReportRange(undefined, undefined, shelterDayKey(instant, settings.timezone)).toLabel, "2026-09-19");
  assert.equal(resolveReportRange(undefined, undefined, shelterDayKey(instant, "America/New_York")).toLabel, "2026-09-18");
  assert.deepEqual(weightUnits(settings.weightUnitSystem), ["oz", "lb"]);
  assert.equal(formatWeight(1000, settings.weightUnitSystem), "2.2 lb");
  assert.equal(normalizePhone("020 7946 0958", settings.defaultPhoneCountry), "+442079460958");
});

test("an empty stored phone country uses the environment fallback", () => {
  const previous = process.env.DEFAULT_PHONE_COUNTRY;
  process.env.DEFAULT_PHONE_COUNTRY = "GB";
  try {
    assert.equal(
      resolveShelterSettings({
        timezone: "America/New_York",
        weightUnitSystem: "metric",
        defaultPhoneCountry: "",
      }).defaultPhoneCountry,
      "GB",
    );
  } finally {
    if (previous === undefined) delete process.env.DEFAULT_PHONE_COUNTRY;
    else process.env.DEFAULT_PHONE_COUNTRY = previous;
  }
});

test("invalid stored values fall back to the environment setting or default", () => {
  const fallback = fallbackShelterSettings();
  assert.deepEqual(
    resolveShelterSettings({
      timezone: "not/a-timezone",
      weightUnitSystem: "unknown",
      defaultPhoneCountry: "ZZ",
    }),
    fallback,
  );
});
