"use client";

import React, { useState } from "react";
import Image from "next/image";
import { PhotoIcon } from "@heroicons/react/24/outline";
import type { AnimalImageModel } from "@/prisma/generated/models/AnimalImage";
import { shimmer, toBase64 } from "@/app/lib/utils/image-loading-placeholder";
import LikeButton from "../like-button";
import clsx from "clsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface PetGalleryProps {
  images: AnimalImageModel[];
  currentUserPersonId: string | undefined;
  animalId: string;
  isLikedByCurrentUser: boolean;
}

const PetGallery = ({
  images,
  currentUserPersonId,
  animalId,
  isLikedByCurrentUser,
}: PetGalleryProps) => {
  const [selectedImage, setSelectedImage] = useState(
    images.length > 0 ? images[0].url : "",
  );
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState("");

  const openLightbox = (imageUrl: string) => {
    setLightboxImageUrl(imageUrl);
    setIsLightboxOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-y-2">
        {/* Large image */}
        <div
          className="relative overflow-hidden flex items-center justify-center w-full h-75 bg-muted rounded-xl cursor-pointer group"
          onClick={() => selectedImage && openLightbox(selectedImage)}
        >
          {selectedImage ? (
            <Image
              className="object-contain group-hover:opacity-90 transition-opacity"
              src={selectedImage}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              placeholder={`data:image/svg+xml;base64,${toBase64(
                shimmer(600, 600),
              )}`}
              alt="Selected pet image, click to enlarge"
            />
          ) : (
            <div className="w-full h-full bg-muted rounded-xl flex">
              <PhotoIcon className="w-8 h-8 m-auto text-muted-foreground" />
            </div>
          )}
          <div className="absolute top-3 right-3 z-10 rounded-full bg-white border shadow-sm">
            <LikeButton
              animalId={animalId}
              currentUserPersonId={currentUserPersonId}
              isLikedByCurrentUser={isLikedByCurrentUser}
            />
          </div>
        </div>

        {/* Thumbnail images */}
        {images.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                className={clsx(
                  "group relative aspect-square rounded-md overflow-hidden cursor-pointer transition-opacity duration-150 ease-in-out focus:outline-none",
                  selectedImage === image.url
                    ? "opacity-100 ring-2 ring-primary ring-offset-1 ring-offset-background"
                    : "opacity-70 hover:opacity-100 focus:ring-2 focus:ring-ring ring-offset-1 ring-offset-background",
                )}
                onClick={() => setSelectedImage(image.url)}
                aria-label={`Select pet image ${index + 1}`}
              >
                <Image
                  className="object-cover transition-transform duration-150 ease-in-out group-hover:scale-110"
                  src={image.url}
                  fill
                  sizes="(max-width: 1024px) 25vw, 12vw"
                  placeholder={`data:image/svg+xml;base64,${toBase64(
                    shimmer(100, 100),
                  )}`}
                  alt={`Pet image thumbnail ${index + 1}`}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Dialog using shadcn/ui */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent className="max-w-3xl p-2 border-none sm:rounded-lg">
          {/* Visually hidden title for screen reader accessibility */}
          <DialogTitle className="sr-only">Enlarged Pet Image</DialogTitle>
          {lightboxImageUrl && (
            <Image
              src={lightboxImageUrl}
              alt="Enlarged pet image"
              width={1200}
              height={800}
              className="object-contain w-full h-auto max-h-[80vh] rounded"
              placeholder={`data:image/svg+xml;base64,${toBase64(
                shimmer(1200, 800),
              )}`}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PetGallery;
