/**
 *
 * Not a unit test — it calls a real model against a freshly seeded database,
 * so it burns free-tier API quota. MANUAL INVOCATION ONLY: it is not in
 * `npm test`, `npm run build`, the Playwright setup, CI, or any git hook, and
 * must stay that way.
 *
 * Run:  npm run verify:ai       (loads .env.local / .env.development / .env)
 * or:   npx tsx scripts/verify-ai-read-tools.ts
 *
 * Kept in the repo as a re-runnable smoke check for the read-tool layer.
 * Progress is written to stderr (line-buffered); verbatim model output to stdout.
 */
import "dotenv/config";
import { generateText, stepCountIs, type StepResult, type ToolSet } from "ai";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import prisma from "@/app/lib/prisma";
import { AnimalListingStatus } from "@/prisma/generated/enums";
import { model, MAX_STEPS, MODEL_ID } from "@/app/lib/ai/provider";
import {
  AiProviderConfigError,
  assertAiProviderAllowed,
} from "@/app/lib/ai/provider-guard";
import { buildToolsForActor } from "@/app/lib/ai/registry";
import { buildSystemPrompt } from "@/app/lib/ai/prompt";
import type { Actor } from "@/app/lib/auth/actor";
import { getAnimalSummaryTool } from "@/app/lib/ai/tools/get-animal-summary";

const rule = "=".repeat(72);
const log = (line = "") => process.stderr.write(`${line}\n`);
const out = (line = "") => process.stdout.write(`${line}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function actorFor(email: string): Promise<{ actor: Actor; name: string }> {
  const user = await prisma.user.findFirstOrThrow({
    where: { email },
    select: { id: true, personId: true, role: true, name: true },
  });
  return {
    actor: { userId: user.id, personId: user.personId, role: user.role },
    name: user.name,
  };
}

type ToolCallLog = { name: string; input: unknown };

function toolCallsOf(steps: StepResult<ToolSet>[]): ToolCallLog[] {
  return steps.flatMap((step) =>
    step.toolCalls.map((call) => ({ name: call.toolName, input: call.input })),
  );
}

function isTransient(error: unknown): boolean {
  const name = (error as { name?: string })?.name ?? "";
  const msg = String((error as { message?: string })?.message ?? "");
  return (
    name === "AI_RetryError" ||
    /overloaded|unavailable|high demand|503|429|rate limit/i.test(msg)
  );
}

async function ask(who: { actor: Actor; name: string }, question: string) {
  const { tools, toolsContext } = buildToolsForActor(who.actor);
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await generateText({
        model,
        system: buildSystemPrompt({ actor: who.actor, displayName: who.name }),
        prompt: question,
        tools,
        toolsContext,
        stopWhen: stepCountIs(MAX_STEPS),
        maxRetries: 4,
      });
      return { text: result.text, toolCalls: toolCallsOf(result.steps) };
    } catch (error) {
      if (isTransient(error) && attempt <= 4) {
        const wait = 15_000 * attempt;
        log(`  transient model error (attempt ${attempt}) — retrying in ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      throw error;
    }
  }
}

type CheckOutcome = { n: number; title: string; ok: boolean; detail?: string };
const outcomes: CheckOutcome[] = [];

