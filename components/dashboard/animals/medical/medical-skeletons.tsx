import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
    <CardHeader>
      <CardTitle className="@[650px]/card:text-xl">Medical</CardTitle>
      <CardDescription>
        Vaccines, tests, treatments, surgeries, microchips and exams: what
        is due, and what this animal has been given.
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
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
    <CardHeader>
      <CardTitle className="@[650px]/card:text-xl">History</CardTitle>
      <CardDescription>
        Every entry, newest first by the day given or due, so care still to
        come is at the top. Voided entries stay here, struck through, with
        who voided them and why.
      </CardDescription>
      <div className="mt-4">
        <Skeleton className="h-8 w-24" />
      </div>
    </CardHeader>
    <CardContent>
      <EntryRowsSkeleton rows={4} />
    </CardContent>
    <CardFooter>
      <Skeleton className="h-8 w-64" />
    </CardFooter>
  </Card>
);

export const VaccinesAndTestsSkeleton = () => (
  <Card className="@container/card">
    <CardHeader>
      <CardTitle className="@[650px]/card:text-xl">Vaccines & Tests</CardTitle>
      <CardDescription>
        Each vaccine with its doses, latest first, and every test with its
        results. Voided entries are only in History.
      </CardDescription>
    </CardHeader>
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
