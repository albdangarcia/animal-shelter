import { test } from "node:test";
import assert from "node:assert/strict";
import { personSearchWhereClause } from "./person-search";

// The `phoneNormalized` condition the clause adds for a query, wherever it
// sits in the filter; undefined when the query is not a phone search.
const phoneCondition = (query: string) => {
  const find = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = find(child);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    if (node && typeof node === "object") {
      if ("phoneNormalized" in node) return node.phoneNormalized;
      return find(Object.values(node));
    }
    return undefined;
  };
  return find(personSearchWhereClause(query));
};

test("an email with a stray digit adds no phone condition", () => {
  assert.equal(phoneCondition("surrenderer1@example.com"), undefined);
});

test("a query with letters adds no phone condition, however many digits it has", () => {
  assert.equal(phoneCondition("Apt 2125"), undefined);
  assert.equal(phoneCondition("jane.2125550188@example.com"), undefined);
});

test("a phone search needs at least four digits", () => {
  assert.equal(phoneCondition("018"), undefined);
  assert.equal(phoneCondition("(21) 8"), undefined);
  assert.deepEqual(phoneCondition("0188"), { contains: "0188" });
});

test("punctuation is stripped from the digits that are searched", () => {
  assert.deepEqual(phoneCondition("(212) 555-0188"), { contains: "2125550188" });
  assert.deepEqual(phoneCondition(" +1 212.555.0188 "), {
    contains: "12125550188",
  });
});
