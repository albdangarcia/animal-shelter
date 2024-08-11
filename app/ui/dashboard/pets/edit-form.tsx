"use client";
import { PetImage } from "@prisma/client";
import { PhotoIcon } from "@heroicons/react/24/solid";
import { updatePet, CreatePetFormState } from "@/app/lib/actions/pet";
import { useFormState } from "react-dom";
import { useState } from "react";
import Link from "next/link";
import { AdoptionStatus, Pet, Species } from "@prisma/client";
import { TrashIcon } from "@heroicons/react/24/outline";
import Image from "next/image";

interface PetWithImages extends Pet {
  petImages: PetImage[];
}

export default function EditPetForm({
  pet,
  speciesList,
  adoptionStatusList,
}: {
  pet: PetWithImages;
  speciesList: Species[];
  adoptionStatusList: AdoptionStatus[];
}) {

  const [files, setFiles] = useState<File[]>([]);

  const updatePetWithId = updatePet.bind(null, pet.id);
  const initialState = { message: null, errors: {} };
  const [state, dispatch] = useFormState<CreatePetFormState, FormData>(
    updatePetWithId,
    initialState
  );

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

  // handle file change event
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (files) {
      // Filter out invalid files with unsupported file types and max size of 5MB
      const validFiles = Array.from(files).filter(
        (file) =>
          ALLOWED_MIME_TYPES.includes(
            file.type
          ) && file.size <= MAX_FILE_SIZE
      );
      setFiles((prevFiles) => [...prevFiles, ...validFiles]);
    }
  };

  // handle drop event
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.items) {
      const droppedFiles = Array.from(event.dataTransfer.items)
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter(
          (file): file is File =>
            file !== null &&
          ALLOWED_MIME_TYPES.includes(
              file.type
            ) &&
            file.size <= MAX_FILE_SIZE
        );
      setFiles((prevFiles) => [...prevFiles, ...droppedFiles]);
    }
  };

  // handle drag over event
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  // handle form submit
  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent the default form submission

    // You can access the form data here if needed
    const formData = new FormData(event.currentTarget);

    // Append the files to the form data
    files.forEach((file) => {
      if (file && file.size > 0) {
        formData.append(`petImages`, file);
      }
    });

    // Dispatch the form data
    dispatch(formData);

    // Optionally, manually submit the form
    // event.currentTarget.requestSubmit();
  };

  return (
    <>
      <form onSubmit={handleFormSubmit}>
        <div>
          <div className="border-b border-gray-900/10 pb-5">
            <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label
                  htmlFor="name"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Name
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="name"
                    id="name"
                    defaultValue={pet.name}
                    autoComplete="off"
                    aria-describedby="name-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                
                <div id="name-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.name &&
                    state.errors.name.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="gender"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Gender
                </label>
                <div className="mt-2">
                  <select
                    id="gender"
                    name="gender"
                    defaultValue={pet.gender}
                    autoComplete="off"
                    aria-describedby="gender-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div id="gender-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.gender &&
                    state.errors.gender.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-2 sm:col-start-1">
                <label
                  htmlFor="age"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Age
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    name="age"
                    id="age"
                    defaultValue={pet.age}
                    autoComplete="off"
                    aria-describedby="age-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                <div id="age-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.age &&
                    state.errors.age.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="weight"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Weight
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    name="weight"
                    id="weight"
                    defaultValue={pet.weight}
                    autoComplete="off"
                    aria-describedby="weight-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                <div id="weight-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.weight &&
                    state.errors.weight.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="height"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Height
                </label>
                <div className="mt-2">
                  <input
                    type="number"
                    name="height"
                    id="height"
                    defaultValue={pet.height}
                    autoComplete="off"
                    aria-describedby="height-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                <div id="height-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.height &&
                    state.errors.height.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="species_id"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Species
                </label>
                <div className="mt-2">
                  <select
                    id="species_id"
                    name="species_id"
                    defaultValue={pet.speciesId}
                    autoComplete="off"
                    aria-describedby="category-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"
                  >
                    {speciesList.map((species) => (
                      <option key={species.id} value={species.id}>
                        {species.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div
                  id="species_id-error"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {state.errors?.species_id &&
                    state.errors.species_id.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>
              <div className="sm:col-span-3">
                <label
                  htmlFor="breed"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Breed
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="breed"
                    id="breed"
                    defaultValue={pet.breed}
                    autoComplete="off"
                    aria-describedby="breed-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                <div id="breed-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.breed &&
                    state.errors.breed.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="city"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  City
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="city"
                    id="city"
                    defaultValue={pet.city}
                    autoComplete="true"
                    aria-describedby="city-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                <div id="city-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.city &&
                    state.errors.city.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label
                  htmlFor="state"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  State
                </label>
                <div className="mt-2">
                  <input
                    type="text"
                    name="state"
                    id="state"
                    defaultValue={pet.state}
                    autoComplete="true"
                    aria-describedby="state-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                <div id="state-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.state &&
                    state.errors.state.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="published"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Published
                </label>
                <div className="mt-2">
                  <select
                    id="published"
                    name="published"
                    defaultValue={pet.published ? "true" : "false"}
                    autoComplete="off"
                    aria-describedby="published-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                </div>
                <div id="published-error" aria-live="polite" aria-atomic="true">
                  {state.errors?.published &&
                    state.errors.published.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="adoption_status_id"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Status
                </label>
                <div className="mt-2">
                  <select
                    id="adoption_status_id"
                    name="adoption_status_id"
                    defaultValue={pet.adoptionStatusId}
                    autoComplete="off"
                    aria-describedby="adoption_status_id-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:max-w-xs sm:text-sm sm:leading-6"
                  >
                    {adoptionStatusList.map((adoptionStatus) => (
                      <option key={adoptionStatus.id} value={adoptionStatus.id}>
                        {adoptionStatus.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div
                  id="adoption_status_id-error"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {state.errors?.adoption_status_id &&
                    state.errors.adoption_status_id.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>

              <div className="col-span-full">
                <label
                  htmlFor="description"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Description
                </label>
                <div className="mt-2">
                  <textarea
                    id="description"
                    name="description"
                    defaultValue={pet.description}
                    rows={3}
                    aria-describedby="description-error"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-gray-600">
                  Write a few sentences about the pet.
                </p>
                <div
                  id="description-error"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {state.errors?.description &&
                    state.errors.description.map((error: string) => (
                      <p className="mt-2 text-sm text-red-500" key={error}>
                        {error}
                      </p>
                    ))}
                </div>
              </div>
            </div>

            {/* form errors */}
            <div id="pets-error" aria-live="polite" aria-atomic="true">
              {state.message && (
                <p className="mt-2 text-sm text-red-500" key={state.message}>
                  {state.message}
                </p>
              )}
            </div>
          </div>

          <div className="border-b border-gray-900/10 pb-12 pt-6">
            <div>
              <div className="">
                <label
                  htmlFor="file-upload"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Drop photos
                </label>
                <div
                  className="dropzone mt-2 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <div className="text-center">
                    <PhotoIcon
                      className="mx-auto h-12 w-12 text-gray-300"
                      aria-hidden="true"
                    />
                    <div className="mt-4 flex text-sm leading-6 text-gray-600">
                      <label
                        htmlFor="file-upload"
                        className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500"
                      >
                        <span>Upload a Photo</span>
                        <input
                          type="file"
                          id="file-upload"
                          multiple
                          className="sr-only"
                          onChange={handleFileChange}
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs leading-5 text-gray-600">
                      PNG, JPG, GIF, WEBP up to 5MB
                    </p>
                  </div>
                </div>
              </div>
            </div>
            {/* errors */}
            <div id="petImages-error" aria-live="polite" aria-atomic="true">
              {state.errors?.petImages &&
                state.errors.petImages.map((error: string) => (
                  <p className="mt-2 text-sm text-red-500" key={error}>
                    {error}
                  </p>
                ))}
            </div>

            <div className="">
              <h1 className="text-sm text-gray-500">Images to be uploaded</h1>
              {files.map((file, index) => (
                <div key={index} className="flex text-gray-600 items-center">
                  <Image
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    width={40}
                    height={40}
                  />
                  <span className="font-medium text-sm px-2" key={index}>
                    {file.name} - {(file.size / 1024).toFixed(2)} KB
                  </span>
                  <TrashIcon
                    className="h-4 w-4 hover:cursor-pointer hover:text-red-600"
                    aria-hidden="true"
                    // remove the file from the state list
                    onClick={() => {
                      setFiles((prevFiles) =>
                        prevFiles.filter((_, i) => i !== index)
                      );
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-x-6">
          <Link
            href="/dashboard/pets"
            type="button"
            className="text-sm font-semibold leading-6 text-gray-900"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Save
          </button>
        </div>
      </form>
    </>
  );
}
