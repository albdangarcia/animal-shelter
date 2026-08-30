import type { InferUITools, UIDataTypes, UIMessage } from "ai";
import type { AiToolSet } from "./registry";

/**
 * The `UIMessage` shape this app's chat speaks, on both sides of the wire.
 *
 * Typing the message with the real tool set is what makes the progress
 * indicator honest: `part.input` and `part.output` come back,
 * so reading an animal's name out of a prior step is a typed
 * property access rather than a cast over `unknown`.
 *
 * Types only. `AiToolSet` is `typeof AI_TOOLS`, and `registry.ts` transitively
 * imports the Prisma-backed data layer — but an `import type` is erased at
 * compile time, so a `"use client"` component can name this type without
 * pulling any of that into the browser bundle. Keep every import in this file
 * `import type`.
 */
export type ShelterUIMessage = UIMessage<
  never,
  UIDataTypes,
  InferUITools<AiToolSet>
>;
