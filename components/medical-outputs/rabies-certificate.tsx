import type { RabiesCertificateOutput } from "@/app/lib/utils/medical-output";
import { MEDICAL_OUTPUT_COPY_TEXT, medicalOutputDayText as day, rabiesCertificateValidityText } from "@/app/lib/utils/medical-output";
import { MEDICAL_ROUTE_LABELS } from "@/app/lib/constants/medical";
import { OutputIdentity } from "./identity";
import { PrintButton } from "./print-button";
import styles from "./history.module.css";

export function RabiesCertificate({ output: o }: { output: RabiesCertificateOutput }) {
  const v = o.vaccination;
  const c = o.certificate;
  return <main className={`${styles.sheet} ${styles.certificate}`}>
    <nav aria-label="Print controls" className={styles.controls}>
      <PrintButton /><a href={`/dashboard/animals/${o.animal.id}/medical/vaccines-tests`}>Return to medical record</a>
    </nav>
    <header><h1>Rabies vaccination certificate — {o.animal.name}</h1>
      <OutputIdentity animal={o.animal} generatedDate={o.generatedDate} generatedTime={o.generatedTime} />
      <p className={styles.note}>{MEDICAL_OUTPUT_COPY_TEXT}</p>
    </header>
    <section aria-label="Recorded vaccination"><h2>Recorded vaccination</h2>
      <p><strong>{rabiesCertificateValidityText(c, o.generatedDate)}</strong></p>
      <dl><dt>Product</dt><dd>{v.product}</dd><dt>Manufacturer</dt><dd>{v.manufacturer ?? "Not recorded"}</dd>
        <dt>Lot</dt><dd>{v.lotNumber ?? "Not recorded"}</dd><dt>Lot expiry</dt><dd>{v.lotExpiryDate ? day(v.lotExpiryDate) : "Not recorded"}</dd>
        <dt>Route</dt><dd>{v.route ? MEDICAL_ROUTE_LABELS[v.route] : "Not recorded"}</dd><dt>Site</dt><dd>{v.site ?? "Not recorded"}</dd>
        <dt>Rabies tag</dt><dd>{v.rabiesTagNumber ?? "Not recorded"}</dd><dt>Administered day</dt><dd>{day(c.completedDate)}</dd>
        <dt>Duration</dt><dd>{v.durationMonths} months</dd><dt>Valid until</dt><dd>{day(c.validUntilDate)}</dd>
        <dt>Source</dt><dd>{v.provenance}</dd>
      </dl>
    </section>
    <section aria-label="Recorded veterinarian"><h2>Recorded veterinarian</h2>
      <dl><dt>Name</dt><dd>{c.veterinarianName}</dd><dt>License number</dt><dd>{c.veterinarianLicenseNumber}</dd></dl>
      <p className={styles.note}>Credentials are recorded facts. This printout does not verify a license or claim compliance with an official jurisdictional form.</p>
      <p className={styles.signature}>Veterinarian signature: <span aria-label="Blank signature line" /></p>
    </section>
  </main>;
}
