// What a medical document's file may be, and the rules for its name and day.
// Pure: no Prisma, no clock and no disk, so the unit tests can pin every
// branch, and the upload route, the service and the form share them.
//
// A document is a record, kept exactly as sent, so the shelter accepts only
// what every browser can show inline: PDF, JPEG, PNG and WebP. The type is
// read from the file's first bytes, never from its name or what the browser
// claims, since either can say anything.

import {
  MEDICAL_DOCUMENT_MAX_BYTES,
  MEDICAL_DOCUMENT_NAME_MAX_LENGTH,
} from "@/app/lib/constants/medical";
import { beforeBirthIssue, futureDayIssue } from "@/app/lib/utils/medical-days";
import type { CalendarDay } from "@/app/lib/utils/shelter-day";

/** The content types a medical document can have. */
export const MEDICAL_DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type MedicalDocumentContentType = (typeof MEDICAL_DOCUMENT_CONTENT_TYPES)[number];

/** How many of a file's first bytes `sniffDocumentType` needs. */
export const DOCUMENT_SNIFF_BYTES = 12;

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const PDF = ascii("%PDF-");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = ascii("RIFF");
const WEBP = ascii("WEBP");
const FTYP = ascii("ftyp");
// The brands an HEIC or HEIF photo (an iPhone's default) declares.
const HEIC_BRANDS = ["heic", "heix", "hevc", "mif1", "msf1"].map(ascii);

/**
 * The type a file's first bytes say it is: a content type the shelter
 * accepts, `"heic"` for an iPhone photo (refused with its own advice), or
 * null for anything else.
 */
export function sniffDocumentType(
  bytes: Uint8Array,
): MedicalDocumentContentType | "heic" | null {
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp";
  if (startsWith(bytes, FTYP, 4) && HEIC_BRANDS.some((brand) => startsWith(bytes, brand, 8))) {
    return "heic";
  }
  return null;
}

/**
 * Why a file can't be a medical document, or null when it can: `size` in
 * bytes (0 when no file was chosen), `sniffed` what its first bytes say.
 */
export function documentFileIssue({
  size,
  sniffed,
}: {
  size: number;
  sniffed: MedicalDocumentContentType | "heic" | null;
}): string | null {
  if (size <= 0) return "Choose a file to upload.";
  if (size > MEDICAL_DOCUMENT_MAX_BYTES) return "This file is larger than 4 MB.";
  if (sniffed === "heic") {
    return "HEIC photos can't be shown in most browsers. Save it as a JPEG or a PDF and upload that.";
  }
  if (sniffed === null) return "Upload a PDF, JPEG, PNG or WebP file.";
  return null;
}

/**
 * The name a document starts with, from the uploaded file's name: without its
 * extension, trimmed, at most the longest name a document can carry (never
 * cutting a character in two), and "Document" when nothing is left.
 */
export function documentNameFromFile(fileName: string): string {
  const stem = fileName.trim().replace(/\.[^.]*$/, "").trim();
  let name = "";
  for (const char of stem) {
    if (name.length + char.length > MEDICAL_DOCUMENT_NAME_MAX_LENGTH) break;
    name += char;
  }
  return name.trim() || "Document";
}

/**
 * Why `day` can't be the day on a document, or null when it can: the day the
 * paper was written is neither before the animal was born nor after today.
 */
export const documentDayIssue = (
  day: CalendarDay,
  birthDate: CalendarDay,
  today: CalendarDay,
): string | null =>
  futureDayIssue(day, today, "The document date") ??
  beforeBirthIssue(day, birthDate, "The document date");
