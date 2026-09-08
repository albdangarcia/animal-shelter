"use client";

import React, { useState } from "react";
import Image from "next/image";
import { XMarkIcon } from "@heroicons/react/24/outline";
import type { AnimalImageModel } from "@/prisma/generated/models/AnimalImage";
import { shimmer, toBase64 } from "@/app/lib/utils/image-loading-placeholder";
import { PET_PHOTO_COMING_SOON_IMAGE } from "@/app/lib/constants/constants";
import LikeButton from "../like-button";
import clsx from "clsx";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

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
              // Remounts on swap. Without it the <img> is reused and the
              // browser keeps painting the PREVIOUS photo until the new one
              // decodes — the old image under the new selection, which reads
              // as a bug. The shimmer placeholder for a beat is honest. Same
              // reasoning as the spotlight hero's portrait.
              key={selectedImage}
              className="object-cover group-hover:opacity-90 transition-opacity"
              src={selectedImage}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              // This is the detail page's LCP element — measured at 1280, the
              // photo is the largest paint on the page. `priority` is
              // deprecated as of Next 16, and it injects a <link rel=preload>
              // in <head>, which is wrong for a src that changes on thumbnail
              // click; eager + high fetch priority is the replacement. The
              // thumbnails below stay lazy.
              //
              // Note that Next's own LCP warning can never fire here: the
              // check in get-img-props.js is gated on `placeholder === "empty"`
              // and this image passes a shimmer, so silence from the dev
              // overlay is not evidence that the loading strategy is right.
              loading="eager"
              fetchPriority="high"
              placeholder={`data:image/svg+xml;base64,${toBase64(
                shimmer(600, 600),
              )}`}
              alt="Selected pet image, click to enlarge"
            />
          ) : (
            // No photos yet. `selectedImage` stays "" so the wrapper's onClick
            // never opens the lightbox on this fallback, and the thumbnail row
            // below stays hidden (gated on images.length > 1).
            <Image
              className="object-contain"
              src={PET_PHOTO_COMING_SOON_IMAGE}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              // Same slot as the real photo above — the detail page's LCP
              // element — so it loads on the same terms rather than lazily.
              loading="eager"
              fetchPriority="high"
              alt="Photo coming soon"
            />
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
            has to re-open the token scope for itself. Note the scope alone does
            not fix inherited `color` — see the `@layer base` rule in
            globals.css, which is what stops the dashboard's dark foreground
            reaching the close button below. */}
        <DialogContent
          className="theme-organic max-w-3xl border-none p-2 sm:rounded-[28px]"
          // The default close button is a bare X at 70% opacity. Over an
          // arbitrary photo that disappears against any similarly-valued
          // region, so this one supplies its own ground instead. Opting out
          // here rather than editing components/ui/dialog.tsx, which has ~20
          // dashboard callers.
          showCloseButton={false}
        >
          {/* Visually hidden title for screen reader accessibility */}
          <DialogTitle className="sr-only">Enlarged Pet Image</DialogTitle>
          <DialogClose className="absolute top-4 right-4 z-10 grid size-9 place-items-center rounded-full bg-background/85 shadow-organic-sm transition-colors hover:bg-background focus:ring-2 focus:ring-ring focus:outline-none">
            <XMarkIcon className="size-[18px]" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </DialogClose>

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
