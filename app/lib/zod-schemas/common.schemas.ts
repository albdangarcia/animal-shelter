import { z } from "zod";

export const searchQuerySchema = z.string().trim().max(100, {
  error: "Query cannot exceed 100 characters.",
});

// Helper for CUID validation
export const cuidSchema = z.cuid({
  error: "Invalid ID format. Expected a CUID.",
});

// Reusable schema for currentPage
export const currentPageSchema = z.int().positive({
  error: "Page number must be a positive integer.",
});

export const pageSizeSchema = z.coerce
  .number()
  .transform((val) => ([10, 20, 30, 40, 50].includes(val) ? val : 10));
