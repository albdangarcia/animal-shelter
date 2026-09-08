// Allowed mime types for image uploads
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Maximum file size for image uploads (5MB)
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const PET_PHOTO_COMING_SOON_IMAGE = "/images/pet-photo-coming-soon.webp";

/**
 * The single IANA timezone the shelter operates in. All reporting date-range
 * boundaries are computed in this zone so that every viewer sees identical
 * numbers regardless of their own browser/OS timezone. Configurable via the
 * `SHELTER_TIMEZONE` env var, with a sensible fallback.
 */
export const SHELTER_TIMEZONE =
  process.env.SHELTER_TIMEZONE || "America/New_York";

/**
 * Whether the shelter displays weight in metric (kg/g) or imperial (lb/oz).
 * A single org-wide setting, not per-user — configurable via the
 * `WEIGHT_UNIT_SYSTEM` env var, with a sensible fallback. See
 * app/lib/utils/weight-format.ts for where this is consumed.
 */
export const WEIGHT_UNIT_SYSTEM: "metric" | "imperial" =
  process.env.WEIGHT_UNIT_SYSTEM === "imperial" ? "imperial" : "metric";
