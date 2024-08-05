"use server";
import path from "path";
import { writeFile } from "fs/promises";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/app/lib/constants";
import { rolesWithPermission } from "../actions/authorization";

// Validate and upload images
export async function validateAndUploadImages(petImages: FormDataEntryValue[]) {
  // Check if the user has permission to upload images
  const hasPermission = await rolesWithPermission(["admin", "employee"]);
  if (!hasPermission) {
    throw new Error("Access Denied. Failed to Create Pet.");
  }
  
  const imageUrlArray: string[] = [];

  if (petImages.length === 0) {
    return imageUrlArray;
  }

  // Validate petImages
  for (const file of petImages) {
    // Check if the file is an instance of File
    if (!(file instanceof File)) {
      return {
        errors: { image_url: ["Invalid file upload."] },
        message: "Invalid input. Failed to Update Pet.",
      };
    }
    // Check if the file size is greater than the maximum file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        errors: { petImages: ["File is too large"] },
        message: "Failed to Update Pet.",
      };
    }
    // Check if the file type is in the allowed mime types
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        errors: { petImages: ["Invalid file type"] },
        message: "Failed to Update Pet.",
      };
    }
  }

  // upload images
  try {
    const uploadPromises = petImages.map(async (file: any) => {
      // Convert the file to a buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      // Generate a unique filename
      const filename = Date.now() + file.name.replaceAll(" ", "_");

      // Write the file to the uploads directory
      try {
        const filePath = path.join(process.cwd(), "public/uploads/" + filename);
        await writeFile(filePath, buffer);
        // Add the image URL to uploadPromises
        return "/uploads/" + filename;
      } catch (error) {
        console.error("Error writing file:", error);
        throw new Error("Failed to upload image: " + file.name);
      }
    });

    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error("Error uploading images:", error);
    return {
      message: "Failed to upload one or more images.",
    };
  }
}