import { Suspense } from 'react';
import { CardsSkeleton, LatestPetsSkeleton } from '@/app/ui/skeletons';
import CardWrapper from '@/app/ui/dashboard/cards';
import LatestPets from '@/app/ui/dashboard/latest-pets';
import { opensans } from '@/app/ui/fonts';

export default async function Page() {
  return (
    <main>
      {/* title */}
      <h1 className={`${opensans.className} mb-4 text-xl md:text-2xl font-normal`}>
        Dashboard
      </h1>

      {/* Information Cards */}
      <div className="grid gap-6 grid-cols-2 lg:grid-cols-4">
        <Suspense fallback={<CardsSkeleton />}>
          <CardWrapper />
        </Suspense>
      </div>

      {/* Latest Pets */}
      <div className="mt-6">
        <Suspense fallback={<LatestPetsSkeleton />}>
          <LatestPets />
        </Suspense>
      </div>

    </main>
  );
}
