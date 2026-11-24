// What a partner is saved with for its country and state: a US partner (no
// country, or "US") keeps its state and stores no country; a partner
// elsewhere stores its country and never a state. Saving goes through the
// schema first, as the actions do, so a state with another country is
// refused before anything is written. The list's State / Country column
// sorts by what it shows. Every partner here is deleted at the end.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { PartnerType } from "@/prisma/generated/enums";
import {
  PartnerFormSchema,
  type PartnerFormInput,
} from "@/app/lib/zod-schemas/partners-directory.schemas";
import {
  createPartnerRecord,
  updatePartnerRecord,
} from "@/app/lib/services/partner-record";
import { partnersOrderBy } from "@/app/lib/data/partners-directory/partners-directory";

const runId = Date.now().toString(36);
const partnerIds: string[] = [];
let count = 0;

after(async () => {
  await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.$disconnect();
});

const form = (values: Partial<PartnerFormInput>): PartnerFormInput => ({
  name: `Country Rescue ${runId} ${++count}`,
  type: PartnerType.RESCUE_GROUP,
  ...values,
});

/** Parses `values` as the actions do, then saves a new partner from them. */
const create = async (values: PartnerFormInput) => {
  const { id } = await createPartnerRecord(prisma, PartnerFormSchema.parse(values));
  partnerIds.push(id);
  return id;
};

const stored = (id: string) =>
  prisma.partner.findUniqueOrThrow({
    where: { id },
    select: { state: true, country: true },
  });

test("a US partner is saved with its state and no country", async () => {
  // The form sends "US"; a payload with no country, or an empty one, is the US too.
  for (const country of ["US", "", undefined]) {
    const id = await create(form({ country, state: "NY" }));
    assert.deepEqual(await stored(id), { state: "NY", country: null }, String(country));
  }
  const noState = await create(form({ country: "US", state: "" }));
  assert.deepEqual(await stored(noState), { state: null, country: null });
});

test("a partner in a US territory is a US partner, saved with the territory as its state", async () => {
  const id = await create(form({ country: "US", state: "PR" }));
  assert.deepEqual(await stored(id), { state: "PR", country: null });
});

test("a partner outside the US is saved with its country and no state", async () => {
  const id = await create(form({ country: "CA", state: "" }));
  assert.deepEqual(await stored(id), { state: null, country: "CA" });
});

test("a state with a country outside the US is refused, and nothing is saved", async () => {
  const values = form({ country: "MX", state: "TX" });
  const parsed = PartnerFormSchema.safeParse(values);
  assert.equal(parsed.success, false);
  assert.equal(await prisma.partner.count({ where: { name: values.name } }), 0);
});

test("even past the schema, a partner outside the US never stores a state", async () => {
  // The service drops it, so no row says both a country and a state.
  const { id } = await createPartnerRecord(prisma, form({ country: "MX", state: "TX" }));
  partnerIds.push(id);
  assert.deepEqual(await stored(id), { state: null, country: "MX" });
});

test("moving a partner abroad clears its state, and moving it back clears its country", async () => {
  const values = form({ country: "US", state: "VT" });
  const id = await create(values);

  await updatePartnerRecord(
    prisma,
    id,
    PartnerFormSchema.parse({ ...values, country: "CA", state: "" }),
  );
  assert.deepEqual(await stored(id), { state: null, country: "CA" });

  await updatePartnerRecord(
    prisma,
    id,
    PartnerFormSchema.parse({ ...values, country: "US", state: "ME" }),
  );
  assert.deepEqual(await stored(id), { state: "ME", country: null });
});

test("the State / Country column sorts US partners by state, then the rest by country", async () => {
  const tag = `Sort ${runId}`;
  const make = async (suffix: string, country: string, state: string) => {
    const id = await create({
      name: `${tag} ${suffix}`,
      type: PartnerType.SHELTER,
      country,
      state,
    });
    return id;
  };
  // Made out of order, so creation order can't pass for the sort.
  await make("mx", "MX", "");
  await make("vt", "US", "VT");
  await make("ca", "CA", "");
  await make("me-b", "US", "ME");
  await make("me-a", "US", "ME");

  const names = async (sort: string) =>
    (
      await prisma.partner.findMany({
        where: { name: { startsWith: tag } },
        orderBy: partnersOrderBy(sort),
        select: { name: true },
      })
    ).map((p) => p.name.slice(tag.length + 1));

  // Partners in one state keep name order either way.
  assert.deepEqual(await names("state.asc"), ["me-a", "me-b", "vt", "ca", "mx"]);
  assert.deepEqual(await names("state.desc"), ["mx", "ca", "vt", "me-a", "me-b"]);
});
