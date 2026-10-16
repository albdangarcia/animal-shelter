import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDICAL_DOCUMENT_MAX_BYTES } from "@/app/lib/constants/medical";
import {
  documentContentDisposition,
  documentDayIssue,
  documentFileIssue,
  documentNameFromFile,
  sniffDocumentType,
} from "./medical-document-file";
import { calendarDay } from "./shelter-day";

const day = calendarDay;
const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : part,
    ),
  );

const PDF = bytes("%PDF-1.7\n%âãÏÓ");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 16], "JFIF");
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBPVP8 ");
const heic = (brand: string) => bytes([0, 0, 0, 0x18], "ftyp", brand, [0, 0, 0, 0]);

test("sniffDocumentType reads each accepted type from its signature", () => {
  assert.equal(sniffDocumentType(PDF), "application/pdf");
  assert.equal(sniffDocumentType(PNG), "image/png");
  assert.equal(sniffDocumentType(JPEG), "image/jpeg");
  assert.equal(sniffDocumentType(WEBP), "image/webp");
});

test("sniffDocumentType reads HEIC and HEIF brands as heic", () => {
  for (const brand of ["heic", "heix", "hevc", "mif1", "msf1"]) {
    assert.equal(sniffDocumentType(heic(brand)), "heic", brand);
  }
  // Another ftyp brand (an AVIF image, an MP4 video) is neither.
  assert.equal(sniffDocumentType(heic("avif")), null);
  assert.equal(sniffDocumentType(heic("isom")), null);
  // A brand only counts inside an ftyp box.
  assert.equal(sniffDocumentType(bytes([0, 0, 0, 0x18], "free", "heic", [0, 0, 0, 0])), null);
});

