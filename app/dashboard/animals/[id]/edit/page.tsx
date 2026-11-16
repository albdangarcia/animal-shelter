import {
  getShelterSettings,
  getShelterToday,
} from "@/app/lib/data/shelter-settings.data";
import { notFound } from "next/navigation";
import {
  fetchAnimalById,
  fetchColors,
  fetchPartners,
  fetchSpecies,
} from "@/app/lib/data/animals/animal.data";
import AnimalForm from "@/components/dashboard/animals/animal-intake-form";
import { fetchUnitPickerOptions } from "@/app/lib/data/locations/unit-picker.data";
import { IDParamType } from "@/app/lib/types";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getHelpLinkGuide } from "@/app/lib/data/guides.data";
import { PAGE_HELP_GUIDES } from "@/app/lib/guides/help-paths";

interface Props {
  params: IDParamType;
}

const Page = async ({ params }: Props) => {
  const { id: animalId } = await params;

  const [animal, partners, colors, speciesList, unitOptions, help] =
    await Promise.all([
      fetchAnimalById(animalId),
      fetchPartners(),
      fetchColors(),
      fetchSpecies(),
      fetchUnitPickerOptions(),
      getHelpLinkGuide(PAGE_HELP_GUIDES.animalEdit),
    ]);

  if (!animal) {
    notFound();
  }

  return (
    <main className="container mx-auto">
      <Button asChild variant="ghost" className="mb-4">
        <Link href={`/dashboard/animals/${animalId}`}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Animal Profile
        </Link>
      </Button>

      <AnimalForm
        speciesList={speciesList}
        unitSystem={(await getShelterSettings()).weightUnitSystem}
        partners={partners}
        colors={colors}
        animal={animal}
        unitOptions={unitOptions}
        today={await getShelterToday()}
        help={help}
      />
    </main>
  );
};

export default Page;
