import { z } from "zod";
import type { Actor } from "@/app/lib/auth/actor";

/**
 * The `contextSchema` every AI tool declares. In AI SDK 7 a tool receives only
 * its own entry from the caller's `toolsContext` map (keyed by tool name),
 * validated against this schema and delivered as `execute`'s second argument
 * `context`.
 *
 * It mirrors `Actor` exactly. The actor is resolved once, before the tool loop
 * starts, and passed explicitly; no tool reads `headers()`,
 * `cookies()`, or the session.
 */
export const actorContextSchema: z.ZodType<Actor> = z.object({
  userId: z.string(),
  personId: z.string(),
  role: z.string(),
});