test("sniffDocumentType refuses anything else, whatever it is named", () => {
  assert.equal(sniffDocumentType(bytes("Hello, this is plain text.")), null);
  assert.equal(sniffDocumentType(bytes("<html><body>")), null);
  assert.equal(sniffDocumentType(new Uint8Array()), null);
  // A RIFF file that isn't WebP (a WAV recording).
  assert.equal(sniffDocumentType(bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt ")), null);
  // Signatures cut short.
  assert.equal(sniffDocumentType(bytes("%PDF")), null);
  assert.equal(sniffDocumentType(PNG.slice(0, 7)), null);
  assert.equal(sniffDocumentType(bytes([0xff, 0xd8])), null);
  assert.equal(sniffDocumentType(bytes("RIFF", [0x24, 0, 0, 0], "WEB")), null);
  // A signature that isn't at the start doesn't count.
  assert.equal(sniffDocumentType(bytes(" %PDF-1.7")), null);
});

test("documentFileIssue goes by the bytes: a PDF named .png passes, a PNG named .pdf passes, text named .pdf doesn't", () => {
  // The route sniffs the bytes and never reads the name, so a file's
  // extension can't change the answer.
  const issueOf = (file: Uint8Array) =>
    documentFileIssue({ size: file.byteLength, sniffed: sniffDocumentType(file) });
  assert.equal(issueOf(PDF), null); // uploaded as "scan.png"
  assert.equal(issueOf(PNG), null); // uploaded as "scan.pdf"
  assert.equal(issueOf(bytes("Not a PDF at all.")), "Upload a PDF, JPEG, PNG or WebP file."); // "notes.pdf"
});

test("documentFileIssue: no file, too large, HEIC, unknown, accepted", () => {
  assert.equal(documentFileIssue({ size: 0, sniffed: null }), "Choose a file to upload.");
  assert.equal(
    documentFileIssue({ size: 0, sniffed: "application/pdf" }),
    "Choose a file to upload.",
  );
  assert.equal(
    documentFileIssue({ size: MEDICAL_DOCUMENT_MAX_BYTES, sniffed: "application/pdf" }),
    null,
  );
  assert.equal(
    documentFileIssue({ size: MEDICAL_DOCUMENT_MAX_BYTES + 1, sniffed: "application/pdf" }),
    "This file is larger than 4 MB.",
  );
  assert.equal(MEDICAL_DOCUMENT_MAX_BYTES, 4 * 1024 * 1024);
  assert.equal(
    documentFileIssue({ size: 2048, sniffed: "heic" }),
    "HEIC photos can't be shown in most browsers. Save it as a JPEG or a PDF and upload that.",
  );
  assert.equal(
    documentFileIssue({ size: 2048, sniffed: null }),
    "Upload a PDF, JPEG, PNG or WebP file.",
  );
  for (const sniffed of ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const) {
    assert.equal(documentFileIssue({ size: 1, sniffed }), null, sniffed);
  }
});

test("documentNameFromFile drops the extension and trims", () => {
  assert.equal(documentNameFromFile("Heartworm antigen panel.pdf"), "Heartworm antigen panel");
  assert.equal(documentNameFromFile("  discharge sheet .PNG "), "discharge sheet");
  assert.equal(documentNameFromFile("report.final.v2.pdf"), "report.final.v2");
  assert.equal(documentNameFromFile("no extension"), "no extension");
  assert.equal(documentNameFromFile("trailing dot."), "trailing dot");
});

test("documentNameFromFile reads \"Document\" when nothing is left", () => {
  assert.equal(documentNameFromFile(""), "Document");
  assert.equal(documentNameFromFile(".pdf"), "Document");
  assert.equal(documentNameFromFile("   .jpg"), "Document");
});

test("documentNameFromFile cuts to 200 characters, never through a character", () => {
  assert.equal(documentNameFromFile(`${"a".repeat(250)}.pdf`), "a".repeat(200));
  assert.equal(documentNameFromFile(`${"a".repeat(199)} b.pdf`), "a".repeat(199));
  // An emoji is two code units: one that would end past 200 is left out.
  const name = documentNameFromFile(`${"a".repeat(199)}🐶.pdf`);
  assert.equal(name, "a".repeat(199));
  assert.equal(documentNameFromFile(`${"a".repeat(198)}🐶.pdf`), `${"a".repeat(198)}🐶`);
});

test("documentDayIssue: from the birth day through today", () => {
  const birth = day("2024-03-03");
  const today = day("2026-10-16");
  assert.equal(documentDayIssue(day("2024-03-03"), birth, today), null);
  assert.equal(documentDayIssue(day("2026-10-16"), birth, today), null);
  assert.equal(
    documentDayIssue(day("2024-03-02"), birth, today),
    "The document date can't be before the animal's birth on Mar 3, 2024.",
  );
  assert.equal(
    documentDayIssue(day("2026-10-17"), birth, today),
    "The document date can't be in the future.",
  );
});

test("documentContentDisposition names the file after the document, with its type's extension", () => {
  assert.equal(
    documentContentDisposition("Heartworm antigen panel", "application/pdf", "inline"),
    "inline; filename*=UTF-8''Heartworm%20antigen%20panel.pdf",
  );
  assert.equal(
    documentContentDisposition("Radiograph", "image/jpeg", "attachment"),
    "attachment; filename*=UTF-8''Radiograph.jpg",
  );
  assert.equal(
    documentContentDisposition("x", "image/png", "inline"),
    "inline; filename*=UTF-8''x.png",
  );
  assert.equal(
    documentContentDisposition("x", "image/webp", "inline"),
    "inline; filename*=UTF-8''x.webp",
  );
});

test("documentContentDisposition encodes every character the header can't carry", () => {
  assert.equal(
    documentContentDisposition(`Ñoño's "scan" (1)*; a/b\r\nX: y`, "application/pdf", "inline"),
    "inline; filename*=UTF-8''%C3%91o%C3%B1o%27s%20%22scan%22%20%281%29%2A%3B%20a%2Fb%0D%0AX%3A%20y.pdf",
  );
});
