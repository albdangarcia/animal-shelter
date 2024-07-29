"use server";
import { unlink } from "fs/promises";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import path from "path";
import prisma from "@/app/lib/prisma";
import { rolesWithPermission } from "@/app/lib/actions/authorization";
import { idSchema } from "@/app/lib/schemas/common";
import { validateAndUploadImages } from "@/app/lib/utils/validateAndUpload";

// Define a schema for the pet form
const PetFormSchema = z.object({
  name: z.string().min(1),
  age: z.coerce
    .number()
    .gt(0, { message: "Please enter an age greater than 0." }),
  gender: z.enum(["male", "female"], {
    invalid_type_error: "Please select a gender.",
  }),
  species_id: z.string().uuid(),
  breed: z.string(),
  weight: z.coerce
    .number()
    .gt(0, { message: "Please enter an weight greater than 0." }),
  height: z.coerce
    .number()
    .gt(0, { message: "Please enter an height greater than 0." }),
  city: z.string(),
  state: z.string(),
  description: z.string(),
  published: z.enum(["true", "false"], {
    invalid_type_error: "Please select a status.",
  }),
  adoption_status_id: z.string().uuid(),
});

// Define a schema for PetLike
const createPetLikeSchema = z.object({
  pet_id: z.string().uuid().min(1),
  user_id: z.string().uuid().min(1),
});


// Error messages for the pet form
export type CreatePetFormState = {
  errors?: {
    name?: string[];
    age?: string[];
    gender?: string[];
    species_id?: string[];
    breed?: string[];
    weight?: string[];
    height?: string[];
    city?: string[];
    state?: string[];
    description?: string[];
    published?: string[];
    adoption_status_id?: string[];
    petImages?: string[];
  };
  message?: string | null;
};

export const createPet = async (
  prevState: CreatePetFormState,
  formData: FormData
) => {
  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin", "employee"]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Create Pet.");
  }

  // Validate form fields using Zod
  const validatedFields = PetFormSchema.safeParse({
    name: formData.get("name"),
    age: formData.get("age"),
    gender: formData.get("gender"),
    species_id: formData.get("species_id"),
    breed: formData.get("breed"),
    weight: formData.get("weight"),
    height: formData.get("height"),
    city: formData.get("city"),
    state: formData.get("state"),
    description: formData.get("description"),
    published: formData.get("published"),
    adoption_status_id: formData.get("adoption_status_id"),
  });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Create pet.",
    };
  }

  // Prepare data for insertion into the database
  const {
    name,
    age,
    gender,
    species_id,
    breed,
    weight,
    height,
    city,
    state,
    description,
    published,
    adoption_status_id,
  } = validatedFields.data;

  const petImages = formData.getAll("petImages");

  // store the images urls
  let imageUrlArray: string[] = [];

  const result = await validateAndUploadImages(petImages);
  if (Array.isArray(result)) {
    // Images were successfully uploaded
    imageUrlArray = result;
  } else {
    // There was an error
    return result;
  }

  // Convert the published value to a boolean
  const publishedToBoolean = published === "true" ? true : false;

  // Insert the pet into the database
  try {
    await prisma.pet.create({
      data: {
        name: name,
        age: age,
        gender: gender,
        species: {
          connect: {
            id: species_id,
          },
        },
        breed: breed,
        weight: weight,
        height: height,
        city: city,
        state: state,
        description: description,
        published: publishedToBoolean,
        adoptionStatus: {
          connect: {
            id: adoption_status_id,
          },
        },
        petImages: {
          create: imageUrlArray.map((url) => ({
            url: url,
          })),
        },
      },
    });
  } catch (error) {
    return {
      message: "Database Error: Failed to Create Pet.",
    };
  }

  // Revalidate the cache for the /dashboard/pets path
  revalidatePath("/dashboard/pets");

  // Redirect to the /dashboard/pets path
  redirect("/dashboard/pets");
};

