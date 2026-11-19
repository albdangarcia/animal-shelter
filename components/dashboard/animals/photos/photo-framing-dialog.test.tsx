import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { toast as sonner, Toaster } from "sonner";
import {
  FRAMING_SAVED_MESSAGE,
  FRAMING_UNREACHABLE_MESSAGE,
  usePhotoFramer,
  type FramedPhoto,
  type SaveFocus,
} from "@/components/dashboard/animals/photos/photo-framing-dialog";
import { resetNavigation, routerCalls } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The server action is a stand-in, as the gallery would pass the real one:
// that one checks the session, and the rules it drives (refusals, the stored
// value) are in prisma/animal-photos.test.ts.
type Answer = { success: boolean; message: string };
const action = {
  calls: [] as unknown[][],
  answers: [] as (Answer | "no answer" | Promise<Answer>)[],
};
const saveFocus: SaveFocus = async (...args) => {
  action.calls.push(args);
  const answer = action.answers.shift() ?? { success: false, message: "unexpected call" };
  if (answer === "no answer") throw new TypeError("Failed to fetch");
  return answer;
};

// "Adjust framing" on a saved photo: the tile's button (here a stand-in, as
// the gallery imports server actions) opens the two wide previews of the
// photo at its saved framing; Save sends the new one.

const SAVED: FramedPhoto = { id: "image-1", url: "/framing-photo.png", focusY: 0.2 };

beforeEach(async () => {
  action.calls = [];
  action.answers = [];
  resetNavigation("/dashboard/animals/animal-1/photos");
  await page.viewport(1100, 900);
});

afterEach(async () => {
  await cleanup();
  sonner.dismiss();
});

function Gallery({ image }: { image: FramedPhoto }) {
  const { adjust, element } = usePhotoFramer("animal-1", saveFocus);
  return (
    <>
      <button type="button" onClick={() => adjust(image)}>
        Frame this photo
      </button>
      {element}
    </>
  );
}

const dialog = () => page.getByRole("dialog", { name: "Adjust framing" });
const pagePreview = () => page.getByRole("slider", { name: "Framing: Animal's page" });
const listingPreview = () => page.getByRole("slider", { name: "Framing: Listing" });
const saveButton = () => page.getByRole("button", { name: "Save framing" });
const toast = (text: string) => page.getByText(text, { exact: true });

async function openFraming(image = SAVED) {
  await render(
    <>
      <Gallery image={image} />
      <Toaster />
    </>,
  );
  await page.getByRole("button", { name: "Frame this photo" }).click();
  await expect.element(dialog()).toBeVisible();
}

test("the photo opens in both wide previews at its saved framing", async () => {
  await openFraming();

  await expect.element(pagePreview()).toHaveAttribute("aria-valuetext", "20% from the top");
  await expect.element(listingPreview()).toHaveAttribute("aria-valuenow", "20");
  // Drawn as the pages draw it: cover, at the same vertical position.
  await expect.element(pagePreview()).toHaveStyle({
    backgroundSize: "cover",
    backgroundPosition: "50% 20%",
  });
  expect(action.calls).toEqual([]);
});

test("a photo never framed opens centred, with Centre disabled", async () => {
  await openFraming({ ...SAVED, focusY: null });

  await expect.element(pagePreview()).toHaveAttribute("aria-valuetext", "Centred");
  await expect.element(page.getByRole("button", { name: "Centre" })).toBeDisabled();
});

test("Save sends the new framing for the photo shown, then closes and refreshes", async () => {
  action.answers = [{ success: true, message: "Framing saved." }];
  await openFraming();

  await pagePreview().click();
  await userEvent.keyboard("{End}{ArrowDown}");
  await expect.element(listingPreview()).toHaveAttribute("aria-valuetext", "95% from the top");
  await saveButton().click();

  await expect.element(toast(FRAMING_SAVED_MESSAGE)).toBeVisible();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(action.calls).toEqual([["animal-1", SAVED.id, SAVED.url, 0.95]]);
  expect(routerCalls).toEqual([{ method: "refresh", href: "" }]);
});

test("Centre then Save sends no framing", async () => {
  action.answers = [{ success: true, message: "Framing saved." }];
  await openFraming();

  await page.getByRole("button", { name: "Centre" }).click();
  await expect.element(pagePreview()).toHaveAttribute("aria-valuetext", "Centred");
  await saveButton().click();

  await expect.element(dialog()).not.toBeInTheDocument();
  expect(action.calls).toEqual([["animal-1", SAVED.id, SAVED.url, null]]);
});

test("a refusal shows its reason and stays open; Save again sends again", async () => {
  const refusal =
    "This photo has changed since you opened the page. It may have been replaced in another tab. Reload the page and try again.";
  action.answers = [
    { success: false, message: refusal },
    { success: true, message: "Framing saved." },
  ];
  await openFraming();
  await pagePreview().click();
  await userEvent.keyboard("{Home}");

  await saveButton().click();
  await expect.element(toast(refusal)).toBeVisible();
  await expect.element(dialog()).toBeVisible();
  await expect.element(pagePreview()).toHaveAttribute("aria-valuetext", "Top");
  expect(routerCalls).toEqual([]);

  await saveButton().click();
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(action.calls).toEqual([
    ["animal-1", SAVED.id, SAVED.url, 0],
    ["animal-1", SAVED.id, SAVED.url, 0],
  ]);
});

test("no answer says the server couldn't be reached, and stays open", async () => {
  action.answers = ["no answer"];
  await openFraming();

  await saveButton().click();

  await expect.element(toast(FRAMING_UNREACHABLE_MESSAGE)).toBeVisible();
  await expect.element(dialog()).toBeVisible();
});

test("Save is sent once however often it is pressed, and the box can't close meanwhile", async () => {
  let answer!: (value: Answer) => void;
  action.answers = [new Promise<Answer>((resolve) => (answer = resolve))];
  await openFraming();

  // Twice in one go, before React has drawn the button disabled: only the
  // save's own guard stops the second.
  const button = saveButton().element() as HTMLButtonElement;
  button.click();
  button.click();
  await expect.element(page.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog()).toBeVisible();

  answer({ success: true, message: "Framing saved." });
  await expect.element(dialog()).not.toBeInTheDocument();
  expect(action.calls).toHaveLength(1);
});

test("Cancel and Esc close without saving, and the next open starts from the saved framing", async () => {
  await openFraming();
  await pagePreview().click();
  await userEvent.keyboard("{Home}");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect.element(dialog()).not.toBeInTheDocument();

  await page.getByRole("button", { name: "Frame this photo" }).click();
  await expect.element(pagePreview()).toHaveAttribute("aria-valuetext", "20% from the top");
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog()).not.toBeInTheDocument();

  expect(action.calls).toEqual([]);
});
