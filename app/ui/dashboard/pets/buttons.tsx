"use client";
import { PencilIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { deletePetImage } from "@/app/lib/actions/pet";
import { useState } from "react";

export function CreatePet() {
  return (
    <Link
      href="/dashboard/pets/create"
      className="flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <span className="hidden md:block">New Pet</span>{" "}
      <PlusIcon className="h-5 md:ml-4" />
    </Link>
  );
}

export function UpdatePet({ id }: { id: string }) {
  return (
    <Link
      href={`/dashboard/pets/${id}/edit`}
      className="rounded-md border p-2 hover:bg-gray-100"
    >
      <PencilIcon className="w-5" />
    </Link>
  );
}

export function DeletePetImage({ id }: { id: string }) {
  const deleteImageWithId = deletePetImage.bind(null, id);
  // Confirmation state for the delete button
  const [confirmation, setConfirmation] = useState(false);
  const handleClick = () => setConfirmation(!confirmation);
  return (
    <form action={deleteImageWithId}>
      <div className="mt-1 h-8 text-center text-sm rounded border hover:bg-red-500 hover:text-white hover:cursor-pointer flex items-center justify-center">
        {!confirmation ? (
          <div
            onClick={handleClick}
            className="w-full flex items-center justify-center"
          >
            <span className="sr-only">Delete</span>
            <TrashIcon className="w-4" />
          </div>
        ) : (
          <button className="flex items-center justify-center w-full">
            <span className="sr-only">Delete</span>
            <span>Yes</span>
          </button>
        )}
      </div>
    </form>
  );
}

export function DeletePet({ id }: { id: string }) {
  return (
    <Link
      href={`/dashboard/pets/delete/${id}`}
      scroll={false}
      className="rounded-md border p-2 hover:bg-gray-100"
    >
      <span className="sr-only">Delete</span>
      <TrashIcon className="w-5" />
    </Link>
  );
}
