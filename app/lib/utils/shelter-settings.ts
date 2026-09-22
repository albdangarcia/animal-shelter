import { isSupportedCountry, type CountryCode } from "libphonenumber-js";

export type WeightUnitSystem = "metric" | "imperial";

export type ShelterSettings = {
  timezone: string;
  weightUnitSystem: WeightUnitSystem;
  defaultPhoneCountry: CountryCode;
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
});

export const resolveShelterSettings = (
  row: {
    timezone: string;
    weightUnitSystem: string;
    defaultPhoneCountry: string;
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
  };
};
