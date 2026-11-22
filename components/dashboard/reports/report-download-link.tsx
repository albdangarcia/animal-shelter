import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  reportCsvHref,
  type ReportExport,
  type ReportLinkParams,
} from "@/app/lib/utils/report-href";

/**
 * "Download CSV" beside a report's filters: a plain link to the report's file
 * for the period and species in the page's URL. The page re-renders when a
 * filter changes, so the link always carries what the page shows. No client
 * JS, and left out of a printout.
 */
export function ReportDownloadLink({
  report,
  params,
}: {
  report: ReportExport;
  params: ReportLinkParams;
}) {
  return (
    <Button asChild variant="outline" size="sm" className="h-8">
      <a href={reportCsvHref(report, params)} download>
        <Download aria-hidden="true" className="mr-2 h-4 w-4" />
        Download CSV
      </a>
    </Button>
  );
}