export const updatePet = async (
  id: string,
  prevState: CreatePetFormState,
  formData: FormData
) => {
  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin", "employee"]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Update Pet.");
  }

  // Validate the id at runtime
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid ID format.");
  }

  // Validate form fields using Zod
  const validatedFields = PetFormSchema.safeParse({
    name: formData.get("name"),
    age: formData.get("age"),
    gender: formData.get("gender"),
    species_id: formData.get("species_id"),
    breed: formData.get("breed"),
    weight: formData.get("weight"),
    height: formData.get("height"),
    city: formData.get("city"),
    state: formData.get("state"),
    description: formData.get("description"),
    published: formData.get("published"),
    adoption_status_id: formData.get("adoption_status_id"),
  });

  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Update Pet.",
    };
  }

  // Prepare data for insertion into the database
  const {
    name,
    age,
    gender,
    species_id,
    breed,
    weight,
    height,
    city,
    state,
    description,
    published,
    adoption_status_id,
  } = validatedFields.data;

  const petImages = formData.getAll("petImages");

  // store the images urls
  let imageUrlArray: string[] = [];

  const result = await validateAndUploadImages(petImages);
  if (Array.isArray(result)) {
    // Images were successfully uploaded
    imageUrlArray = result;
  } else {
    // There was an error
    return result;
  }

  // Convert the published value to a boolean
  const publishedToBoolean = published === "true" ? true : false;

  // Update the pet in the database
  try {
    await prisma.pet.update({
      where: { id: id },
      data: {
        name: name,
        age: age,
        gender: gender,
        species: {
          connect: {
            id: species_id,
          },
        },
        breed: breed,
        weight: weight,
        height: height,
        city: city,
        state: state,
        description: description,
        published: publishedToBoolean,
        adoptionStatus: {
          connect: {
            id: adoption_status_id,
          },
        },
        petImages: {
          create: imageUrlArray.map((url) => ({
            url: url,
          })),
        },
      },
    });
  } catch (error) {
    return {
      message: "Database Error: Failed to Update Pet.",
    };
  }

  // Revalidate the cache for the /dashboard/pets path
  revalidatePath("/dashboard/pets");

  // Redirect to the /dashboard/pets path
  redirect("/dashboard/pets");
};

export async function deletePet(id: string) {
  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin", "employee"]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Delete Pet.");
  }

  // Validate the id at runtime
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid ID format.");
  }

  // Delete the pet from the database
  try {
    await prisma.pet.delete({
      where: { id: id },
    });

    // Revalidate the cache for the /dashboard/pets path
    revalidatePath("/dashboard/pets");

  } catch (error) {
    return {
      message: "Database Error: Failed to Create Pet.",
    };
  }
}

/**
 * Deletes a pet image by its ID.
 * 
 * @param {string} id - The ID of the pet image to delete.
 * @returns {Promise<{ message: string } | void>} - A message indicating the result of the operation.
 * @throws {Error} - Throws an error if the user does not have permission, the ID is invalid, or a database error occurs.
 */
export async function deletePetImage(id: string) {
  // Check if the user has permission
  const hasPermission = await rolesWithPermission(["admin", "employee"]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Delete Image.");
  }

  // Validate the id at runtime
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    throw new Error("Invalid ID format.");
  }

  // Delete the image from the database
  try {
    const deletedPetImage = await prisma.petImage.delete({
      where: { id: id },
    });

    // Delete the file from the uploads folder
    const filePath = path.join(process.cwd(), "public", deletedPetImage.url);
    await unlink(filePath);

    // Revalidate the cache for the /dashboard/pets path
    revalidatePath("/dashboard/pets");

  } catch (error) {
    return {
      message: "Database Error: Failed to delete Image.",
    };
  }
}

export async function createPetLike(petId: string, userId?: string) {
  // Check if the user has permission
  const hasPermission = await rolesWithPermission([
    "admin",
    "employee",
    "user",
  ]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Create Pet Like.");
  }

  // Validate at runtime using Zod
  const validatedArgs = createPetLikeSchema.safeParse({
    pet_id: petId,
    user_id: userId,
  });
  if (!validatedArgs.success) {
    return {
      errors: validatedArgs.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Update Pet.",
    };
  }

  // Prepare data for insertion into the database
  const { pet_id, user_id } = validatedArgs.data;

  // Insert the pet like into the database
  try {
    await prisma.like.create({
      data: {
        petId: pet_id,
        userId: user_id,
      },
    });

    // Revalidate the cache for the /pets path
    revalidatePath("/pets");
    
  } catch (error) {
    return {
      message: "Database Error: Failed to add pet to likes.",
    };
  }
}

export async function deletePetLike(petId: string, userId?: string) {
  // Check if the user has permission
  const hasPermission = await rolesWithPermission([
    "admin",
    "employee",
    "user",
  ]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Delete Pet.");
  }

  // Validate at runtime using Zod
  const validatedArgs = createPetLikeSchema.safeParse({
    pet_id: petId,
    user_id: userId,
  });
  if (!validatedArgs.success) {
    return {
      errors: validatedArgs.error.flatten().fieldErrors,
      message: "Missing Fields. Failed to Update Pet.",
    };
  }
  // Prepare data for insertion into the database
  const { pet_id, user_id } = validatedArgs.data;

  // Delete the pet like from the database
  try {
    await prisma.like.delete({
      where: {
        userId_petId: {
          petId: pet_id,
          userId: user_id,
        },
      },
    });

    // Revalidate the cache for the /pets path
    revalidatePath("/pets");

  } catch (error) {
    return {
      message: "Database Error: Failed to delete pet to likes.",
    };
  }
}