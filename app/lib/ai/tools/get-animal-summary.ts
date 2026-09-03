import { tool } from "ai";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { requireFor } from "@/app/lib/auth/actor";
import { _fetchAnimalSummary } from "@/app/lib/data/animals/animal.data";
import { actorContextSchema } from "../context";
import { toAnimalSummary, type AnimalSummary } from "../projections/animal-summary";
import {
  describeToolError,
  toolFailure,
  type ToolResult,
} from "./tool-result";

export const GET_ANIMAL_SUMMARY_PERMISSIONS = [AppPermissions.ANIMAL_INFO_READ];

export const getAnimalSummaryTool = tool({
  description:
    "Get a detailed summary of one animal by id: species, breed, color, " +
    "sex, birth date, size, health status, listing status, current unit, " +
    "current foster placement (if any), open tasks, and most recent intake. " +
    "Requires an animal id — resolve a name with findAnimals first. Returns " +
    "a structured failure if no animal has that id.",
  inputSchema: z.object({
    animalId: z
      .string()
      .describe("Animal id from findAnimals or getAttentionQueue."),
  }),
  contextSchema: actorContextSchema,
  async execute(
    { animalId },
    { context },
  ): Promise<ToolResult<{ animal: AnimalSummary }>> {
    try {
      for (const permission of GET_ANIMAL_SUMMARY_PERMISSIONS) {
        requireFor(context, permission);
      }
      const row = await _fetchAnimalSummary(animalId);
      if (!row) {
        return toolFailure(
          `No animal found with id "${animalId}". Use findAnimals to look it up by name.`,
        );
      }
      return { ok: true, animal: toAnimalSummary(row) };
    } catch (error) {
      return toolFailure(describeToolError(error));
    }
  },
});
