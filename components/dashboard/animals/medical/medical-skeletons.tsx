import { DocumentTypeFilter } from "./document-type-filter";
import { VitalsToolbar } from "../vitals/vitals-toolbar";
import { PlusCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MedicalRecordHeader } from "./medical-record-header";
import {
  Card,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Use the real button geometry so the toolbar wraps at the same width while loading.
const PrintHistorySkeleton = () => (
  <Skeleton className="flex shrink-0">
    <Button variant="ghost" size="sm" className="invisible" disabled>
      <Printer />
      Print adopter medical history
    </Button>
  </Skeleton>
);

// The loading states of the Medical pages, shaped like the pages.

export const EntryRowsSkeleton = ({ rows = 3 }: { rows?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }, (_, row) => (
      <div key={row} className="border rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-md" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="mt-2 h-3 w-48" />
        <div className="mt-3 flex gap-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    ))}
  </div>
);

export const MedicalOverviewSkeleton = () => (
  <Card className="@container/card">
    <MedicalRecordHeader section="overview" loading />
    <CardContent className="space-y-6">
      <div className="flex flex-wrap items-center">
        <PrintHistorySkeleton />
      </div>
      <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
        {/* Rabies, spay/neuter, microchip, last exam and current weight. */}
        {[0, 1, 2, 3, 4].map((cell) => (
          <div key={cell} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
      <Skeleton className="h-5 w-12" />
      <EntryRowsSkeleton rows={1} />
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <EntryRowsSkeleton />
    </CardContent>
  </Card>
);

export const MedicalHistorySkeleton = () => (
  <Card className="@container/card">
    <MedicalRecordHeader section="history" loading />
    <CardContent className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Skeleton className="flex shrink-0">
          <Button variant="outline" size="sm" className="invisible" disabled>
            <PlusCircle className="mr-2 size-4" />
            Kind
          </Button>
        </Skeleton>
        <PrintHistorySkeleton />
      </div>
      <EntryRowsSkeleton rows={4} />
    </CardContent>
    <CardFooter>
      <Skeleton className="h-8 w-64" />
    </CardFooter>
  </Card>
);

export const VaccinesAndTestsSkeleton = () => (
  <Card className="@container/card">
    <MedicalRecordHeader section="vaccines-tests" loading />
    <CardContent className="space-y-6">
      {["Vaccines", "Tests"].map((heading) => (
        <div key={heading} className="space-y-3">
          <h3 className="font-medium">{heading}</h3>
          <EntryRowsSkeleton rows={2} />
        </div>
      ))}
    </CardContent>
  </Card>
);

export const MedicalConditionsSkeleton = () => (
  <div className="flex flex-col gap-4">
    <Card className="@container/card">
      <MedicalRecordHeader section="conditions" loading />
      <CardContent>
        <EntryRowsSkeleton rows={2} />
      </CardContent>
    </Card>
    <Card className="@container/card">
      <MedicalRecordHeader section="care-episodes" loading />
      <CardContent>
        <EntryRowsSkeleton rows={1} />
      </CardContent>
    </Card>
  </div>
);

export const MedicationsSkeleton = () => (
  <div className="flex flex-col gap-4">
    <Card className="@container/card">
      <MedicalRecordHeader section="current-orders" loading />
      <CardContent>
        <EntryRowsSkeleton rows={1} />
      </CardContent>
    </Card>
    <Card className="@container/card">
      <MedicalRecordHeader section="dose-sheet" loading />
      <CardContent className="space-y-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="grid grid-cols-3 gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ))}
      </CardContent>
    </Card>
    <Card className="@container/card">
      <MedicalRecordHeader section="past-orders" loading />
      <CardContent>
        <EntryRowsSkeleton rows={1} />
      </CardContent>
    </Card>
  </div>
);

export const MedicalDocumentsSkeleton = () => (
  <Card className="@container/card">
    <MedicalRecordHeader section="documents" loading />
    <CardContent className="space-y-6">
      <DocumentTypeFilter />
      <EntryRowsSkeleton rows={2} />
    </CardContent>
  </Card>
);

export const MedicalVitalsSkeleton = () => (
  <Card className="@container/card">
    <MedicalRecordHeader section="vitals" loading />
    <CardContent className="space-y-6">
      <VitalsToolbar />
      <EntryRowsSkeleton rows={4} />
    </CardContent>
    <CardFooter><Skeleton className="h-8 w-64" /></CardFooter>
  </Card>
);