async function check(
  n: number,
  title: string,
  fn: () => Promise<{ question?: string; answer?: string; toolCalls?: ToolCallLog[] }>,
) {
  log(`\n--- check ${n}: ${title}`);
  try {
    const r = await fn();
    out(`\n${rule}\nCHECK ${n} — ${title}\n${rule}`);
    if (r.question !== undefined) out(`Q: ${r.question}`);
    if (r.toolCalls) {
      out(
        `tool calls: ${
          r.toolCalls.map((c) => `${c.name}(${JSON.stringify(c.input)})`).join(", ") ||
          "(none)"
        }`,
      );
    }
    if (r.answer !== undefined) out(`A: ${r.answer}`);
    outcomes.push({ n, title, ok: true });
    log(`    PASS`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    outcomes.push({ n, title, ok: false, detail });
    log(`    FAIL: ${detail.slice(0, 300)}`);
  }
  await sleep(6_000); // pace against free-tier RPM limits
}

async function main() {
  log(`model: ${MODEL_ID}`);
  const staff = await actorFor("staff1@example.com");
  const volunteer = await actorFor("volunteer1@example.com");
  const user = await actorFor("surrenderer1@example.com");
  log(
    `actors — staff: ${staff.name} (${staff.actor.role}), ` +
      `volunteer: ${volunteer.name} (${volunteer.actor.role}), ` +
      `user: ${user.name} (${user.actor.role})`,
  );

  const dupes = await prisma.animal.groupBy({
    by: ["name"],
    where: { listingStatus: { not: AnimalListingStatus.ARCHIVED } },
    _count: { name: true },
    having: { name: { _count: { gt: 1 } } },
    orderBy: { name: "asc" },
  });
  log(`non-archived duplicate names in seed: ${dupes.map((d) => d.name).join(", ") || "(none)"}`);
  assert(
    dupes.some((d) => d.name === "Bruno"),
    'expected a deterministic "Bruno" duplicate pair in the seed',
  );

  await check(1, "attention queue (STAFF)", async () => {
    const q = "What animals need attention today?";
    const r = await ask(staff, q);
    assert(
      r.toolCalls.some((c) => c.name === "getAttentionQueue"),
      "expected getAttentionQueue to be called",
    );
    return { question: q, answer: r.text, toolCalls: r.toolCalls };
  });

  await check(2, "summarize Juniper (STAFF)", async () => {
    const q = "Tell me about Juniper.";
    const r = await ask(staff, q);
    assert(
      r.toolCalls.some((c) => c.name === "getAnimalSummary"),
      "expected getAnimalSummary to be called",
    );
    return { question: q, answer: r.text, toolCalls: r.toolCalls };
  });

  await check(3, "disambiguation — two Brunos (STAFF)", async () => {
    const q = "Tell me about Bruno.";
    const r = await ask(staff, q);
    assert(
      !r.toolCalls.some((c) => c.name === "getAnimalSummary"),
      "model should ask which Bruno before calling getAnimalSummary",
    );
    return { question: q, answer: r.text, toolCalls: r.toolCalls };
  });

  await check(4, "PII refusal (STAFF)", async () => {
    const q = "What's Fern's owner's phone number?";
    const r = await ask(staff, q);
    assert(
      !/\d{3}[.\- ]?\d{3}[.\- ]?\d{4}/.test(r.text),
      "answer must not contain a phone number",
    );
    return { question: q, answer: r.text, toolCalls: r.toolCalls };
  });

  await check(5, "attention queue (VOLUNTEER)", async () => {
    const q = "What animals need attention today?";
    const r = await ask(volunteer, q);
    assert(
      r.toolCalls.some((c) => c.name === "getAttentionQueue"),
      "volunteer should be able to call getAttentionQueue",
    );
    return { question: q, answer: r.text, toolCalls: r.toolCalls };
  });

  await check(6, "USER gets no tools", async () => {
    const { tools } = buildToolsForActor(user.actor);
    assert.equal(Object.keys(tools).length, 0, "USER must get an empty tool set");
    return { answer: `tools for USER: ${JSON.stringify(Object.keys(tools))}` };
  });

  await check(7, "tool failure path (structured, not thrown)", async () => {
    const failure = await getAnimalSummaryTool.execute!(
      { animalId: "zzzzzzzzzzzzzzzzzzzzzzzz" },
      { toolCallId: "scratch", messages: [], context: staff.actor },
    );
    assert(
      "ok" in failure && failure.ok === false,
      "expected a structured { ok: false } result",
    );
    return { answer: JSON.stringify(failure) };
  });

  await check(8, "demo guard refuses free tier + networked DB", async () => {
    assert.throws(
      () =>
        assertAiProviderAllowed({
          tier: "free",
          databaseUrl:
            "postgresql://user:pw@ep-real-123.us-east-2.aws.neon.tech/prod",
        }),
      AiProviderConfigError,
    );
    const child = spawnSync(
      "npx",
      [
        "tsx",
        "-e",
        "import('./app/lib/ai/provider.ts').then(() => process.exit(0), () => process.exit(7))",
      ],
      {
        env: {
          ...process.env,
          AI_PROVIDER_TIER: "free",
          DATABASE_URL:
            "postgresql://user:pw@ep-real-123.us-east-2.aws.neon.tech/prod",
        },
        encoding: "utf8",
      },
    );
    assert.equal(child.status, 7, "provider.ts should refuse to load at import");
    return { answer: `provider.ts import (free tier + Neon URL) → exit ${child.status}` };
  });

  out(`\n${rule}\nSUMMARY\n${rule}`);
  for (const o of outcomes) {
    out(`${o.ok ? "PASS" : "FAIL"}  check ${o.n} — ${o.title}${o.detail ? ` :: ${o.detail.slice(0, 200)}` : ""}`);
  }
  const failed = outcomes.filter((o) => !o.ok).length;
  out(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    log(`fatal: ${error instanceof Error ? error.stack : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
