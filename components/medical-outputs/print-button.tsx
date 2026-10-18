"use client";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()}>Print / Save as PDF</button>;
}
