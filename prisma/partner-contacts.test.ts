// Same reasoning as person-account-unlink.test.ts for living under prisma/ and
// running via `npm run test:db`. What is under test is which rows a partner's
// contacts end up as: the unique index on (partner, person) that a re-add runs
// into, and the partial unique index that allows one primary per partner.
// Neither is observable without a real Postgres enforcing them.
//
// `addContact` and `updateContact` are the whole of the Add and Edit actions
// bar the form parsing, the session check and the cache invalidation, so
// driving them is driving the actions.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { PartnerType, Role } from "@/prisma/generated/enums";
import {
  addContact,
  fetchLinkablePeopleFor,
  primaryContactArgs,
  updateContact,
} from "@/app/lib/services/partner-contact";
import {
  NotFoundError,
  PreconditionFailedError,
} from "@/app/lib/utils/errors";

const runId = Date.now().toString(36);

const partnerIds: string[] = [];
const personIds: string[] = [];

// Nothing to seed: every test makes the partner and people it needs.

after(async () => {
  await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.user.deleteMany({ where: { personId: { in: personIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.$disconnect();
});

const makePartner = async (label: string) => {
  const partner = await prisma.partner.create({
    data: { name: `${label} ${runId}`, type: PartnerType.RESCUE_GROUP },
    select: { id: true },
  });
  partnerIds.push(partner.id);
  return partner.id;
};

const makePerson = async (label: string, role?: Role) => {
  const person = await prisma.person.create({
    data: { name: `${label} ${runId}` },
    select: { id: true },
  });
  personIds.push(person.id);
  if (role) {
    await prisma.user.create({
      data: {
        name: `${label} ${runId}`,
        email: `${label.toLowerCase().replace(/\W+/g, ".")}.${runId}@example.com`,
        emailVerified: true,
        role,
        personId: person.id,
      },
    });
  }
  return person.id;
};

const add = (
  partnerId: string,
  personId: string,
  input: { role?: string | null; isPrimary?: boolean; isActive?: boolean } = {},
) =>
  prisma.$transaction((tx) =>
    addContact(tx, partnerId, personId, {
      role: input.role ?? null,
      isPrimary: input.isPrimary ?? false,
      isActive: input.isActive ?? true,
    }),
  );

const update = (
  partnerId: string,
  contactId: string,
  input: { role?: string | null; isPrimary?: boolean; isActive?: boolean },
) =>
  prisma.$transaction((tx) =>
    updateContact(tx, partnerId, contactId, {
      role: input.role ?? null,
      isPrimary: input.isPrimary ?? false,
      isActive: input.isActive ?? true,
    }),
  );

const rows = (partnerId: string) =>
  prisma.partnerContact.findMany({
    where: { partnerId },
    select: {
      id: true,
      personId: true,
      role: true,
      isPrimary: true,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
  });

/** What the partner's page shows under "Primary Contact". */
const headerPrimary = async (partnerId: string) => {
  const partner = await prisma.partner.findUniqueOrThrow({
    where: { id: partnerId },
    select: { contacts: primaryContactArgs },
  });
  return partner.contacts[0]?.person.id ?? null;
};

test("a person who was never a contact is created with the submitted values", async () => {
  const partnerId = await makePartner("Create");
  const personId = await makePerson("Create Person");

  await add(partnerId, personId, { role: "Director", isPrimary: true });

  assert.deepEqual(
    (await rows(partnerId)).map(({ id: _id, ...rest }) => rest),
    [{ personId, role: "Director", isPrimary: true, isActive: true }],
  );
});

test("re-adding a former contact reactivates the row with the submitted role, primary and active", async () => {
  const partnerId = await makePartner("Readd");
  const personId = await makePerson("Readd Person");
  const { id: contactId } = await add(partnerId, personId, {
    role: "Old role",
    isPrimary: true,
  });
  // Deactivated the way the row menu does: inactive, and no longer primary.
  await prisma.partnerContact.update({
    where: { id: contactId },
    data: { isActive: false, isPrimary: false },
  });

  const readded = await add(partnerId, personId, {
    role: "Intake Coordinator",
    isPrimary: true,
    isActive: true,
  });

  assert.equal(readded.id, contactId, "the same row is brought back");
  assert.deepEqual(
    (await rows(partnerId)).map(({ id: _id, ...rest }) => rest),
    [
      {
        personId,
        role: "Intake Coordinator",
        isPrimary: true,
        isActive: true,
      },
    ],
  );
});

test("re-adding with no role clears the old role, and with Active unticked keeps the contact inactive", async () => {
  const partnerId = await makePartner("Readd inactive");
  const personId = await makePerson("Readd Inactive Person");
  const { id: contactId } = await add(partnerId, personId, {
    role: "Old role",
  });
  await prisma.partnerContact.update({
    where: { id: contactId },
    data: { isActive: false },
  });

  await add(partnerId, personId, { role: null, isActive: false });

  const [row] = await rows(partnerId);
  assert.equal(row.role, null);
  assert.equal(row.isActive, false);
  assert.equal(row.isPrimary, false);
});

test("making a contact primary demotes the old primary", async () => {
  const partnerId = await makePartner("Demote");
  const first = await makePerson("Demote First");
  const second = await makePerson("Demote Second");
  await add(partnerId, first, { isPrimary: true });

  await add(partnerId, second, { isPrimary: true });

  const byPerson = Object.fromEntries(
    (await rows(partnerId)).map((r) => [r.personId, r.isPrimary]),
  );
  assert.deepEqual(byPerson, { [first]: false, [second]: true });
  assert.equal(await headerPrimary(partnerId), second);
});

test("re-adding a former contact as primary demotes the current primary", async () => {
  const partnerId = await makePartner("Readd demote");
  const former = await makePerson("Readd Demote Former");
  const current = await makePerson("Readd Demote Current");
  const { id: formerId } = await add(partnerId, former);
  await prisma.partnerContact.update({
    where: { id: formerId },
    data: { isActive: false },
  });
  await add(partnerId, current, { isPrimary: true });

  await add(partnerId, former, { isPrimary: true });

  const byPerson = Object.fromEntries(
    (await rows(partnerId)).map((r) => [r.personId, r.isPrimary]),
  );
  assert.deepEqual(byPerson, { [former]: true, [current]: false });
});

test("add: Primary with Active unticked saves as inactive and not primary, and leaves the old primary alone", async () => {
  const partnerId = await makePartner("Add inactive primary");
  const primary = await makePerson("Add Inactive Primary Holder");
  const newcomer = await makePerson("Add Inactive Primary Newcomer");
  await add(partnerId, primary, { isPrimary: true });

  await add(partnerId, newcomer, { isPrimary: true, isActive: false });

  const byPerson = Object.fromEntries(
    (await rows(partnerId)).map((r) => [r.personId, r]),
  );
  assert.equal(byPerson[newcomer].isActive, false);
  assert.equal(byPerson[newcomer].isPrimary, false);
  assert.equal(byPerson[primary].isPrimary, true, "the old primary stays");
  assert.equal(await headerPrimary(partnerId), primary);
});

test("update: Primary with Active unticked saves as inactive and not primary", async () => {
  const partnerId = await makePartner("Update inactive primary");
  const personId = await makePerson("Update Inactive Primary Person");
  const { id: contactId } = await add(partnerId, personId, {
    isPrimary: true,
  });

  await update(partnerId, contactId, {
    role: "Left",
    isPrimary: true,
    isActive: false,
  });

  const [row] = await rows(partnerId);
  assert.equal(row.role, "Left");
  assert.equal(row.isActive, false);
  assert.equal(row.isPrimary, false);
  assert.equal(await headerPrimary(partnerId), null);
});

test("update: making a contact primary demotes the other primary and not itself", async () => {
  const partnerId = await makePartner("Update demote");
  const first = await makePerson("Update Demote First");
  const second = await makePerson("Update Demote Second");
  await add(partnerId, first, { isPrimary: true });
  const { id: secondId } = await add(partnerId, second);

  await update(partnerId, secondId, { role: "Lead", isPrimary: true });

  const byPerson = Object.fromEntries(
    (await rows(partnerId)).map((r) => [r.personId, r.isPrimary]),
  );
  assert.deepEqual(byPerson, { [first]: false, [second]: true });
  // Saving the primary again as primary is not a conflict with itself.
  await update(partnerId, secondId, { role: "Lead 2", isPrimary: true });
  assert.equal(await headerPrimary(partnerId), second);
});

test("update refuses a contact that belongs to another partner", async () => {
  const partnerId = await makePartner("Update here");
  const otherId = await makePartner("Update there");
  const personId = await makePerson("Update Elsewhere Person");
  const { id: contactId } = await add(otherId, personId, { role: "Kept" });

  await assert.rejects(
    update(partnerId, contactId, { role: "Changed" }),
    NotFoundError,
  );
  assert.equal((await rows(otherId))[0].role, "Kept");
});

test("the partner's page shows the same primary the Contacts tab lists", async () => {
  const partnerId = await makePartner("Header");
  const first = await makePerson("Header First");
  const second = await makePerson("Header Second");
  assert.equal(await headerPrimary(partnerId), null);

  await add(partnerId, first, { isPrimary: true });
  assert.equal(await headerPrimary(partnerId), first);

  const { id: secondId } = await add(partnerId, second);
  await update(partnerId, secondId, { isPrimary: true });
  assert.equal(await headerPrimary(partnerId), second);

  // Whatever the tab lists as Primary, the page names.
  const listedPrimary = (await rows(partnerId)).filter((r) => r.isPrimary);
  assert.equal(listedPrimary.length, 1);
  assert.equal(listedPrimary[0].personId, await headerPrimary(partnerId));

  // And no save leaves a contact primary-but-inactive.
  const stuck = await prisma.partnerContact.count({
    where: { partnerId, isPrimary: true, isActive: false },
  });
  assert.equal(stuck, 0);
});

test("add refuses an administrator and writes nothing", async () => {
  const partnerId = await makePartner("Admin refused");
  const adminId = await makePerson("Refused Admin", Role.ADMIN);

  await assert.rejects(
    add(partnerId, adminId),
    (error: unknown) =>
      error instanceof PreconditionFailedError &&
      /administrators can't be added/i.test(error.message),
  );
  assert.equal((await rows(partnerId)).length, 0);
});

test("add refuses a person who does not exist", async () => {
  const partnerId = await makePartner("Missing person");
  await assert.rejects(
    add(partnerId, "clxxxxxxxxxxxxxxxxxxxxxxx"),
    NotFoundError,
  );
});

test("the picker omits administrators and active contacts, and flags former contacts", async () => {
  const partnerId = await makePartner("Picker");
  const walkIn = await makePerson("Picker Walk-in");
  const staff = await makePerson("Picker Staff", Role.STAFF);
  const admin = await makePerson("Picker Admin", Role.ADMIN);
  const active = await makePerson("Picker Active Contact");
  const former = await makePerson("Picker Former Contact");
  await add(partnerId, active);
  const { id: formerId } = await add(partnerId, former);
  await prisma.partnerContact.update({
    where: { id: formerId },
    data: { isActive: false },
  });
  // An administrator who is already an active contact, from before the add
  // refused them: not offered either.
  const legacyAdmin = await makePerson("Picker Legacy Admin", Role.ADMIN);
  await prisma.partnerContact.create({
    data: { partnerId, personId: legacyAdmin },
  });

  const people = await fetchLinkablePeopleFor(partnerId);
  const byId = new Map(people.map((p) => [p.id, p]));

  assert.equal(byId.get(walkIn)?.isDeactivatedContactHere, false);
  assert.equal(byId.get(staff)?.isDeactivatedContactHere, false);
  assert.equal(byId.get(former)?.isDeactivatedContactHere, true);
  assert.equal(byId.has(admin), false, "administrators are not offered");
  assert.equal(byId.has(legacyAdmin), false);
  assert.equal(byId.has(active), false, "active contacts are not offered");
});

test("the picker still offers a person who is a contact at a different partner", async () => {
  const partnerId = await makePartner("Picker here");
  const otherId = await makePartner("Picker there");
  const personId = await makePerson("Picker Elsewhere Person");
  await add(otherId, personId);

  const people = await fetchLinkablePeopleFor(partnerId);
  const entry = people.find((p) => p.id === personId);

  assert.ok(entry);
  assert.equal(entry.isDeactivatedContactHere, false);
});

test("two saves that both want to be primary at once leave exactly one primary", async () => {
  const partnerId = await makePartner("Race");
  const people = await Promise.all(
    ["Race A", "Race B", "Race C"].map((label) => makePerson(label)),
  );

  // No primary yet, so without the partner lock none of them demotes anything.
  await Promise.all(people.map((id) => add(partnerId, id, { isPrimary: true })));

  const primaries = (await rows(partnerId)).filter((r) => r.isPrimary);
  assert.equal(primaries.length, 1);
  assert.equal(await headerPrimary(partnerId), primaries[0].personId);
});

test("two adds of the same person at once leave one row", async () => {
  const partnerId = await makePartner("Race same person");
  const personId = await makePerson("Race Same Person");

  await Promise.all([
    add(partnerId, personId, { role: "First" }),
    add(partnerId, personId, { role: "Second" }),
  ]);

  assert.equal((await rows(partnerId)).length, 1);
});
