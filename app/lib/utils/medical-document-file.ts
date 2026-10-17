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

// The extension a served file's name takes, by its content type.
const EXTENSIONS: Record<MedicalDocumentContentType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * The `Content-Disposition` a document's file is served with: shown in the
 * browser (`inline`) or saved (`attachment`), named after the document with
 * the extension its type takes ("Heartworm antigen panel.pdf"). The name is
 * sent percent-encoded as UTF-8 (`filename*`), so any character a person
 * typed reaches the browser as typed and none can break out of the header.
 */
export function documentContentDisposition(
  name: string,
  contentType: string,
  disposition: "inline" | "attachment",
): string {
  const extension = EXTENSIONS[contentType as MedicalDocumentContentType];
  const fileName = extension ? `${name}.${extension}` : name;
  // `encodeURIComponent` leaves ' ( ) * as they are; the header's encoding
  // allows none of them.
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename*=UTF-8''${encoded}`;
}

// What each content type is called on a page.
const FORMAT_LABELS: Record<MedicalDocumentContentType, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

/** "PDF", "JPEG", "PNG" or "WebP"; a type the shelter doesn't keep reads as
 * it is stored. */
export const documentFormatLabel = (contentType: string): string =>
  FORMAT_LABELS[contentType as MedicalDocumentContentType] ?? contentType;

/**
 * A file's size as a page shows it: "512 bytes", "820 KB", "1.2 MB". A
 * kilobyte is 1,024 bytes, as the 4 MB limit counts them; kilobytes are
 * whole, megabytes to one decimal place.
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const kilobytes = bytes / 1024;
  if (Math.round(kilobytes) < 1024) return `${Math.round(kilobytes)} KB`;
  return `${(kilobytes / 1024).toFixed(1).replace(/\.0$/, "")} MB`;
};

/** Where a document's file is served from, to whoever may see it. */
export const documentFileHref = (documentId: string) => `/api/medical-documents/${documentId}`;
