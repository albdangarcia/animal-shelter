import Link from "next/link";
import WelcomeImage from "../../components/public-pages/welcome-image";
import { fetchLatestPublicAnimals } from "../lib/data/public.data";
import { Suspense } from "react";
import PetCard from "@/components/public-pages/pets/pet-card";
import { auth } from "@/auth";
import LatestPetsSkeleton from "@/components/public-pages/latest-pets-skeleton";

const categories = ["Dog", "Cat", "Bird", "Reptile"];

const Page = () => {
  return (
    <>
      <WelcomeImage />

      <section aria-labelledby="featured-pets-heading" className="my-12">
        <h2
          id="featured-pets-heading"
          className="text-2xl font-semibold text-foreground text-center mb-8"
        >
          Friends Awaiting a Home
        </h2>

        <Suspense fallback={<LatestPetsSkeleton />}>
          <LatestPetsContent />
        </Suspense>

        <div className="text-center mt-20">
          <Link
            href="/pets?page=1"
            className="inline-block bg-primary text-primary-foreground font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all"
          >
            View All Our Animals
          </Link>
        </div>
      </section>

      <section aria-labelledby="categories-heading" className="my-12">
        <h2
          id="categories-heading"
          className="text-2xl font-semibold text-foreground text-center mb-8"
        >
          Browse by Category
        </h2>
        <div className="flex flex-wrap justify-center mt-2 gap-4 mb-5">
          {categories.map((category) => (
            <Link
              href={`pets?page=1&category=${category}`}
              key={category}
              className="flex items-center justify-center w-40 h-20 sm:w-48 sm:h-24 rounded-lg shadow-md bg-secondary hover:bg-secondary/80 transition-colors duration-200"
            >
              <h3 className="font-medium text-lg text-secondary-foreground">
                {category}
              </h3>
            </Link>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="how-to-help-heading"
        className="my-12 px-4 rounded-lg"
      >
        <h2
          id="how-to-help-heading"
          className="text-2xl font-semibold text-foreground mb-8 text-center"
        >
          How You Can Help
        </h2>
        <div className="grid md:grid-cols-3 gap-8 text-center max-w-4xl mx-auto">
          {/* Donate */}
          <div className="p-6 bg-muted rounded-lg border">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Donate
            </h3>
            <p className="text-muted-foreground mb-4">
              Your generosity helps us provide essential care, medical
              treatment, and find loving homes for animals.
            </p>
            <Link
              href="/donate"
              className="inline-block bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 px-5 rounded-md shadow transition-colors"
            >
              Give Today
            </Link>
          </div>
          {/* Volunteer */}
          <div className="p-6 bg-muted rounded-lg border">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Volunteer
            </h3>
            <p className="text-muted-foreground mb-4">
              Lend your time and skills to make a difference in the lives of our
              animals. Every hour helps!
            </p>
            <Link
              href="/volunteer"
              className="inline-block bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 px-5 rounded-md shadow transition-colors"
            >
              Join Our Team
            </Link>
          </div>
          {/* Foster */}
          <div className="p-6 bg-muted rounded-lg border">
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Foster
            </h3>
            <p className="text-muted-foreground mb-4">
              Open your home temporarily to an animal in need, providing them
              with a nurturing environment.
            </p>
            <Link
              href="/foster"
              className="inline-block bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 px-5 rounded-md shadow transition-colors"
            >
              Learn to Foster
            </Link>
          </div>
        </div>
      </section>
    </>
  );
};

const LatestPetsContent = async () => {
  const latestAnimals = await fetchLatestPublicAnimals();

  const session = await auth();
  const currentUserPersonId = session?.user?.personId;

  return (
    <div className="mt-6 flex flex-wrap justify-center gap-4 gap-y-14">
      {latestAnimals.map((animal) => (
        <div key={animal.id} className="w-44">
          <PetCard pet={animal} currentUserPersonId={currentUserPersonId} />
        </div>
      ))}
    </div>
  );
};

export default Page;