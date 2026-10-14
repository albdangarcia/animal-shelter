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
        is due, and what this animal has been given. Its conditions and
        care episodes are on Conditions.
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
        Every entry, condition and care episode, newest first by the day
        given or due, the onset or the start, so care still to come is at the
        top. Voided ones stay here, struck through, with who voided them and
        why.
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

export const MedicalConditionsSkeleton = () => (
  <div className="flex flex-col gap-4">
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Problem list</CardTitle>
        <CardDescription>
          Allergies, then the conditions the animal lives with, then those
          resolved. Voided rows stay here, struck through, with who voided
          them and why.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EntryRowsSkeleton rows={2} />
      </CardContent>
    </Card>
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Care episodes</CardTitle>
        <CardDescription>
          When the animal was under vet care or hospitalised, here or at a
          clinic. The open episode comes first.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EntryRowsSkeleton rows={1} />
      </CardContent>
    </Card>
  </div>
);
