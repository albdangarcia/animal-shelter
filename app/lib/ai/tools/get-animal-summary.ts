import { tool } from "ai";
import { z } from "zod";
import { AppPermissions } from "@/app/lib/auth/permissions";
import { requireFor } from "@/app/lib/auth/actor";
import { can } from "@/app/lib/auth/can";
import { _fetchAnimalSummary } from "@/app/lib/data/animals/animal.data";
import { _fetchAnimalReadinessForAssistant } from "@/app/lib/data/animals/readiness.data";
import { actorContextSchema } from "../context";
import { toReadinessLine } from "../projections/animal-readiness";
import { toAnimalSummary, type AnimalSummary } from "../projections/animal-summary";
import { GET_ANIMAL_READINESS_PERMISSIONS } from "./get-animal-readiness";
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
    "current foster placement (if any), open tasks, most recent intake, and " +
    "a one-line readiness status. Requires an animal id — resolve a name " +
    "with findAnimals first. Returns a structured failure if no animal has " +
    "that id. `readiness.status` is READY, NOT_READY (with how many items " +
    "are outstanding, their kinds, and `daysOutstanding` — whole days, " +
    "already worked out; state it as given) or ARCHIVED (left the shelter; " +
    "readiness does not apply). Readiness is advisory — outstanding items " +
    "are the shelter's checklist, not something that stops the animal " +
    "being listed or adopted; do not call the animal blocked. For what each " +
    "item is and how to clear it, call getAnimalReadiness. " +
    "`readiness` is null when the user cannot see readiness — then leave it " +
    "out of the answer.",
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
      // The summary itself needs only the animal record; the readiness line
      // is added for a viewer who holds every read readiness needs, and
      // left null otherwise rather than refusing the whole summary.
      const canReadReadiness = GET_ANIMAL_READINESS_PERMISSIONS.every(
        (permission) => can(context.role, permission),
      );
      const [row, readiness] = await Promise.all([
        _fetchAnimalSummary(animalId),
        canReadReadiness ? _fetchAnimalReadinessForAssistant(animalId) : null,
      ]);
      if (!row) {
        return toolFailure(
          `No animal found with id "${animalId}". Use findAnimals to look it up by name.`,
        );
      }
      return {
        ok: true,
        animal: toAnimalSummary(
          row,
          readiness ? toReadinessLine(readiness) : null,
        ),
      };
    } catch (error) {
      return toolFailure(describeToolError(error));
    }
  },
});
