import { fetchFrontPagePetById } from "@/app/lib/data/pets/public";
import { PetGallery } from "@/app/ui/publicpages/pet-gallery";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function Page({ params }: { params: { id: string } }) {
  // get id from the url
  const id = params.id;

  // get pet from database
  const pet = await fetchFrontPagePetById(id);

  // if the pet is not found then return not found page
  if (!pet) {
    notFound();
  }

  return (
    <main>
      <div className="grid grid-cols-1 sm:grid-cols-2 text-slate-500 ">
        {/* pet images */}
        <PetGallery images={pet.petImages}/>

        {/* pet details */}
        <div className="text-gray-600">
          <h1 className="text-3xl mt-2">{pet.name}</h1>
          <div className=" text-sm mb-4">{`${pet.city}, ${pet.state}`}</div>
          <div className="grid grid-cols-4 sm:grid-cols-1 [&>div:last-child]:col-span-4 sm:[&>div:last-child]:col-span-1 gap-y-4">
            <PetDetail label="Age" value={pet.age} />
            <PetDetail label="Weight" value={pet.weight} />
            <PetDetail label="Height" value={pet.height} />
            <PetDetail label="Category" value={pet.species.name} />
            <PetDetail label="Description" value={pet.description} />
          </div>
          <div className="flex mt-2">
            <Link
              href="/contact"
              className="bg-blue-600 text-white px-7 py-2 rounded"
            >
              Adopt
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

const PetDetail = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <div>
    <span className="font-medium">{label}:</span>
    <span className="ml-2">{value}</span>
  </div>
);
