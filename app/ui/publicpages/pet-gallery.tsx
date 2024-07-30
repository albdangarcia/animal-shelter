"use client";
import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PhotoIcon } from "@heroicons/react/24/outline";

type ImageProps = {
  id: string;
  url: string;
  petId: string;
};
export const PetGallery = ({ images }: { images: ImageProps[] }) => {
  // State to keep track of the selected image
  const [selectedImage, setSelectedImage] = useState(
    images.length > 0 ? images[0].url : ""
  );

  return (
    <div className="flex flex-col mr-8 gap-y-2">
      {/* large image */}
      <div className="relative overflow-hidden flex items-center justify-center w-full h-80 bg-slate-200 rounded">
        {selectedImage ? (
          <Link href={selectedImage} target="_blank">
            <Image
              className="object-cover"
              src={selectedImage}
              fill
              sizes="(min-width: 800px) 50vw, 100vw"
              alt="selected image"
            />
          </Link>
        ) : (
          <div className="w-full h-full bg-gray-200 rounded-md flex">
            <PhotoIcon className="w-8 h-8 m-auto text-gray-500" />
          </div>
        )}
      </div>
      {/* thumbnail images */}
      <div className="flex flex-row gap-x-2 overflow-auto">
        {images.map((image) => (
          <Image
            key={image.id}
            className="flex-shrink-0 aspect-square min-w-[24%] cursor-pointer object-cover"
            src={image.url}
            onClick={() => setSelectedImage(image.url)}
            height={70}
            width={70}
            alt="selected image"
          />
        ))}
      </div>
    </div>
  );
};
