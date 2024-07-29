"use server";
import { unlink } from "fs/promises";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import path from "path";
import { writeFile } from "fs/promises";
import prisma from "./prisma";
import { auth } from "@/auth";

// export const idSchema = z.string().uuid().min(1);

// // Define a schema for the pet form
// const PetFormSchema = z.object({
//   name: z.string().min(1),
//   age: z.coerce
//     .number()
//     .gt(0, { message: "Please enter an age greater than 0." }),
//   gender: z.enum(["male", "female"], {
//     invalid_type_error: "Please select a gender.",
//   }),
//   species_id: z.string().uuid(),
//   breed: z.string(),
//   weight: z.coerce
//     .number()
//     .gt(0, { message: "Please enter an weight greater than 0." }),
//   height: z.coerce
//     .number()
//     .gt(0, { message: "Please enter an height greater than 0." }),
//   city: z.string(),
//   state: z.string(),
//   description: z.string(),
//   published: z.enum(["true", "false"], {
//     invalid_type_error: "Please select a status.",
//   }),
//   adoption_status_id: z.string().uuid(),
// });

// // Error messages for the pet form
// export type CreatePetFormState = {
//   errors?: {
//     name?: string[];
//     age?: string[];
//     gender?: string[];
//     species_id?: string[];
//     breed?: string[];
//     weight?: string[];
//     height?: string[];
//     city?: string[];
//     state?: string[];
//     description?: string[];
//     published?: string[];
//     adoption_status_id?: string[];
//     petImages?: string[];
//   };
//   message?: string | null;
// };

// // Check if the user has permission to perform an action
// const rolesWithPermissions = async (allowedRoles: string[]) => {
//   // Get the current session
//   const session = await auth();
//   // If the session is not found, return false
//   if (!session) {
//     return false;
//   }
//   // Get the role of the current user
//   const userRole = session?.user?.role;
//   // If the user role is not in the allowed roles, return false
//   return allowedRoles.includes(userRole);
// };

// // Allowed mime types for image uploads
// const ALLOWED_MIME_TYPES = [
//   "image/jpeg",
//   "image/png",
//   "image/gif",
//   "image/webp",
// ];

// // Maximum file size for image uploads
// const MAX_FILE_SIZE = 5 * 1024 * 1024;

// async function validateAndUploadImages(petImages: FormDataEntryValue[]) {
//   const imageUrlArray: string[] = [];

//   if (petImages.length === 0) {
//     return imageUrlArray;
//   }

//   // Validate petImages
//   for (const file of petImages) {
//     // Check if the file is an instance of File
//     if (!(file instanceof File)) {
//       return {
//         errors: { image_url: ["Invalid file upload."] },
//         message: "Invalid input. Failed to Update Pet.",
//       };
//     }
//     // Check if the file size is greater than the maximum file size
//     if (file.size > MAX_FILE_SIZE) {
//       return {
//         errors: { petImages: ["File is too large"] },
//         message: "Failed to Update Pet.",
//       };
//     }
//     // Check if the file type is in the allowed mime types
//     if (!ALLOWED_MIME_TYPES.includes(file.type)) {
//       return {
//         errors: { petImages: ["Invalid file type"] },
//         message: "Failed to Update Pet.",
//       };
//     }
//   }

//   // upload images
//   try {
//     const uploadPromises = petImages.map(async (file: any) => {
//       const buffer = Buffer.from(await file.arrayBuffer());
//       const filename = Date.now() + file.name.replaceAll(" ", "_");

//       try {
//         await writeFile(
//           path.join(process.cwd(), "public/uploads/" + filename),
//           buffer
//         );
//         return "/uploads/" + filename;
//       } catch (error) {
//         throw new Error("Failed to upload image: " + file.name);
//       }
//     });

//     return await Promise.all(uploadPromises);
//   } catch (error) {
//     return {
//       message: "Failed to upload one or more images.",
//     };
//   }
// }

