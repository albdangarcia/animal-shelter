import { test } from "node:test";
import assert from "node:assert/strict";
import { shelterDayKey } from "./shelter-day";
import { resolveReportRange } from "./report-date-utils";
import { formatWeight, weightUnits } from "./weight-format";
import { normalizePhone } from "./phone";
import {
  DEFAULT_DOSE_SLOT_ENDS,
  doseSlotEndsIssue,
  fallbackShelterSettings,
  resolveShelterSettings,
  shelterSettingsColumns,
} from "./shelter-settings";

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
    doseSlotEnds: DEFAULT_DOSE_SLOT_ENDS,
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

test("the dose times default to 10:00, 14:00 and 20:00, with no row or no columns", () => {
  assert.deepEqual(DEFAULT_DOSE_SLOT_ENDS, { AM: "10:00", MIDDAY: "14:00", PM: "20:00" });
  assert.deepEqual(resolveShelterSettings(null).doseSlotEnds, DEFAULT_DOSE_SLOT_ENDS);
  assert.deepEqual(fallbackShelterSettings().doseSlotEnds, DEFAULT_DOSE_SLOT_ENDS);
  // A reader that selects only the phone columns still gets them.
  assert.deepEqual(
    resolveShelterSettings({
      timezone: "America/New_York",
      weightUnitSystem: "metric",
      defaultPhoneCountry: "US",
    }).doseSlotEnds,
    DEFAULT_DOSE_SLOT_ENDS,
  );
});

test("stored dose times are used when all three are times in order", () => {
  const row = {
    timezone: "America/New_York",
    weightUnitSystem: "metric",
    defaultPhoneCountry: "US",
    amDoseEndTime: "09:30",
    middayDoseEndTime: "13:00",
    pmDoseEndTime: "21:45",
  };
  assert.deepEqual(resolveShelterSettings(row).doseSlotEnds, {
    AM: "09:30",
    MIDDAY: "13:00",
    PM: "21:45",
  });
  // One bad value, or one out of order, and all three fall back.
  for (const bad of [
    { amDoseEndTime: "9:30" },
    { middayDoseEndTime: "24:00" },
    { pmDoseEndTime: "" },
    { pmDoseEndTime: null },
    { middayDoseEndTime: "09:30" },
    { pmDoseEndTime: "12:00" },
  ]) {
    assert.deepEqual(
      resolveShelterSettings({ ...row, ...bad }).doseSlotEnds,
      DEFAULT_DOSE_SLOT_ENDS,
      JSON.stringify(bad),
    );
  }
});

test("dose times must each be a time of day, AM before Midday before PM", () => {
  const ok = { AM: "10:00", MIDDAY: "14:00", PM: "20:00" };
  assert.equal(doseSlotEndsIssue(ok), null);
  assert.equal(doseSlotEndsIssue({ AM: "00:00", MIDDAY: "00:01", PM: "23:59" }), null);
  for (const [slot, value] of [
    ["AM", "10"],
    ["AM", "1:00"],
    ["MIDDAY", "24:00"],
    ["MIDDAY", "12:60"],
    ["PM", ""],
    ["PM", "8 PM"],
  ] as const) {
    assert.deepEqual(doseSlotEndsIssue({ ...ok, [slot]: value }), {
      slot,
      message: "Enter a time of day, such as 10:00.",
    });
  }
  assert.deepEqual(doseSlotEndsIssue({ ...ok, MIDDAY: "10:00" }), {
    slot: "MIDDAY",
    message: "Midday doses must end after AM doses.",
  });
  assert.deepEqual(doseSlotEndsIssue({ ...ok, PM: "13:59" }), {
    slot: "PM",
    message: "PM doses must end after Midday doses.",
  });
});

test("the settings row's columns hold the dose times one to a column", () => {
  const settings = resolveShelterSettings({
    timezone: "Pacific/Auckland",
    weightUnitSystem: "imperial",
    defaultPhoneCountry: "GB",
    amDoseEndTime: "09:00",
    middayDoseEndTime: "13:00",
    pmDoseEndTime: "19:00",
  });
  assert.deepEqual(shelterSettingsColumns(settings), {
    timezone: "Pacific/Auckland",
    weightUnitSystem: "imperial",
    defaultPhoneCountry: "GB",
    amDoseEndTime: "09:00",
    middayDoseEndTime: "13:00",
    pmDoseEndTime: "19:00",
  });
});
