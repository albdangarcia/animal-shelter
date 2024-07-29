import { opensans } from "@/app/ui/fonts";
import { fetchPetCardData } from "@/app/lib/data/pets/pet";

// Card component that displays the total number of pets, adopted pets, pending pets, and available pets
export default async function CardWrapper() {
  const { totalPets, adoptedPetsCount, pendingPetsCount, availablePetsCount } =
    await fetchPetCardData();

  return (
    <>
      <Card title="Total Pets" value={totalPets} />
      <Card title="Adopted" value={adoptedPetsCount} />
      <Card title="Pending" value={pendingPetsCount} />
      <Card title="Available" value={availablePetsCount} />
    </>
  );
}

export function Card({
  title,
  value,
}: {
  title: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl p-2 shadow-sm text-gray-800 bg-[#E1E7EA]">
      <div className="flex pl-3 pt-2">
        <h3 className="text-sm font-medium tracking-wide">{title}</h3>
      </div>
      <p
        className={`${opensans.className}
            truncate rounded-x px-4 py-5 md:py-8 text-center text-3xl`}
      >
        {value}
      </p>
    </div>
  );
}
