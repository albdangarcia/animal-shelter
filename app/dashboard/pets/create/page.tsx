import CreatePetForm from "@/app/ui/dashboard/pets/create-form";
import Breadcrumbs from "@/app/ui/dashboard/pets/breadcrumbs";
import { fetchAdoptionStatusList } from "@/app/lib/data/pets/pet";
import { fetchSpecies } from "@/app/lib/data/pets/public";

export default async function Page() {
    const speciesList = await fetchSpecies();
    const adoptionStatusList = await fetchAdoptionStatusList();

  return (
    <main>
      <Breadcrumbs
        breadcrumbs={[
          { label: "Pets", href: "/dashboard/pets" },
          {
            label: "Create Pet",
            href: "/dashboard/pets/create",
            active: true,
          },
        ]}
      />
      <CreatePetForm
        speciesList={speciesList}
        adoptionStatusList={adoptionStatusList}
      />
    </main>
  );
}
