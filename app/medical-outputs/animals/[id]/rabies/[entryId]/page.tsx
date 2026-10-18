import type { Metadata } from "next";
import { fetchRabiesCertificateOutput } from "@/app/lib/data/animals/medical-output.data";
import { RabiesCertificate } from "@/components/medical-outputs/rabies-certificate";
import styles from "@/components/medical-outputs/history.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rabies certificate", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const { result, canCorrect } = await fetchRabiesCertificateOutput(id, entryId);
  if (result.available) return <RabiesCertificate output={result.output} />;
  const record = `/dashboard/animals/${id}/medical/vaccines-tests`;
  return <main className={styles.sheet}>
    <h1>Rabies certificate unavailable</h1><p>{result.message}</p>
    {canCorrect && <p><a className="underline" href={`${record}#medical-entry-${entryId}`}>Correct this vaccination record</a> using its Actions → Edit menu.</p>}
    <p><a className="underline" href={record}>Return to medical record</a></p>
  </main>;
}
