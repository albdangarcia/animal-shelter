// Microchip numbers as the shelter stores and looks them up. A number is read
// off a scanner or a certificate, often with spaces or hyphens between
// groups of digits, so it is stored without them and in upper case: one chip
// then has one stored form, whatever way it was typed.
//
// ISO chips carry 15 digits. Older chips carry 9 or 10 characters, some with
// letters. So a number is 9 to 15 letters or digits.

export const CHIP_NUMBER_MIN_LENGTH = 9;
export const CHIP_NUMBER_MAX_LENGTH = 15;

/** The stored form of a chip number: no spaces or hyphens, upper case. */
export const normaliseChipNumber = (raw: string): string =>
  raw.replace(/[\s-]+/g, "").toUpperCase();

/**
 * What is wrong with a chip number already normalised, or null when it can
 * be stored.
 */
export const chipNumberIssue = (normalised: string): string | null => {
  if (normalised === "") {
    return "The chip number is required.";
  }
  if (
    normalised.length < CHIP_NUMBER_MIN_LENGTH ||
    normalised.length > CHIP_NUMBER_MAX_LENGTH
  ) {
    return `A chip number is ${CHIP_NUMBER_MIN_LENGTH} to ${CHIP_NUMBER_MAX_LENGTH} letters or digits.`;
  }
  if (!/^[A-Z0-9]+$/.test(normalised)) {
    return "A chip number has only letters and digits.";
  }
  return null;
};
