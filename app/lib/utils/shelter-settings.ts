import { isSupportedCountry, type CountryCode } from "libphonenumber-js";
import { DOSE_SLOT_LABELS, DOSE_SLOT_ORDER } from "@/app/lib/constants/medical";
import type { DoseSlotEnds } from "@/app/lib/utils/medication-slots";
import { US_STATES } from "@/app/lib/constants/us-states";

export type WeightUnitSystem = "metric" | "imperial";

export type ShelterSettings = {
  timezone: string;
  weightUnitSystem: WeightUnitSystem;
  defaultPhoneCountry: CountryCode;
  /** When each medication dose slot's window ends, as "HH:mm". */
  doseSlotEnds: DoseSlotEnds;
  /**
   * The US state the shelter is in, as a code, or null until an admin sets
   * it. Transfers are in or out of state against it.
   */
  state: string | null;
};

/** The dose times a shelter starts with, and falls back to. */
export const DEFAULT_DOSE_SLOT_ENDS: Readonly<DoseSlotEnds> = {
  AM: "10:00",
  MIDDAY: "14:00",
  PM: "20:00",
};

/** A time of day on a 24-hour clock, "00:00" to "23:59". */
export const DOSE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The message for a dose time that isn't a time of day. */
export const DOSE_TIME_FORMAT_MESSAGE = "Enter a time of day, such as 10:00.";

/**
 * Why `ends` can't be the dose times, keyed to the slot it is about, or null
 * when they can: each a time of day, and the AM window ending before
 * Midday's and Midday's before PM's, so no window crosses midnight or
 * swallows another. "HH:mm" compares as a string.
 */
export const doseSlotEndsIssue = (
  ends: DoseSlotEnds,
): { slot: keyof DoseSlotEnds; message: string } | null => {
  for (const slot of DOSE_SLOT_ORDER) {
    if (!DOSE_TIME_PATTERN.test(ends[slot])) {
      return { slot, message: DOSE_TIME_FORMAT_MESSAGE };
    }
  }
  if (ends.MIDDAY <= ends.AM) {
    return {
      slot: "MIDDAY",
      message: `${DOSE_SLOT_LABELS.MIDDAY} doses must end after ${DOSE_SLOT_LABELS.AM} doses.`,
    };
  }
  if (ends.PM <= ends.MIDDAY) {
    return {
      slot: "PM",
      message: `${DOSE_SLOT_LABELS.PM} doses must end after ${DOSE_SLOT_LABELS.MIDDAY} doses.`,
    };
  }
  return null;
};

const validTimezone = (
  value: string | undefined,
  fallback = "America/New_York",
): string => {
  if (value) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return value;
    } catch {
      // An invalid setting should not prevent a cold database from starting.
    }
  }
  return fallback;
};

/** The message for a shelter state that isn't one of the 50 US state codes. */
export const SHELTER_STATE_MESSAGE = "Select the state the shelter is in.";

/** Whether `value` is one of the 50 US state codes. */
export const isUsStateCode = (value: string): boolean =>
  US_STATES.some((state) => state.code === value);

const validCountry = (
  value: string | undefined,
  fallback: CountryCode = "US",
): CountryCode => {
  const country = value?.trim().toUpperCase();
  return country && isSupportedCountry(country) ? country : fallback;
};

export const fallbackShelterSettings = (): ShelterSettings => ({
  timezone: validTimezone(process.env.SHELTER_TIMEZONE),
  weightUnitSystem:
    process.env.WEIGHT_UNIT_SYSTEM === "imperial" ? "imperial" : "metric",
  defaultPhoneCountry: validCountry(process.env.DEFAULT_PHONE_COUNTRY),
  doseSlotEnds: { ...DEFAULT_DOSE_SLOT_ENDS },
  state: null,
});

/**
 * The stored dose times, when all three are valid and in order. Otherwise
 * all three defaults: one bad value would leave the others' windows
 * meaningless.
 */
const validDoseSlotEnds = (row: {
  amDoseEndTime?: string | null;
  middayDoseEndTime?: string | null;
  pmDoseEndTime?: string | null;
}): DoseSlotEnds => {
  const ends = {
    AM: row.amDoseEndTime ?? "",
    MIDDAY: row.middayDoseEndTime ?? "",
    PM: row.pmDoseEndTime ?? "",
  };
  return doseSlotEndsIssue(ends) ? { ...DEFAULT_DOSE_SLOT_ENDS } : ends;
};

/**
 * The settings row's columns for `settings`, to create the row from: the
 * dose times are three columns, not one.
 */
export const shelterSettingsColumns = (settings: ShelterSettings) => ({
  timezone: settings.timezone,
  weightUnitSystem: settings.weightUnitSystem,
  defaultPhoneCountry: settings.defaultPhoneCountry,
  amDoseEndTime: settings.doseSlotEnds.AM,
  middayDoseEndTime: settings.doseSlotEnds.MIDDAY,
  pmDoseEndTime: settings.doseSlotEnds.PM,
  state: settings.state,
});

export const resolveShelterSettings = (
  row: {
    timezone: string;
    weightUnitSystem: string;
    defaultPhoneCountry: string;
    // Left out by readers that select only the columns they need.
    amDoseEndTime?: string | null;
    middayDoseEndTime?: string | null;
    pmDoseEndTime?: string | null;
    state?: string | null;
  } | null,
): ShelterSettings => {
  const fallback = fallbackShelterSettings();
  if (!row) return fallback;
  return {
    timezone: validTimezone(row.timezone, fallback.timezone),
    weightUnitSystem:
      row.weightUnitSystem === "imperial" || row.weightUnitSystem === "metric"
        ? row.weightUnitSystem
        : fallback.weightUnitSystem,
    defaultPhoneCountry: validCountry(
      row.defaultPhoneCountry,
      fallback.defaultPhoneCountry,
    ),
    doseSlotEnds: validDoseSlotEnds(row),
    // Anything but a state code reads as not set, as no state does.
    state: row.state && isUsStateCode(row.state) ? row.state : null,
  };
};
