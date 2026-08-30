import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectToolFailures,
  describeActiveStep,
  resolveAnimalNames,
} from "./chat-progress";
import type { ShelterUIMessage } from "./ui-message";

type Part = ShelterUIMessage["parts"][number];

let nextId = 0;
const assistant = (...parts: Part[]): ShelterUIMessage => ({
  id: `a${nextId++}`,
  role: "assistant",
  parts,
});
const user = (text: string): ShelterUIMessage => ({
  id: `u${nextId++}`,
  role: "user",
  parts: [{ type: "text", text }],
});

const findAnimalsDone = (
  matches: { animalId: string; name: string }[],
): Part => ({
  type: "tool-findAnimals",
  toolCallId: "call-find",
  state: "output-available",
  input: { query: "Bruno" },
  output: {
    ok: true,
    matches: matches.map((m) => ({
      ...m,
      species: "Dog",
      birthDate: "2023-04-11",
      currentUnit: null,
    })),
  },
});

const summaryPending = (animalId: string): Part => ({
  type: "tool-getAnimalSummary",
  toolCallId: "call-summary",
  state: "input-available",
  input: { animalId },
});

test("nothing is shown once the turn is over", () => {
  for (const status of ["ready", "error"] as const) {
    assert.equal(
      describeActiveStep({ status, messages: [assistant()] }),
      null,
    );
  }
});

test("a sent message with no response yet shows a generic step", () => {
  assert.equal(
    describeActiveStep({ status: "submitted", messages: [] })?.label,
    "Thinking",
  );
  assert.equal(
    describeActiveStep({ status: "submitted", messages: [user("hi")] })?.label,
    "Thinking",
  );
});

test("a tool in flight is named in human terms, not by tool name", () => {
  const step = describeActiveStep({
    status: "streaming",
    messages: [
      assistant({
        type: "tool-getAttentionQueue",
        toolCallId: "call-queue",
        state: "input-available",
        input: {},
      }),
    ],
  });
  assert.equal(step?.label, "Checking today's attention queue");
});

test("the indicator moves to the newest step rather than accumulating", () => {
  const step = describeActiveStep({
    status: "streaming",
    messages: [
      assistant(
        findAnimalsDone([{ animalId: "a1", name: "Juniper" }]),
        { type: "step-start" },
        summaryPending("a1"),
      ),
    ],
  });
  // One step, and it is the later one — not a log of both.
  assert.equal(step?.label, "Reading Juniper's record");
  assert.equal(step?.key, "call-summary");
});

test("the animal name comes from the prior step's output", () => {
  const names = resolveAnimalNames([
    findAnimalsDone([
      { animalId: "a1", name: "Bruno" },
      { animalId: "a2", name: "Bruno" },
    ]),
  ]);
  assert.equal(names.get("a1"), "Bruno");
  assert.equal(names.get("a2"), "Bruno");
});

test("a name resolved in an earlier turn still labels a later lookup", () => {
  // The real disambiguation shape: turn one resolves the pair, turn two chains
  // into getAnimalSummary with an id the model carried over.
  const step = describeActiveStep({
    status: "streaming",
    messages: [
      user("Tell me about Bruno."),
      assistant(findAnimalsDone([{ animalId: "a1", name: "Bruno" }])),
      user("The one in Dog block A"),
      assistant(summaryPending("a1")),
    ],
  });
  assert.equal(step?.label, "Reading Bruno's record");
});

test("an unresolved id falls back to a generic label instead of guessing", () => {
  const step = describeActiveStep({
    status: "streaming",
    messages: [assistant(summaryPending("never-seen"))],
  });
  assert.equal(step?.label, "Reading the record");
});

test("a partially streamed tool input does not break the label", () => {
  const step = describeActiveStep({
    status: "streaming",
    messages: [
      assistant({
        type: "tool-getAnimalSummary",
        toolCallId: "call-summary",
        state: "input-streaming",
      }),
    ],
  });
  assert.equal(step?.label, "Reading the record");
});

test("the answer replaces the indicator", () => {
  const step = describeActiveStep({
    status: "streaming",
    messages: [
      assistant(findAnimalsDone([{ animalId: "a1", name: "Juniper" }]), {
        type: "text",
        text: "Juniper is a dog",
        state: "streaming",
      }),
    ],
  });
  assert.equal(step, null);
});

test("an empty text block is not yet an answer", () => {
  const step = describeActiveStep({
    status: "streaming",
    messages: [assistant({ type: "text", text: "", state: "streaming" })],
  });
  assert.equal(step?.label, "Thinking");
});

test("a structured tool failure is surfaced with its reason", () => {
  const notes = collectToolFailures([
    {
      type: "tool-getAnimalSummary",
      toolCallId: "call-summary",
      state: "output-available",
      input: { animalId: "nope" },
      output: { ok: false, reason: 'No animal found with id "nope".' },
    },
  ]);
  assert.deepEqual(notes, [
    { toolCallId: "call-summary", reason: 'No animal found with id "nope".' },
  ]);
});

test("a thrown tool error is reported without its server-side text", () => {
  const notes = collectToolFailures([
    {
      type: "tool-findAnimals",
      toolCallId: "call-find",
      state: "output-error",
      input: { query: "Bruno" },
      errorText: "PrismaClientKnownRequestError: connection refused at 10.0.0.4",
    },
  ]);
  assert.equal(notes.length, 1);
  assert.doesNotMatch(notes[0].reason, /Prisma|10\.0\.0\.4/);
});

test("a retried failure is reported once, not once per attempt", () => {
  const failing = (toolCallId: string): Part => ({
    type: "tool-getAttentionQueue",
    toolCallId,
    state: "output-available",
    input: {},
    output: { ok: false, reason: "Something went wrong while running this tool." },
  });

  const notes = collectToolFailures([failing("call-1"), failing("call-2")]);
  assert.equal(notes.length, 1);
});

test("distinct failures are all reported", () => {
  const notes = collectToolFailures([
    {
      type: "tool-findAnimals",
      toolCallId: "call-1",
      state: "output-available",
      input: { query: "x" },
      output: { ok: false, reason: "First problem." },
    },
    {
      type: "tool-getAttentionQueue",
      toolCallId: "call-2",
      state: "output-available",
      input: {},
      output: { ok: false, reason: "Second problem." },
    },
  ]);
  assert.deepEqual(notes.map((n) => n.reason), ["First problem.", "Second problem."]);
});

test("a successful tool leaves no note behind", () => {
  assert.deepEqual(
    collectToolFailures([findAnimalsDone([{ animalId: "a1", name: "Bruno" }])]),
    [],
  );
});
