import Link from "next/link";
import Image from "next/image";
import welcomePicture from "@/public/homeimage15.webp";

const categories = ["Dog", "Cat", "Bird", "Reptile"];

export default async function Page() {
  return (
    <>
      <WelcomeImage />

      {/* categories */}
      <h1 className="text-gray-700 text-center p-5 text-xl font-semibold">
        Categories
      </h1>
      <div className="flex justify-center mt-2 gap-x-3 mb-5">
        {categories.map((category) => (
          <Link
            href={`pets?page=1&category=${category}`}
            key={category}
            className="flex items-center justify-center w-40 h-16 sm:h-24 rounded-md shadow-md bg-slate-400"
          >
            <h1 className="font-medium text-gray-100">{category}</h1>
          </Link>
        ))}
      </div>
    </>
  );
}

const WelcomeImage = () => {
  return (
    <div className="relative overflow-hidden bg-gray-200 h-96 flex flex-col items-center rounded">
      <Image
        src={welcomePicture}
        alt="home image"
        fill
        style={{ objectFit: "cover" }}
        placeholder="blur"
      />

      <div className="text-center my-auto z-10">
        <div className="text-3xl text-white font-medium mb-3">
          Find your perfect pet today
        </div>
        <Link
          href="/pets"
          className="bg-tranparent hover:bg-white text-white hover:text-black font-semibold py-2 px-4 border border-white rounded transition-colors"
        >
          <span>See Pets</span>
        </Link>
      </div>
    </div>
  );
};