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
          className="group relative flex h-75 w-full cursor-pointer items-center justify-center overflow-hidden rounded-[28px] bg-card"
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
            <div className="flex h-full w-full rounded-[28px] bg-card">
              <PhotoIcon className="w-8 h-8 m-auto text-muted-foreground" />
            </div>
          )}
          <div className="absolute top-3 right-3 z-10">
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
                  "group relative aspect-square cursor-pointer overflow-hidden rounded-[16px] transition-opacity duration-150 ease-in-out focus:outline-none",
                  selectedImage === image.url
                    ? "opacity-100 ring-2 ring-ring ring-offset-1 ring-offset-background"
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
        {/* Portals to <body>, outside the layout's .theme-organic div, so it
            has to re-open the token scope for itself. */}
        <DialogContent className="theme-organic max-w-3xl border-none p-2 sm:rounded-[28px]">
          {/* Visually hidden title for screen reader accessibility */}
          <DialogTitle className="sr-only">Enlarged Pet Image</DialogTitle>
          {lightboxImageUrl && (
            <Image
              src={lightboxImageUrl}
              alt="Enlarged pet image"
              width={1200}
              height={800}
              className="h-auto max-h-[80vh] w-full rounded-[20px] object-contain"
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
