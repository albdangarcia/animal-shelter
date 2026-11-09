import Link from "next/link";
import type { findWaitingVetVisitReports } from "@/app/lib/data/vet-visit-reports";
import { vetReportHref } from "@/app/lib/utils/vet-visit-report";
import { formatShelterDayOrNA } from "@/app/lib/utils/shelter-day";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WaitingVetReports({ groups }: { groups: Awaited<ReturnType<typeof findWaitingVetVisitReports>> }) {
  return <Card role="region" aria-label="Foster reports" className="min-w-0 break-words">
    <CardHeader><CardTitle>Foster reports</CardTitle></CardHeader>
    <CardContent className="space-y-4">{groups.length ? groups.map((group) => <section key={group.fosterId} aria-label={group.fosterName}>
      <h2 className="mb-2 font-medium">{group.fosterName}</h2>
      <ul className="space-y-3">{group.reports.map((report) => <li key={report.id}>
        <Link href={vetReportHref(report.animal.id, report.id)} className="font-medium underline">{report.animal.name} · Visit on {formatShelterDayOrNA(report.visitDate)}</Link>
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{report.summary}</p>
      </li>)}</ul>
    </section>) : <p className="text-sm text-muted-foreground">No foster reports waiting for review.</p>}</CardContent>
  </Card>;
}
