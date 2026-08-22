import {
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

const raw = (process.env.DEFAULT_PHONE_COUNTRY || "US").toUpperCase();
const DEFAULT_PHONE_COUNTRY = (
  isSupportedCountry(raw) ? raw : "US"
) as CountryCode;

export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  if (!input?.trim()) {
    return null;
  }

  try {
    const parsed = parsePhoneNumberFromString(input, defaultCountry);
    return parsed?.isPossible() ? parsed.number : null;
  } catch {
    return null;
  }
}

export function normalizePhoneQuery(input: string): string {
  return input.replace(/\D/g, "");
}