// export const updatePet = async (
//   id: string,
//   prevState: CreatePetFormState,
//   formData: FormData
// ) => {
//   // Check if the user has permission
//   const hasPermission = await rolesWithPermissions(["admin", "employee"]);
//   if (!hasPermission) {
//     throw new Error("Access Denied. Failed to Update Pet.");
//   }

//   // Validate the id using Zod
//   const parsedId = idSchema.safeParse(id);
//   if (!parsedId.success) {
//     throw new Error();
//   }

//   // Validate form fields using Zod
//   const validatedFields = PetFormSchema.safeParse({
//     name: formData.get("name"),
//     age: formData.get("age"),
//     gender: formData.get("gender"),
//     species_id: formData.get("species_id"),
//     breed: formData.get("breed"),
//     weight: formData.get("weight"),
//     height: formData.get("height"),
//     city: formData.get("city"),
//     state: formData.get("state"),
//     description: formData.get("description"),
//     published: formData.get("published"),
//     adoption_status_id: formData.get("adoption_status_id"),
//   });

//   // If form validation fails, return errors early. Otherwise, continue.
//   if (!validatedFields.success) {
//     return {
//       errors: validatedFields.error.flatten().fieldErrors,
//       message: "Missing Fields. Failed to Update Pet.",
//     };
//   }

//   // Prepare data for insertion into the database
//   const {
//     name,
//     age,
//     gender,
//     species_id,
//     breed,
//     weight,
//     height,
//     city,
//     state,
//     description,
//     published,
//     adoption_status_id,
//   } = validatedFields.data;

//   const petImages = formData.getAll("petImages");

//   // store the images urls
//   let imageUrlArray: string[] = [];

//   const result = await validateAndUploadImages(petImages);
//   if (Array.isArray(result)) {
//     // Images were successfully uploaded
//     imageUrlArray = result;
//   } else {
//     // There was an error
//     return result;
//   }

//   // Convert the published value to a boolean
//   const publishedToBoolean = published === "true" ? true : false;

//   // Update the pet in the database
//   try {
//     await prisma.pet.update({
//       where: { id: id },
//       data: {
//         name: name,
//         age: age,
//         gender: gender,
//         species: {
//           connect: {
//             id: species_id,
//           },
//         },
//         breed: breed,
//         weight: weight,
//         height: height,
//         city: city,
//         state: state,
//         description: description,
//         published: publishedToBoolean,
//         adoptionStatus: {
//           connect: {
//             id: adoption_status_id,
//           },
//         },
//         petImages: {
//           create: imageUrlArray.map((url) => ({
//             url: url,
//           })),
//         },
//       },
//     });
//   } catch (error) {
//     return {
//       message: "Database Error: Failed to Update Pet.",
//     };
//   }

//   // Revalidate the cache for the /dashboard/pets path
//   revalidatePath("/dashboard/pets");

//   // Redirect to the /dashboard/pets path
//   redirect("/dashboard/pets");
// };

// export const createPet = async (
//   prevState: CreatePetFormState,
//   formData: FormData
// ) => {
//   // Check if the user has permission
//   const hasPermission = await rolesWithPermissions(["admin", "employee"]);
//   if (!hasPermission) {
//     throw new Error("Access Denied. Failed to Create Pet.");
//   }

//   // Validate form fields using Zod
//   const validatedFields = PetFormSchema.safeParse({
//     name: formData.get("name"),
//     age: formData.get("age"),
//     gender: formData.get("gender"),
//     species_id: formData.get("species_id"),
//     breed: formData.get("breed"),
//     weight: formData.get("weight"),
//     height: formData.get("height"),
//     city: formData.get("city"),
//     state: formData.get("state"),
//     description: formData.get("description"),
//     published: formData.get("published"),
//     adoption_status_id: formData.get("adoption_status_id"),
//   });

//   // If form validation fails, return errors early. Otherwise, continue.
//   if (!validatedFields.success) {
//     return {
//       errors: validatedFields.error.flatten().fieldErrors,
//       message: "Missing Fields. Failed to Create pet.",
//     };
//   }

