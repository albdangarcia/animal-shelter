import { ArrowPathIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { opensans } from "@/app/ui/fonts";
import { fetchLatestPets } from "@/app/lib/data/pets/pet";
import { PhotoIcon } from "@heroicons/react/24/solid";

interface LatestPetsType {
  id: string;
  name: string;
  age: number;
  city: string;
  state: string;
  petImages: {
      url: string;
  }[];
}

export default async function LatestPets() {
  const latestPets: LatestPetsType[] = await fetchLatestPets();

  return (
    <div className="flex w-full flex-col md:col-span-4">
      <h2
        className={`${opensans.className} mb-4 text-xl md:text-2xl font-normal`}
      >
        Latest Pets
      </h2>

      <div className="flex grow flex-col justify-between border border-gray-100 rounded-xl p-4">
        <div className="p-3 text-sm">
          {latestPets.map((pet) => {
            return (
              <div key={pet.id} className="grid grid-cols-[40px,2fr,2fr,1fr] mb-4 items-center border-b border-gray-100 pb-4">
                <div>
                  {pet.petImages[0]?.url ? (
                    <Image
                      src={pet.petImages[0]?.url}
                      className="rounded-full w-7 h-7 object-cover"
                      width={28}
                      height={28}
                      alt={`${pet.name} profile picture`}
                    />
                  ) : (
                    <PhotoIcon className="w-7 text-gray-400" />
                  )}
                </div>
                <p>{pet.name}</p>
                <p>
                  {pet.city}, {pet.state}
                </p>
                <p className="justify-self-end">{pet.age} yrs</p>
              </div>
            );
          })}
        </div>
        <div className="flex items-center pb-2 pt-2">
          <ArrowPathIcon className="h-5 w-5 text-gray-500" />
          <h3 className="ml-2 text-sm text-gray-500 ">Updated just now</h3>
        </div>
      </div>
    </div>
  );
}
