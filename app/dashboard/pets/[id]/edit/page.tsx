import EditPetForm from "@/app/ui/dashboard/pets/edit-form";
import Breadcrumbs from "@/app/ui/dashboard/pets/breadcrumbs";
import { fetchPetById, fetchAdoptionStatusList } from "@/app/lib/data/pets/pet";
import { fetchSpecies } from "@/app/lib/data/pets/public";
import { notFound } from "next/navigation";
import { DeletePetImage } from "@/app/ui/dashboard/pets/buttons";
import Image from "next/image";
import Link from "next/link";
import { shimmer, toBase64 } from "@/app/lib/utils/image-loading-placeholder";

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
        <div className="flex flex-row gap-x-2 overflow-auto">
          {pet.petImages?.map((image, index) => (
            <div key={image.id} className="relative flex-shrink-0">
              <Link href={image.url} target="_blank">
                <Image
                  key={image.id}
                  className="flex-shrink-0 rounded aspect-square min-w-[12%] cursor-pointer object-cover"
                  src={image.url}
                  height={100}
                  width={100}
                  placeholder={`data:image/svg+xml;base64,${toBase64(
                    shimmer(100, 100)
                  )}`}
                  alt={`image ${index}`}
                />
              </Link>
              <DeletePetImage id={image.id} />
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