//   // Prepare data for insertion into the database
//   const {
//     name,
//     age,
//     gender,
//     species_id,
//     breed,
//     weight,
//     height,
//     city,
//     state,
//     description,
//     published,
//     adoption_status_id,
//   } = validatedFields.data;

//   const petImages = formData.getAll("petImages");

//   // store the images urls
//   let imageUrlArray: string[] = [];

//   const result = await validateAndUploadImages(petImages);
//   if (Array.isArray(result)) {
//     // Images were successfully uploaded
//     imageUrlArray = result;
//   } else {
//     // There was an error
//     return result;
//   }

//   // Convert the published value to a boolean
//   const publishedToBoolean = published === "true" ? true : false;

//   // Insert the pet into the database
//   try {
//     await prisma.pet.create({
//       data: {
//         name: name,
//         age: age,
//         gender: gender,
//         species: {
//           connect: {
//             id: species_id,
//           },
//         },
//         breed: breed,
//         weight: weight,
//         height: height,
//         city: city,
//         state: state,
//         description: description,
//         published: publishedToBoolean,
//         adoptionStatus: {
//           connect: {
//             id: adoption_status_id,
//           },
//         },
//         petImages: {
//           create: imageUrlArray.map((url) => ({
//             url: url,
//           })),
//         },
//       },
//     });
//   } catch (error) {
//     return {
//       message: "Database Error: Failed to Create Pet.",
//     };
//   }

//   // Revalidate the cache for the /dashboard/pets path
//   revalidatePath("/dashboard/pets");

//   // Redirect to the /dashboard/pets path
//   redirect("/dashboard/pets");
// };

// export async function deletePet(id: string) {
//   // Check if the user has permission
//   const hasPermission = await rolesWithPermissions(["admin", "employee"]);
//   if (!hasPermission) {
//     throw new Error("Access Denied. Failed to Delete Pet.");
//   }

//   // Validate the id using Zod
//   const parsedId = idSchema.safeParse(id);
//   if (!parsedId.success) {
//     throw new Error();
//   }

//   // Delete the pet from the database
//   try {
//     await prisma.pet.delete({
//       where: { id: id },
//     });

//     revalidatePath("/dashboard/pets");

//     return { message: "Pet deleted successfully." };
//   } catch (error) {
//     return {
//       message: "Database Error: Failed to Create Pet.",
//     };
//   }
// }

// // Delete an image from the database and the images in uploads folder
// export async function deletePetImage(id: string) {
//   // Check if the user has permission
//   const hasPermission = await rolesWithPermissions(["admin", "employee"]);
//   if (!hasPermission) {
//     throw new Error("Access Denied. Failed to Delete Image.");
//   }

//   // Validate the id using Zod
//   const parsedId = idSchema.safeParse(id);
//   if (!parsedId.success) {
//     throw new Error();
//   }

//   try {
//     const petImage = await prisma.petImage.findUnique({
//       where: { id: id },
//     });

//     if (!petImage) {
//       return {
//         message: "Image not found.",
//       };
//     }
//     await prisma.petImage.delete({
//       where: { id: id },
//     });

//     // Delete the file from the uploads folder
//     const filePath = path.join(process.cwd(), "public", petImage.url);
//     await unlink(filePath);

//     revalidatePath("/dashboard/pets");

//     return { message: "Image deleted successfully." };
//   } catch (error) {
//     return {
//       message: "Database Error: Failed to delete Image.",
//     };
//   }
// }

// // Define a schema for PetLike
// const createPetLikeSchema = z.object({
//   pet_id: z.string().uuid().min(1),
//   user_id: z.string().uuid().min(1),
// });

// export async function createPetLike(petId: string, userId?: string) {
//   // Check if the user has permission
//   const hasPermission = await rolesWithPermissions([
//     "admin",
//     "employee",
//     "user",
//   ]);
//   if (!hasPermission) {
//     throw new Error("Access Denied. Failed to Create Pet Like.");
//   }

