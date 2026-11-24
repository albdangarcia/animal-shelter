import Link from "next/link";
import { IconAlertTriangle, IconCircleCheck } from "@tabler/icons-react";

import { Authorize } from "@/components/auth/authorize";
import StatusPage from "@/components/StatusPage";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { SearchParamsType } from "@/app/lib/types";
import { SacReportParamsSchema } from "@/app/lib/zod-schemas/report.schemas";
import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import { fetchSacReport } from "@/app/lib/data/reports/sac-report.data";
import {
  describeFosterWarning,
  describeReconciliation,
  describeTimelineBreak,
  describeTransferWarning,
  formatSacMonth,
  SAC_SECTIONS,
  sacMonthOptions,
  SHELTER_STATE_MISSING_WARNING,
  type SacAgeCounts,
  type SacReport,
  type SacTable,
} from "@/app/lib/utils/sac-report";
import { formatRangeLabel } from "@/app/lib/utils/report-date-utils";
import { SAC_SPECIES_CATEGORY_LABELS } from "@/app/lib/constants/sac-species";
import { ReportMonthPicker } from "@/components/dashboard/reports/report-month-picker";
import { ReportDownloadLink } from "@/components/dashboard/reports/report-download-link";
import { HelpLink } from "@/components/dashboard/help/help-link";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface Props {
  searchParams: SearchParamsType;
}

const Page = async ({ searchParams }: Props) => {
  return (
    <Authorize
      permission={AppPermissions.REPORTS_READ}
      fallback={<StatusPage type="accessDenied" />}
    >
      <PageContent searchParams={searchParams} />
    </Authorize>
  );
};

const PageContent = async ({ searchParams }: Props) => {
  const raw = await searchParams;
  // A mangled month falls back to last month; the fetcher resolves it.
  const parsed = SacReportParamsSchema.safeParse(raw);
  const month = parsed.success ? parsed.data.month : undefined;

  const [settings, today, report, help] = await Promise.all([
    getShelterSettings(),
    getShelterToday(),
    fetchSacReport(month),
    getHelpLinkGuide(PAGE_HELP_GUIDES.reportSac),
  ]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Breadcrumb className="print:hidden">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/reports">Reports</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Shelter Animals Count</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Shelter Animals Count
            </h1>
            <p className="text-muted-foreground text-sm">
              One month&apos;s intakes, outcomes and counts, laid out like
              Shelter Animals Count&apos;s monthly form.
            </p>
          </div>
          <div className="print:hidden">
            <HelpLink guide={help} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {formatSacMonth(report.month)}
          </span>
          <span className="text-muted-foreground text-xs">
            ·{" "}
            {formatRangeLabel({
              fromLabel: report.first,
              toLabel: report.last,
            })}{" "}
            · Times counted in {settings.timezone}
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto print:hidden">
            <ReportMonthPicker
              month={report.month}
              options={sacMonthOptions(today, report.month)}
            />
            <ReportDownloadLink report="sac" params={{ month: report.month }} />
          </div>
        </div>
      </div>

      <Warnings report={report} />

      {report.tables.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No species is counted for Shelter Animals Count. An admin can choose
          each species&apos; category in Settings, Animal taxonomy.
        </p>
      ) : (
        report.tables.map((table) => (
          <SacTableCard key={table.category} table={table} />
        ))
      )}
    </div>
  );
};

/** What to check before copying the numbers into SAC. */
function Warnings({ report }: { report: SacReport }) {
  const { shelterStateMissing, timelineBreaks, transfers, fosters } =
    report.warnings;
  const items = [
    ...timelineBreaks.map((w) => ({ ...w, text: describeTimelineBreak(w) })),
    ...transfers.map((w) => ({ ...w, text: describeTransferWarning(w) })),
    ...fosters.map((w) => ({ ...w, text: describeFosterWarning(w) })),
  ];
  if (!shelterStateMissing && items.length === 0) return null;
  return (
    <Alert>
      <IconAlertTriangle aria-hidden="true" />
      <AlertTitle>Check these before you submit</AlertTitle>
      <AlertDescription>
        <ul className="flex list-disc flex-col gap-1 pl-4">
          {shelterStateMissing && <li>{SHELTER_STATE_MISSING_WARNING}</li>}
          {items.map((item, i) => (
            <li key={i}>
              <Link
                href={`/dashboard/animals/${item.animalId}`}
                className="text-foreground font-medium underline-offset-4 hover:underline"
              >
                {item.animalName}
              </Link>{" "}
              ({SAC_SPECIES_CATEGORY_LABELS[item.category]}): {item.text}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

const AGE_HEADERS = ["Adult", "Up to 5 months", "Age unknown", "Total"];

function AgeCells({ counts }: { counts: SacAgeCounts }) {
  return (
    <>
      {[counts.adult, counts.young, counts.unknown, counts.total].map(
        (value, i) => (
          <TableCell key={i} className="text-right tabular-nums">
            {value}
          </TableCell>
        ),
      )}
    </>
  );
}

/** One SAC species category, row for row as on SAC's form. */
function SacTableCard({ table }: { table: SacTable }) {
  const balanced = table.difference === 0;
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{table.label}</CardTitle>
        <CardDescription
          className={cn(
            "flex items-center gap-1.5",
            !balanced && "text-destructive",
          )}
        >
          {balanced ? (
            <IconCircleCheck aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <IconAlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          )}
          {describeReconciliation(table)}
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-6 px-6 pb-6">
        <Table aria-label={`${table.label} intakes and outcomes`}>
          {SAC_SECTIONS.map((section) => (
            <TableBody key={section.key}>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead scope="col">{section.title}</TableHead>
                {AGE_HEADERS.map((header) => (
                  <TableHead key={header} scope="col" className="text-right">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
              {section.rows.map((row) => (
                <TableRow key={row.key}>
                  <TableHead scope="row" className="font-normal">
                    {row.label}
                  </TableHead>
                  <AgeCells counts={table.rows[row.key]} />
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableHead scope="row">{section.totalLabel}</TableHead>
                <AgeCells counts={table.totals[section.key]} />
              </TableRow>
            </TableBody>
          ))}
          <TableBody>
            <TableRow className="font-semibold">
              <TableHead scope="row">Total outcomes</TableHead>
              <AgeCells counts={table.totals.outcomes} />
            </TableRow>
          </TableBody>
        </Table>

        <Table aria-label={`${table.label} animal counts`}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Animal counts</TableHead>
              <TableHead scope="col" className="text-right">
                Total in care
              </TableHead>
              <TableHead scope="col" className="text-right">
                In foster care
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              [
                ["Beginning count", table.beginning],
                ["Ending count", table.ending],
              ] as const
            ).map(([label, count]) => (
              <TableRow key={label}>
                <TableHead scope="row" className="font-normal">
                  {label}
                </TableHead>
                <TableCell className="text-right tabular-nums">
                  {count.inCare}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {count.inFoster}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export default Page;
