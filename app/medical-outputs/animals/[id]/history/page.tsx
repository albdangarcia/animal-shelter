import type { Metadata } from "next";
import { fetchMedicalHistoryOutput } from "@/app/lib/data/animals/medical-output.data";
import { MedicalHistoryHandout } from "@/components/medical-outputs/history";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Medical history", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const output = await fetchMedicalHistoryOutput(id);
  return <MedicalHistoryHandout output={output} />;
}
