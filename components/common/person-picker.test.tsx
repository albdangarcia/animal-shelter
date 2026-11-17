import { afterEach, beforeEach, expect, test, vi, type MockInstance } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { PersonPicker } from "@/components/common/person-picker";

// "Add a new person" opens a dialog that saves through a server action, which
// a component test can't run. These tests never save a person, so the action
// is a stub.
vi.mock("@/app/lib/actions/person.actions", () => ({ createPerson: vi.fn() }));

// The person field every form shares (intakes, outcomes, fosters, euthanasia
// details), as it reads when a search finds no one. `/api/people/search` is
// answered by a stub.

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi
    .spyOn(window, "fetch")
    .mockImplementation(async () =>
      new Response("[]", { headers: { "content-type": "application/json" } }),
    );
});

afterEach(() => {
  fetchSpy.mockRestore();
});

const openPicker = () =>
  userEvent.click(page.getByText("Search for a person..."));

const searchFor = async (text: string) => {
  await userEvent.fill(page.getByPlaceholder("Type a name, email, or phone..."), text);
  await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
};

test("a search that finds no one says to add the person to the directory, naming no form", async () => {
  render(<PersonPicker value={null} onChange={() => {}} />);

  await openPicker();
  await expect
    .element(page.getByText("Type a name, email, or phone number to search."))
    .toBeVisible();

  await searchFor("Nobody");

  await expect
    .element(
      page.getByText(
        "No matching person found. Add them to the people directory first, then pick them here.",
      ),
    )
    .toBeVisible();
  expect(document.body.textContent).not.toContain("intake");
  await expect.element(page.getByRole("option", { name: "Add a new person" })).not.toBeInTheDocument();
});

test("someone who can add people is offered Add a new person instead", async () => {
  render(<PersonPicker value={null} onChange={() => {}} canCreatePerson />);

  await openPicker();
  await searchFor("Nobody");

  await expect.element(page.getByRole("option", { name: "Add a new person" })).toBeVisible();
  await expect.element(page.getByText(/No matching person found/)).not.toBeInTheDocument();
});
