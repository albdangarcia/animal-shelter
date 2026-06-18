"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { AnimalImage } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deleteAnimalImage } from "@/app/lib/actions/animal.actions";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AnimalImageGalleryProps {
  images: AnimalImage[];
  animalId: string;
  canManage: boolean;
}

export default function AnimalImageGallery({
  images,
  animalId,
  canManage,
}: AnimalImageGalleryProps) {
  const [isPending, startTransition] = useTransition();

  const [imageToDelete, setImageToDelete] = useState<{
    id: string;
    url: string;
  } | null>(null);

  const executeDelete = () => {
    if (!imageToDelete) return;

    startTransition(async () => {
      const result = await deleteAnimalImage(
        imageToDelete.id,
        imageToDelete.url,
        animalId,
      );
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      // Reset the state to close the modal
      setImageToDelete(null);
    });
  };

  if (images.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8 font-medium">
        This animal has no images yet.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((image, index) => (
          <div
            key={image.id}
            className="relative group border rounded-lg overflow-hidden"
          >
            <Image
              src={image.url}
              alt="Animal image"
              width={300}
              height={300}
              className="object-cover w-full h-full aspect-square"
              loading={index === 0 ? "eager" : "lazy"}
              priority={index === 0}
            />
            <div className="absolute top-2 right-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Wrapper span lets the tooltip fire even while the
                      button itself is disabled, since disabled elements
                      don't receive pointer/focus events. */}
                  <span
                    className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex"
                    tabIndex={canManage ? undefined : 0}
                  >
                    <Button
                      size="icon"
                      variant="destructive"
                      onClick={() =>
                        setImageToDelete({ id: image.id, url: image.url })
                      }
                      disabled={isPending || !canManage}
                      className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Delete image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canManage && (
                  <TooltipContent>
                    You don&apos;t have permission to delete images
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog
        open={imageToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isPending) setImageToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this image? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                executeDelete();
              }}
              disabled={isPending}
              className="bg-destructive/20 text-red-800 hover:bg-destructive/30"
            >
              {isPending ? "Deleting..." : "Delete Image"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}