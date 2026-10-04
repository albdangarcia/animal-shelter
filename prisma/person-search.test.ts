// The person search clause shared by the people directory, the person picker
// and global search, run against real rows: what it finds depends on the
// `phoneNormalized` column the Prisma extension derives on write, which only
// a database can show.
//
// Every query is narrowed to this file's own people, so no other file's rows
// can change what comes back.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import prisma from "@/app/lib/prisma";
import { personSearchWhereClause } from "@/app/lib/data/people-directory/person-search";

const runId = Date.now().toString(36);
// The run id in letters only, for an email whose one digit is chosen below:
// each base-36 character becomes its own pair of letters, so two run ids
// never spell the same.
const runLetters = [...runId]
  .map((c) => {
    const n = parseInt(c, 36);
    return "abcdef"[Math.floor(n / 6)] + "abcdef"[n % 6];
  })
  .join("");

// No seeded person, spec or other DB file uses 212-555-0124.
const PARENS = "(212) 555-0124";
const DOTS = "212.555.0124";
const UNPARSEABLE = `Call the front desk ${runId}`;
// Its only digit is "1", which every stored US number contains: read as a
// phone search, it would find every person here.
const EMAIL = `searcher1.${runLetters}@example.com`;

let parensId: string;
let dotsId: string;
let neighbourId: string;
let unparseableId: string;
let emailId: string;

const makePerson = async (name: string, phone: string, email?: string) =>
  (
    await prisma.person.create({
      data: { name: `${name} ${runId}`, phone, email },
      select: { id: true },
    })
  ).id;

before(async () => {
  parensId = await makePerson("Search parens", PARENS);
  dotsId = await makePerson("Search dots", DOTS);
  // One digit off the pair, so a query that matched too loosely would find it.
  neighbourId = await makePerson("Search neighbour", "(212) 555-0125");
  unparseableId = await makePerson("Search unparseable", UNPARSEABLE);
  emailId = await makePerson("Search email", "(212) 555-0126", EMAIL);
});

// Guarded by the ids it filters on: after a failed setup an id is undefined,
// and an empty list must not reach a delete.
after(async () => {
  try {
    const ids = [parensId, dotsId, neighbourId, unparseableId, emailId].filter(
      Boolean,
    );
    if (ids.length > 0) {
      await prisma.person.deleteMany({ where: { id: { in: ids } } });
    }
  } finally {
    await prisma.$disconnect();
  }
});

const found = async (query: string) => {
  const ids = [parensId, dotsId, neighbourId, unparseableId, emailId];
  const rows = await prisma.person.findMany({
    where: { AND: [personSearchWhereClause(query), { id: { in: ids } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id).sort();
};

test("a punctuated query and a partial digit run spanning punctuation find both stored formats", async () => {
  const both = [parensId, dotsId].sort();
  // A raw `contains` on this query matches the parenthesized row alone.
  assert.deepEqual(await found(PARENS), both);
  // Spans "555-0124" and "555.0124", so a raw `contains` matches neither.
  assert.deepEqual(await found("5550124"), both);
});

test("an unparseable phone is kept verbatim, found by part of its text in any case, and has no normalized number", async () => {
  assert.deepEqual(await found("the FRONT desk"), [unparseableId]);
  const person = await prisma.person.findUniqueOrThrow({
    where: { id: unparseableId },
    select: { phone: true, phoneNormalized: true },
  });
  assert.equal(person.phone, UNPARSEABLE, "kept verbatim");
  assert.equal(person.phoneNormalized, null);
});

test("an email with a stray digit finds that person alone", async () => {
  assert.deepEqual(await found(EMAIL), [emailId]);
});
