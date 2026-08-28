import { tool } from "ai";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { requireFor } from "@/app/lib/auth/actor";
import { _findAnimalsByName } from "@/app/lib/data/animals/animal.data";
import { actorContextSchema } from "../context";
import { toAnimalMatch, type AnimalMatch } from "../projections/animal-match";
import {
  describeToolError,
  toolFailure,
  type ToolResult,
} from "./tool-result";

/**
 * Declared once, here. `registry.ts` filters the tool set on the same constant
 * and `execute` enforces it again — so the two cannot drift.
 */
export const FIND_ANIMALS_PERMISSIONS = [AppPermissions.ANIMAL_INFO_READ];

export const findAnimalsTool = tool({
  description:
    "Look up animals by name (case-insensitive, partial match). Use this " +
    "first whenever the user refers to an animal by name — you need an id " +
    "before you can call getAnimalSummary or any write tool. Returns the " +
    "match set: id, name, species, birth date, and current unit. If more " +
    "than one animal matches, ask the user which one rather than guessing. " +
    "Archived animals (adopted, transferred out, deceased) are not returned.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Full or partial animal name, e.g. \"Bruno\"."),
  }),
  contextSchema: actorContextSchema,
  async execute({ query }, { context }): Promise<ToolResult<{ matches: AnimalMatch[] }>> {
    try {
      for (const permission of FIND_ANIMALS_PERMISSIONS) {
        requireFor(context, permission);
      }
      const rows = await _findAnimalsByName(query);
      return { ok: true, matches: rows.map(toAnimalMatch) };
    } catch (error) {
      return toolFailure(describeToolError(error));
    }
  },
});
