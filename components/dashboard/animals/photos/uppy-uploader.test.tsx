import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { toast as sonner, Toaster } from "sonner";
import UppyUploader from "@/components/dashboard/animals/photos/uppy-uploader";
import {
  UPLOAD_FAILED_MESSAGE,
  UPLOAD_UNREACHABLE_MESSAGE,
} from "@/components/dashboard/animals/photos/upload-errors";
import { resetNavigation, routerCalls } from "@/tests/components/next-navigation";

vi.mock("next/navigation", () => import("@/tests/components/next-navigation"));

// The Photos tab's uploader against a stand-in for /api/upload-to-blob. Uppy
// sends each upload with XMLHttpRequest, so the test swaps in a fake one that
// answers from `replies`: no request leaves the page, and nothing reaches the
// Vercel Blob store. Everything between the file input and the toast is the
// real Uppy, so these cover what it does with each answer: before the fix,
// every failure, a 403 included, was retried three times and toasted Uppy's
// "This looks like a network error…". A retry the test didn't expect asks for
// a reply that isn't there, and the run fails on that error.

type Reply = { status: number; body?: unknown } | "no answer";

let replies: Reply[] = [];
let requests: string[] = [];

class FakeXMLHttpRequest {
  status = 0;
  statusText = "";
  readyState = 0;
  responseType = "";
  response: unknown = null;
  responseText = "";
  withCredentials = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #url = "";

  open(_method: string, url: string) {
    this.#url = url;
  }
  setRequestHeader() {}
  abort() {}
  send() {
    requests.push(this.#url);
    const reply = replies.shift();
    if (!reply) throw new Error(`No reply left for request ${requests.length}`);
    setTimeout(() => {
      this.readyState = 4;
      if (reply === "no answer") {
        this.onerror?.();
        return;
      }
      this.status = reply.status;
      this.responseText = JSON.stringify(reply.body ?? {});
      this.onload?.();
    });
  }
}

beforeEach(() => {
  replies = [];
  requests = [];
  resetNavigation("/dashboard/animals/animal-1/photos");
  vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
});

// Sonner keeps its toasts in module state, and a new <Toaster> shows the ones
// still there: without dismissing them, a toast from the test before passes
// this test's check before its own upload has even been answered.
afterEach(async () => {
  await cleanup();
  sonner.dismiss();
  vi.unstubAllGlobals();
});

async function uploadPhoto() {
  const screen = await render(
    <>
      <UppyUploader animalId="animal-1" canManage />
      <Toaster />
    </>,
  );
  // The input behind "browse files" (not the one for folders).
  const input = Array.from(
    screen.container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  ).find((element) => !element.webkitdirectory);
  if (!input) throw new Error("The uploader has no file input");
  await userEvent.upload(
    page.elementLocator(input),
    new File(["not really a photo"], "charlie.jpg", { type: "image/jpeg" }),
  );
}

const toast = (text: string) => page.getByText(text, { exact: true });

test("a refusal shows the route's reason", async () => {
  replies = [
    {
      status: 403,
      body: { error: "Forbidden: You do not have permission to upload files." },
    },
  ];

  await uploadPhoto();

  await expect
    .element(toast("Forbidden: You do not have permission to upload files."))
    .toBeVisible();
  expect(requests).toEqual(["/api/upload-to-blob"]);
});

test("a refusal without a reason shows the general message", async () => {
  replies = [{ status: 400, body: {} }];

  await uploadPhoto();

  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("a server failure shows the general message, without retrying", async () => {
  replies = [{ status: 500, body: { error: "Upload failed." } }];

  await uploadPhoto();

  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("no answer at all says the server couldn't be reached", async () => {
  replies = ["no answer"];

  await uploadPhoto();

  await expect.element(toast(UPLOAD_UNREACHABLE_MESSAGE)).toBeVisible();
  expect(requests).toHaveLength(1);
});

// What the guide tells staff to do: the failed file stays in the uploader,
// and its Retry button sends it again. Adding the same file again is refused
// as a duplicate.
test("Retry sends a failed upload again", async () => {
  replies = [
    { status: 500, body: { error: "Upload failed." } },
    { status: 201, body: { url: "https://example.test/charlie.jpg" } },
  ];

  await uploadPhoto();
  await expect.element(toast(UPLOAD_FAILED_MESSAGE)).toBeVisible();
  // Uppy's status bar: "Upload failed", and the Retry button.
  const retry = page.getByRole("button", { name: "Retry upload" });
  await expect.element(retry).toBeVisible();

  await retry.click();

  await expect.element(toast("Image uploaded successfully!")).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(routerCalls).toEqual([{ method: "refresh", href: "" }]);
});
