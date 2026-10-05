import { beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import CategoryList from "@/components/public-pages/pets/category-list";
import { SexOptions, SizeOptions } from "@/components/public-pages/pets/pets-filter-options";
import { ResetFilters } from "@/components/public-pages/pets/reset-filters";
import Search from "@/components/search";
import { ServerSideFacetedFilter } from "@/components/table-common/server-side-faceted-filter";
import { ServerSideSort } from "@/components/table-common/server-side-sort";
import type { SpeciesModel } from "@/prisma/generated/models/Species";
import {
  currentUrl,
  resetNavigation,
  routerCalls,
  setUrl,
} from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The /pets filter bar: the species pills, the search box and Reset, which
// only /pets uses, beside the shared faceted filters and sort
// (server-side-filters.test.tsx owns what those write). Every control reads
// its state from the URL on every render, so a Reset clears them all; a
// control that kept its own state would go on showing a filter the URL no
// longer has. The browser keeps the page's wiring, that each control is given
// the parameter the server reads, and the back button
// (tests/e2e/pets/filter-reset.spec.ts).
//
// The test page is narrow, so a faceted trigger shows its phone layout: the
// count badge and the labels are both in its text, as in "Color1Black".

const SPECIES = [
  { id: "dog", name: "Dog" },
  { id: "bird", name: "Bird" },
] as SpeciesModel[];

const COLORS = [
  { label: "Black", value: "Black" },
  { label: "White", value: "White" },
];

// app/(publicpages)/pets/page.tsx's options and Reset keys.
const SORT_OPTIONS = [
  { label: "Newest", value: "createdAt.desc" },
  { label: "Oldest", value: "createdAt.asc" },
  { label: "Youngest", value: "birthDate.desc" },
  { label: "Oldest pets", value: "birthDate.asc" },
  { label: "Name A–Z", value: "name.asc" },
];
const FILTER_PARAM_KEYS = ["query", "category", "color", "sex", "size", "sort"];

// The bar as page.tsx composes it, without the styling props.
const FilterBar = () => (
  <>
    <CategoryList species={SPECIES} />
    <Search placeholder="Search by name or breed" />
    <ServerSideFacetedFilter title="Color" paramKey="color" options={COLORS} />
    <ServerSideFacetedFilter title="Sex" paramKey="sex" options={SexOptions} />
    <ServerSideFacetedFilter title="Size" paramKey="size" options={SizeOptions} />
    <ServerSideSort paramKey="sort" placeholder="Sort by" options={SORT_OPTIONS} />
    <ResetFilters filterParamKeys={FILTER_PARAM_KEYS} />
  </>
);

const pill = (name: string) =>
  page.getByRole("group", { name: "Species" }).getByRole("button", { name, exact: true });
const facetTrigger = (title: string) =>
  page.getByRole("button", { name: new RegExp(`^${title}`) });
const sortTrigger = () => page.getByRole("combobox", { name: "Sort by:" });
const searchBox = () => page.getByRole("searchbox");
const resetButton = () => page.getByRole("button", { name: "Reset" });

/** Waits until the fake router's URL reads exactly `expected`. */
const expectUrl = (expected: string) => expect.poll(currentUrl).toBe(expected);

const expectPressed = async (pressed: string, notPressed: string) => {
  await expect.element(pill(pressed)).toHaveAttribute("aria-pressed", "true");
  await expect.element(pill(notPressed)).toHaveAttribute("aria-pressed", "false");
};

beforeEach(() => {
  resetNavigation("/pets");
});

test("a species pill writes its category back on page 1, keeping the others; All deletes it", async () => {
  resetNavigation("/pets?query=bud&page=3");
  await render(<FilterBar />);
  await expectPressed("All", "Bird");

  await pill("Bird").click();
  await expectUrl("/pets?query=bud&page=1&category=Bird");
  await expectPressed("Bird", "All");

  await pill("All").click();
  await expectUrl("/pets?query=bud&page=1");
  await expectPressed("All", "Bird");

  expect(routerCalls).toEqual([
    { method: "replace", href: "/pets?query=bud&page=1&category=Bird" },
    { method: "replace", href: "/pets?query=bud&page=1" },
  ]);

  // A navigation the pills did not cause.
  setUrl("/pets?category=Dog");
  await expectPressed("Dog", "All");
});

// The removed browser test's clicks, in its order: the species, then the
// page's three faceted filters and the sort, each with its own key. What one
// control does with its key is server-side-filters.test.tsx's; this checks
// that none writes another's or drops one written before it.
test("the species, Color, Sex, Size and sort each write their own parameter, keeping the ones before", async () => {
  resetNavigation("/pets?query=bud&page=3");
  await render(<FilterBar />);

  const pick = async (title: string, name: string) => {
    await facetTrigger(title).click();
    await page.getByRole("option", { name, exact: true }).click();
    await userEvent.keyboard("{Escape}");
  };

  const written = [
    "/pets?query=bud&page=1&category=Dog",
    "/pets?query=bud&page=1&category=Dog&color=Black",
    "/pets?query=bud&page=1&category=Dog&color=Black&sex=MALE",
    "/pets?query=bud&page=1&category=Dog&color=Black&sex=MALE&size=SMALL",
    "/pets?query=bud&page=1&category=Dog&color=Black&sex=MALE&size=SMALL&sort=createdAt.asc",
  ];
  await pill("Dog").click();
  await expectUrl(written[0]);
  await pick("Color", "Black");
  await expectUrl(written[1]);
  // exact: "Male" also matches "Female" otherwise.
  await pick("Sex", "Male");
  await expectUrl(written[2]);
  await pick("Size", "Small");
  await expectUrl(written[3]);
  // exact: "Oldest" also matches "Oldest pets" otherwise.
  await sortTrigger().click();
  await page.getByRole("option", { name: "Oldest", exact: true }).click();
  await expectUrl(written[4]);

  expect(routerCalls).toEqual(written.map((href) => ({ method: "replace", href })));
  await expectPressed("Dog", "All");
  await expect.element(sortTrigger()).toHaveTextContent("Oldest");
});

// The debounce is the real 300ms: faking timers would stall it and Radix. It
// is timed inside the page, from the box's input event to the navigation, so
// a slow test runner cannot make it pass or fail. One `fill` is one input
// event: typing key by key, a runner slower than the debounce between two keys
// would navigate mid-word and remount the box under the next key.
test("the search box writes the typed query once typing stops, back on page 1, keeping the others; emptied, it deletes it; and it follows the URL", async () => {
  resetNavigation("/pets?category=Dog&color=Black&sort=createdAt.asc&page=3");
  await render(<FilterBar />);

  // Unset until seen, so a missed event fails the read below rather than
  // timing from page load. On the document, and checked against the box as it
  // is when the event fires, so a remount cannot hide one.
  let inputAt: number | undefined;
  const onInput = (event: Event) => {
    if (event.target === searchBox().element()) inputAt = performance.now();
  };
  let navigatedAt: number | undefined;
  const recordCall = vi
    .spyOn(routerCalls, "push")
    .mockImplementation((...calls) => {
      navigatedAt = performance.now();
      return Array.prototype.push.apply(routerCalls, calls);
    });
  document.addEventListener("input", onInput, true);
  try {
    await userEvent.fill(searchBox(), "bud");
    await expectUrl("/pets?category=Dog&color=Black&sort=createdAt.asc&page=1&query=bud");
  } finally {
    document.removeEventListener("input", onInput, true);
    recordCall.mockRestore();
  }
  expect(inputAt).toBeTypeOf("number");
  expect(navigatedAt).toBeTypeOf("number");
  // 300ms, less a margin for the timer's own rounding.
  expect(navigatedAt! - inputAt!).toBeGreaterThanOrEqual(280);

  // The box is uncontrolled: only a remount on the URL's query empties it.
  setUrl("/pets");
  await expect.element(searchBox()).toHaveValue("");

  setUrl("/pets?category=Dog&query=rex&page=3");
  await expect.element(searchBox()).toHaveValue("rex");
  await userEvent.fill(searchBox(), "max");
  await expectUrl("/pets?category=Dog&query=max&page=1");
  await userEvent.fill(searchBox(), "");
  await expectUrl("/pets?category=Dog&page=1");

  expect(routerCalls).toEqual([
    {
      method: "replace",
      href: "/pets?category=Dog&color=Black&sort=createdAt.asc&page=1&query=bud",
    },
    { method: "replace", href: "/pets?category=Dog&query=max&page=1" },
    { method: "replace", href: "/pets?category=Dog&page=1" },
  ]);
});

test("Reset pushes the bare path, and every control clears", async () => {
  resetNavigation(
    "/pets?category=Dog&color=Black&sex=MALE&size=SMALL&sort=createdAt.asc&query=bud",
  );
  await render(<FilterBar />);

  await expectPressed("Dog", "All");
  await expect.element(facetTrigger("Color")).toHaveTextContent("Color1Black");
  await expect.element(facetTrigger("Sex")).toHaveTextContent("Sex1Male");
  await expect.element(facetTrigger("Size")).toHaveTextContent("Size1Small");
  await expect.element(sortTrigger()).toHaveTextContent("Oldest");
  await expect.element(searchBox()).toHaveValue("bud");

  await resetButton().click();

  expect(routerCalls).toEqual([{ method: "push", href: "/pets" }]);
  expect(currentUrl()).toBe("/pets");
  await expectPressed("All", "Dog");
  await expect.element(facetTrigger("Color")).toHaveTextContent("Color");
  await expect.element(facetTrigger("Sex")).toHaveTextContent("Sex");
  await expect.element(facetTrigger("Size")).toHaveTextContent("Size");
  await expect.element(sortTrigger()).toHaveTextContent("Newest");
  await expect.element(searchBox()).toHaveValue("");
  await expect.element(resetButton()).not.toBeInTheDocument();
});

test("Reset is offered while any one filter key is in the URL, and not for page alone", async () => {
  resetNavigation("/pets?page=2");
  await render(<FilterBar />);
  // The bar has rendered, so Reset's absence means something.
  await expect.element(pill("All")).toBeVisible();
  await expect.element(resetButton()).not.toBeInTheDocument();

  const oneKey = {
    query: "bud",
    category: "Dog",
    color: "Black",
    sex: "MALE",
    size: "SMALL",
    sort: "createdAt.asc",
  };
  for (const [key, value] of Object.entries(oneKey)) {
    setUrl(`/pets?page=2&${key}=${value}`);
    await expect.element(resetButton(), { message: key }).toBeVisible();
  }
  expect(Object.keys(oneKey)).toEqual(FILTER_PARAM_KEYS);
});
