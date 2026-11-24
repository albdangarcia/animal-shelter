import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { PartnerType } from "@/prisma/generated/enums";
import {
  isHomeCountry,
  PartnerFormSchema,
  type PartnerFormInput,
} from "./partners-directory.schemas";
import { COUNTRIES, countryName, isCountryCode } from "@/app/lib/constants/countries";

const partner = (values: Partial<PartnerFormInput>): PartnerFormInput => ({
  name: "Harbor Rescue",
  type: PartnerType.RESCUE_GROUP,
  ...values,
});

const fieldErrorsOf = (values: PartnerFormInput) => {
  const result = PartnerFormSchema.safeParse(values);
  assert.equal(result.success, false);
  if (result.success) throw new Error("unreachable");
  return z.flattenError(result.error).fieldErrors;
};

const STATE_OUTSIDE_US = "Only a partner in the United States has a state.";

test("PartnerFormSchema: a US partner, with no country or US, may have a state", () => {
  for (const country of [undefined, "", "US"]) {
    assert.equal(PartnerFormSchema.safeParse(partner({ country, state: "NY" })).success, true);
    assert.equal(PartnerFormSchema.safeParse(partner({ country, state: "" })).success, true);
    assert.equal(PartnerFormSchema.safeParse(partner({ country })).success, true);
  }
});

test("PartnerFormSchema: a US partner's state must be a US state code", () => {
  assert.deepEqual(fieldErrorsOf(partner({ country: "US", state: "ON" })), {
    state: ["Please select a valid US state."],
  });
});

test("PartnerFormSchema: a partner outside the US has a country and no state", () => {
  assert.equal(PartnerFormSchema.safeParse(partner({ country: "CA" })).success, true);
  assert.equal(PartnerFormSchema.safeParse(partner({ country: "MX", state: "" })).success, true);
  // A state with another country is refused under State, even a real US one.
  assert.deepEqual(fieldErrorsOf(partner({ country: "CA", state: "NY" })), {
    state: [STATE_OUTSIDE_US],
  });
});

test("PartnerFormSchema: the country is an ISO 3166-1 alpha-2 code", () => {
  for (const country of ["ca", "CAN", "Canada", "XK", "ZZ"]) {
    assert.deepEqual(
      fieldErrorsOf(partner({ country })),
      { country: ["Please select a valid country."] },
      country,
    );
  }
});

test("isHomeCountry: no country and US are the US, any other code is not", () => {
  assert.equal(isHomeCountry(undefined), true);
  assert.equal(isHomeCountry(""), true);
  assert.equal(isHomeCountry("US"), true);
  assert.equal(isHomeCountry("CA"), false);
  assert.equal(isHomeCountry("PR"), false);
});

test("COUNTRIES: the 249 ISO 3166-1 alpha-2 codes, each once, with a name", () => {
  assert.equal(COUNTRIES.length, 249);
  assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, 249);
  for (const { code, name } of COUNTRIES) {
    assert.match(code, /^[A-Z]{2}$/);
    assert.notEqual(name, code);
  }
  assert.equal(isCountryCode("US"), true);
  assert.equal(isCountryCode("XK"), false);
  assert.equal(countryName("CA"), "Canada");
  assert.equal(countryName("US"), "United States");
  // A code not in the list prints as itself rather than nothing.
  assert.equal(countryName("ZZ"), "ZZ");
});
