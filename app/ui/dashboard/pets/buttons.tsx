import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { deletePetImage } from '@/app/lib/actions/pet';

export function CreatePet() {
  return (
    <Link
      href="/dashboard/pets/create"
      className="flex h-10 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <span className="hidden md:block">New Pet</span>{' '}
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

  return (
    <form action={deleteImageWithId}>
      <button className="bg-[#EBE9FA] rounded-full p-[2px] border-[2px] border-[#F4F3FD] border-1">
        <TrashIcon className="h-4 w-4 text-indigo-700" aria-hidden="true" />
      </button>
    </form>
  );
}

export function DeletePet({ id }: { id: string }) {
  return (
    <Link href={`/dashboard/pets/delete/${id}`} scroll={false} className="rounded-md border p-2 hover:bg-gray-100">
      <span className="sr-only">Delete</span>
      <TrashIcon className="w-5" />
    </Link>
  );
}