//   // Validate using Zod
//   const validatedArgs = createPetLikeSchema.safeParse({
//     pet_id: petId,
//     user_id: userId,
//   });
//   if (!validatedArgs.success) {
//     return {
//       errors: validatedArgs.error.flatten().fieldErrors,
//       message: "Missing Fields. Failed to Update Pet.",
//     };
//   }

//   // Prepare data for insertion into the database
//   const { pet_id, user_id } = validatedArgs.data;

//   try {
//     await prisma.like.create({
//       data: {
//         petId: pet_id,
//         userId: user_id,
//       },
//     });

//     // Revalidate the cache for the /pets path
//     revalidatePath("/pets");
    
//   } catch (error) {
//     return {
//       message: "Database Error: Failed to add pet to likes.",
//     };
//   }
// }

// export async function deletePetLike(petId: string, userId?: string) {
//   // Check if the user has permission
//   const hasPermission = await rolesWithPermissions([
//     "admin",
//     "employee",
//     "user",
//   ]);
//   if (!hasPermission) {
//     throw new Error("Access Denied. Failed to Delete Pet.");
//   }

//   // Validate using Zod
//   const validatedArgs = createPetLikeSchema.safeParse({
//     pet_id: petId,
//     user_id: userId,
//   });
//   if (!validatedArgs.success) {
//     return {
//       errors: validatedArgs.error.flatten().fieldErrors,
//       message: "Missing Fields. Failed to Update Pet.",
//     };
//   }
//   // Prepare data for insertion into the database
//   const { pet_id, user_id } = validatedArgs.data;

//   try {
//     await prisma.like.delete({
//       where: {
//         userId_petId: {
//           petId: pet_id,
//           userId: user_id,
//         },
//       },
//     });
//     console.log("Pet deleted from likes.");

//     revalidatePath("/pets");

//     return { message: "Pet deleted from likes." };
//   } catch (error) {
//     return {
//       message: "Database Error: Failed to delete pet to likes.",
//     };
//   }
// }

// export async function deleteUser(id: string) {
//   // Check if the user has permission
//   const hasPermission = await rolesWithPermissions(["admin"]);
//   if (!hasPermission) {
//     throw new Error("Access Denied. Failed to Delete User.");
//   }

//   // Validate the id using Zod
//   const parsedId = idSchema.safeParse(id);
//   if (!parsedId.success) {
//     throw new Error();
//   }

//   try {
//     await prisma.user.delete({
//       where: { id: id },
//     });

//     revalidatePath("/dashboard/users");

//     return { message: "User deleted successfully." };
//   } catch (error) {
//     return {
//       message: "Database Error: Failed to delete user.",
//     };
//   }
// }

// // Define a schema for the user form
// const UserFormSchema = z.object({
//   role: z.enum(["user", "employee"], {
//     invalid_type_error: "Please select a role.",
//   }),
// });

// // error messages for the user form
// export type CreateUserFormState = {
//   errors?: {
//     role?: string[];
//   };
//   message?: string | null;
// };

// export async function updateUser(
//   id: string,
//   prevState: CreateUserFormState,
//   formData: FormData
// ) {
//   // Check if the user has permission
//   const hasPermission = await rolesWithPermissions(["admin"]);
//   if (!hasPermission) {
//     throw new Error("Access Denied. Failed to Update User.");
//   }

//   // Validate the id using Zod
//   const parsedId = idSchema.safeParse(id);
//   if (!parsedId.success) {
//     throw new Error();
//   }

//   const validatedFields = UserFormSchema.safeParse({
//     role: formData.get("role"),
//   });

//   if (!validatedFields.success) {
//     return {
//       errors: validatedFields.error.flatten().fieldErrors,
//       message: "Missing Fields. Failed to Update User.",
//     };
//   }

//   // Prepare data for insertion into the database
//   const { role } = validatedFields.data;

//   try {
//     await prisma.user.update({
//       where: { id: id },
//       data: {
//         role: role,
//       },
//     });
//   } catch (error) {
//     return {
//       message: "Database Error: Failed to Update User.",
//     };
//   }

//   revalidatePath("/dashboard/users");
//   redirect("/dashboard/users");
// }
