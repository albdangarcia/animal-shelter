import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode,
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
