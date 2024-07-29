import { z } from "zod";

// Define a schema for the id
export const idSchema = z.string().uuid().min(1);