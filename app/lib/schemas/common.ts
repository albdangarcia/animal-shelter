import { z } from "zod";

// Define a schema for the id
export const idSchema = z.string().min(1);