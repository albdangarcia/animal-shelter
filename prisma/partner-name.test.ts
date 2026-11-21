// What the Partner Directory refuses for a name: one another partner already
// has in other capitals (adding or renaming), an inactive partner's included.
// `_`, `%` and `\` in a name are plain characters, and a name that only
// contains another is free. An edit that keeps the name is not refused, even
// when a case-variant twin exists.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { PartnerType } from "@/prisma/generated/enums";
import {
  findPartnerNamed,
  PARTNER_NAME_TAKEN,
  partnerNameRefusal,
} from "@/app/lib/services/partner-name";

const runId = Date.now().toString(36);
const partnerIds: string[] = [];

after(async () => {
  await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.$disconnect();
});

const makePartner = async (name: string, isActive = true) => {
  const row = await prisma.partner.create({
    data: { name, type: PartnerType.VET_CLINIC, isActive },
    select: { id: true, name: true },
  });
  partnerIds.push(row.id);
  return row;
};

test("adding is refused for a name that differs only in capitals", async () => {
  await makePartner(`Walk Vet Clinic ${runId}`);

  for (const name of [
    `walk vet clinic ${runId}`,
    `WALK VET CLINIC ${runId}`,
    `Walk Vet Clinic ${runId}`,
  ]) {
    assert.equal(
      await partnerNameRefusal(prisma, name),
      PARTNER_NAME_TAKEN,
      name,
    );
  }
});

test("adding is refused for an inactive partner's name", async () => {
  await makePartner(`Retired Rescue ${runId}`, false);

  assert.equal(
    await partnerNameRefusal(prisma, `retired rescue ${runId}`),
    PARTNER_NAME_TAKEN,
  );
});

test("names are compared trimmed, on both sides", async () => {
  await makePartner(`Padded Shelter ${runId} `);
  // The form does not trim what it saves, so a stored name can end in a tab
  // or a pasted no-break space; `btrim(name)` alone would leave those on.
  await makePartner(`Tabbed Shelter ${runId}\t`);
  await makePartner(`\u00a0Nbsp Shelter ${runId}\u00a0`);

  for (const name of [
    `  padded shelter ${runId}`,
    `tabbed shelter ${runId}`,
    `\ttabbed shelter ${runId} `,
    `nbsp shelter ${runId}`,
    ` NBSP SHELTER ${runId}\u00a0`,
  ]) {
    assert.equal(
      await partnerNameRefusal(prisma, name),
      PARTNER_NAME_TAKEN,
      JSON.stringify(name),
    );
  }
});

test("a name that only contains another is free", async () => {
  await makePartner(`Maple Rescue ${runId}`);

  for (const name of [
    `Maple Rescue ${runId} East`,
    `Old Maple Rescue ${runId}`,
    `Maple Rescue ${runId.slice(1)}`,
  ]) {
    assert.equal(await partnerNameRefusal(prisma, name), null, name);
  }
});

test("_ and % typed in a name are not wildcards", async () => {
  // Only the lookalikes are stored. An ILIKE reads the typed name as the
  // pattern, so `Pet_x` would match the stored `Petzx`, `Fifty%off` the stored
  // `Fiftyxyzoff` and a lone `%` anything at all; each lookup must find nothing.
  await makePartner(`Petzx ${runId}`);
  await makePartner(`Fiftyxyzoff ${runId}`);

  assert.equal(await findPartnerNamed(prisma, `Pet_x ${runId}`), null);
  assert.equal(await findPartnerNamed(prisma, `Fifty%off ${runId}`), null);
  assert.equal(await findPartnerNamed(prisma, `%${runId}`), null);
  assert.equal(await partnerNameRefusal(prisma, `Pet_x ${runId}`), null);
});

test("_, % and \\ in a stored name are found as themselves", async () => {
  const underscore = await makePartner(`Under_score ${runId}`);
  const percent = await makePartner(`Per%cent ${runId}`);
  const backslash = await makePartner(`Back\\ ${runId}`);

  assert.equal(
    (await findPartnerNamed(prisma, `under_SCORE ${runId}`))?.id,
    underscore.id,
  );
  assert.equal(
    (await findPartnerNamed(prisma, `PER%CENT ${runId}`))?.id,
    percent.id,
  );
  assert.equal(
    (await findPartnerNamed(prisma, `back\\ ${runId}`))?.id,
    backslash.id,
  );
});

test("a rename to a case-variant of another partner is refused", async () => {
  const other = await makePartner(`Harbor Shelter ${runId}`);
  const mine = await makePartner(`Dock Shelter ${runId}`);

  assert.equal(
    await partnerNameRefusal(prisma, `HARBOR SHELTER ${runId}`, mine),
    PARTNER_NAME_TAKEN,
  );
  assert.equal(
    (await findPartnerNamed(prisma, `harbor shelter ${runId}`, mine.id))?.id,
    other.id,
  );
});

test("an edit that keeps the name is not refused, even with a twin", async () => {
  // Two names that differ only in capitals can already exist (rows from
  // before the check, or a write that raced it). The edit of one of them
  // must still save when its name is unchanged.
  const upper = await makePartner(`Twin Clinic ${runId}`);
  const lower = await makePartner(`twin clinic ${runId}`);

  assert.equal(await partnerNameRefusal(prisma, upper.name, upper), null);
  assert.equal(await partnerNameRefusal(prisma, lower.name, lower), null);

  // Changing the capitals of the name is a rename, so it is checked: it now
  // collides with the other twin.
  assert.equal(
    await partnerNameRefusal(prisma, `TWIN CLINIC ${runId}`, upper),
    PARTNER_NAME_TAKEN,
  );
});

test("a rename that only changes its own capitals is not refused", async () => {
  const mine = await makePartner(`Solo Rescue ${runId}`);

  // The partner itself is excluded, so it is not its own twin.
  assert.equal(
    await partnerNameRefusal(prisma, `SOLO RESCUE ${runId}`, mine),
    null,
  );
  assert.equal(
    await findPartnerNamed(prisma, `solo rescue ${runId}`, mine.id),
    null,
  );
  assert.equal(
    (await findPartnerNamed(prisma, `solo rescue ${runId}`))?.id,
    mine.id,
  );
});
