import { z } from "zod";

/**
 * Shared URL search params for every report surface: the date-range window
 * (`from`/`to` as `yyyy-MM-dd`) and the optional comma-joined species facet.
 *
 * Fetchers `safeParse` these and fall back to defaults on failure rather than
 * throwing — reports should be forgiving of a mangled URL. Individual species
 * ids are split and validated with `cuidSchema`, silently dropping invalid ones.
 */
export const ReportParamsSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  species: z.string().max(200).optional(), // comma-joined cuid2 species ids
});

export type ReportParams = z.infer<typeof ReportParamsSchema>;
