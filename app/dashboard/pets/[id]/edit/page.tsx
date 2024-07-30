import EditPetForm from "@/app/ui/dashboard/pets/edit-form";
import Breadcrumbs from "@/app/ui/dashboard/pets/breadcrumbs";
import {
  fetchPetById,
  fetchAdoptionStatusList,
} from "@/app/lib/data/pets/pet";
import { fetchSpecies } from "@/app/lib/data/pets/public";
import { notFound } from "next/navigation";
import { DeletePetImage } from "@/app/ui/dashboard/pets/buttons";
import Image from "next/image";
import Link from "next/link";

interface ImageType {
  id: string;
  url: string;
  petId: string;
}

export default async function Page({ params }: { params: { id: string } }) {
  // get the id from the url
  const id = params.id;

  // fetch pet from database
  const pet = await fetchPetById(id);
  const speciesList = await fetchSpecies();
  const adoptionStatusList = await fetchAdoptionStatusList();

  // if the pet is not found then return not found page
  if (!pet) {
    notFound();
  }

  return (
    <main>
      <Breadcrumbs
        breadcrumbs={[
          { label: "Pets", href: "/dashboard/pets" },
          {
            label: "Edit Pet",
            href: `/dashboard/pets/${id}/edit`,
            active: true,
          },
        ]}
      />
      <h2 className="text-base font-semibold leading-7 text-gray-900">
        Pet Information
      </h2>

      {/* uploaded images */}
      <div>
        <span className="block text-sm font-medium leading-6 text-gray-900">
          Uploaded images
        </span>
        <div className="flex gap-x-5">
          {pet.petImages?.map((image: ImageType, index: number) => (
            <div className="flex" key={image.url}>
              <div className="flex text-gray-600 items-center">
                <Link href={image.url} target="_blank">
                  <Image
                    src={image.url}
                    alt={`image ${index}`}
                    width={40}
                    height={40}
                  />
                </Link>
                <DeletePetImage id={image.id} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* pet's form */}
      <EditPetForm
        pet={pet}
        speciesList={speciesList}
        adoptionStatusList={adoptionStatusList}
      />
    </main>
  );
}
