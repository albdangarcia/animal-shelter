import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadGuides, parseGuide, validateGuides, type Guide } from "./guides";

const now = new Date("2026-11-10T12:00:00Z");

function guideText(frontMatter: string, body = "Some steps.") {
  return `---\n${frontMatter}\n---\n\n${body}\n`;
}

const valid = [
  "title: Record a vaccine",
  "summary: Record a vaccine, test or treatment you gave.",
  "permissions: [MEDICAL_ADMINISTER]",
  "verified: 2026-11-09",
].join("\n");

function without(field: string) {
  return valid
    .split("\n")
    .filter((line) => !line.startsWith(`${field}:`))
    .join("\n");
}

function withField(field: string, line: string) {
  return `${without(field)}\n${line}`;
}

function guide(slug: string, overrides: Partial<Guide> = {}): Guide {
  return {
    slug,
    title: slug,
    summary: slug,
    permissions: ["MEDICAL_READ"],
    aliases: [],
    related: [],
    verified: "2026-11-09",
    body: "Steps.",
    ...overrides,
  };
}

/** The error validateGuides throws for guide "a" with this body, beside "b". */
function linkError(body: string): string {
  try {
    validateGuides([guide("a", { body }), guide("b")]);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

test("every guide in docs/guides is well formed and links resolve", async () => {
  const guides = await loadGuides(path.join(process.cwd(), "docs/guides"));
  assert.ok(guides.length > 0, "docs/guides holds no guides");
});

test("parses a valid guide and defaults the optional lists", () => {
  const parsed = parseGuide("record-a-vaccine", guideText(valid), { now });
  assert.deepEqual(parsed, {
    slug: "record-a-vaccine",
    title: "Record a vaccine",
    summary: "Record a vaccine, test or treatment you gave.",
    permissions: ["MEDICAL_ADMINISTER"],
    aliases: [],
    related: [],
    verified: "2026-11-09",
    body: "Some steps.",
  });
});

test("parses CRLF line endings and a byte-order mark", () => {
  const text = `﻿${guideText(valid)}`.replace(/\n/g, "\r\n");
  assert.equal(parseGuide("a", text, { now }).title, "Record a vaccine");
});

test("missing permissions fails", () => {
  assert.throws(
    () => parseGuide("a", guideText(without("permissions")), { now }),
    /a\.md: permissions is required/,
  );
});

test("empty permissions fails", () => {
  assert.throws(
    () => parseGuide("a", guideText(withField("permissions", "permissions: []")), { now }),
    /a\.md: permissions must list at least one/,
  );
});

test("permissions written without brackets says it must be a list", () => {
  assert.throws(
    () =>
      parseGuide("a", guideText(withField("permissions", "permissions: MEDICAL_READ")), {
        now,
      }),
    /a\.md: permissions must be a list, such as \[MEDICAL_READ\]/,
  );
});

test("an unknown permission key fails, and a permission value is not a key", () => {
  assert.throws(
    () =>
      parseGuide(
        "a",
        guideText(withField("permissions", "permissions: [MEDICAL_EVERYTHING]")),
        { now },
      ),
    /a\.md: permissions\.0: unknown permission "MEDICAL_EVERYTHING"/,
  );
  assert.throws(
    () =>
      parseGuide(
        "a",
        guideText(withField("permissions", 'permissions: ["medical:read"]')),
        { now },
      ),
    /unknown permission "medical:read"/,
  );
});

test("a permission listed twice fails", () => {
  assert.throws(
    () =>
      parseGuide(
        "a",
        guideText(withField("permissions", "permissions: [MEDICAL_READ, MEDICAL_READ]")),
        { now },
      ),
    /permissions lists the same key twice/,
  );
});

test("an unknown field fails", () => {
  assert.throws(
    () =>
      parseGuide(
        "a",
        guideText(withField("permissions", "permission: [MEDICAL_READ]")),
        { now },
      ),
    /unknown field "permission"/,
  );
});

test("a missing title, a title that isn't text or an over-long summary fails", () => {
  assert.throws(
    () => parseGuide("a", guideText(without("title")), { now }),
    /a\.md: title is required/,
  );
  assert.throws(
    () => parseGuide("a", guideText(withField("title", "title: 2026")), { now }),
    /a\.md: title must be text/,
  );
  assert.throws(
    () =>
      parseGuide("a", guideText(withField("summary", `summary: ${"x".repeat(161)}`)), {
        now,
      }),
    /summary must be at most 160 characters/,
  );
});

test("a bad verified date fails with one message", () => {
  assert.throws(
    () => parseGuide("a", guideText(without("verified")), { now }),
    /verified is required/,
  );
  assert.throws(
    () => parseGuide("a", guideText(withField("verified", "verified: 20261109")), { now }),
    /^Error: a\.md: verified must be a date written YYYY-MM-DD$/,
  );
  assert.throws(
    () =>
      parseGuide("a", guideText(withField("verified", "verified: 10/11/2026")), { now }),
    (error: Error) =>
      error.message === "a.md: verified must be a date written YYYY-MM-DD",
  );
  assert.throws(
    () =>
      parseGuide("a", guideText(withField("verified", "verified: 2027-13-45")), { now }),
    (error: Error) => error.message === "a.md: verified is not a real date",
  );
});

test("a future verified date fails", () => {
  assert.throws(
    () =>
      parseGuide("a", guideText(withField("verified", "verified: 2026-12-01")), { now }),
    /verified must not be after 2026-11-11 \(no time zone has reached a later date yet\)/,
  );
});

test("invalid YAML names the line in the file", () => {
  // The duplicate title is on line 3 of the file: line 1 is "---".
  const text = guideText(`title: One\ntitle: Two\n${without("title")}`);
  assert.throws(
    () => parseGuide("a", text, { now }),
    (error: Error) =>
      error.message.startsWith("a.md: front matter is not valid YAML:") &&
      /line 3\b/.test(error.message) &&
      !error.message.includes("\n"),
  );
});

test("a file without front matter or with a bad slug fails", () => {
  assert.throws(
    () => parseGuide("a", "No front matter here.", { now }),
    /a\.md: must start with a "---" front matter block/,
  );
  assert.throws(
    () => parseGuide("Record_A_Vaccine", guideText(valid), { now }),
    /lowercase kebab-case slug/,
  );
});

test("a duplicate slug fails", () => {
  assert.throws(
    () => validateGuides([guide("a"), guide("a")]),
    /a\.md: duplicate slug "a"/,
  );
});

test("a broken related slug fails", () => {
  assert.throws(
    () => validateGuides([guide("a", { related: ["missing"] }), guide("b")]),
    /a\.md: related "missing" is not a guide/,
  );
});

test("good links, anchors, outside links and links in code pass", () => {
  validateGuides([
    guide("a", {
      body: [
        "See [b](./b.md), [its steps](./b.md#steps), [the site again][ref],",
        "[the site](https://example.com), [mail us](mailto:help@example.com)",
        "and [above](#top). In code, `[x](./missing.md)` is not a link.",
        "A footnote isn't a link either.[^1]",
        "",
        "```",
        "[x](./missing.md)",
        "```",
        "",
        "[ref]: https://example.com",
        "[^1]: Required.",
        "",
        "## Top",
      ].join("\n"),
    }),
    guide("b", { body: "## Steps\n\n1. Do it." }),
  ]);
});

test("an anchor must land on a heading of the guide it points into", () => {
  const b = guide("b", {
    body: [
      "## When to use this",
      "### Active, Chronic, Resolved",
      "### Given, *Refused*, `Not given`",
      "## Steps",
      "## Steps",
    ].join("\n\n"),
  });
  const error = (body: string) => {
    try {
      validateGuides([guide("a", { body: `${body}\n\n## Here` }), b]);
    } catch (caught) {
      return (caught as Error).message;
    }
    return "";
  };

  // Punctuation and formatting drop out, a repeated heading gets -1, and a
  // percent-escaped anchor is read decoded, as on GitHub.
  for (const ok of [
    "[x](./b.md#active-chronic-resolved)",
    "[x](./b.md#given-refused-not-given)",
    "[x](./b.md#steps-1)",
    "[x](./b.md#when-to-use-this)",
    "[x](#here)",
  ]) {
    assert.equal(error(ok), "", ok);
  }

  assert.match(
    error("[x](./b.md#missed)"),
    /a\.md: link "\.\/b\.md#missed": b\.md has no heading with the id "missed"\. Its headings are #when-to-use-this, #active-chronic-resolved/,
  );
  assert.match(error("[x](#nowhere)"), /a\.md: link "#nowhere": a\.md has no heading with the id "nowhere"\. Its headings are #here$/);
  // A case difference is a broken anchor: browsers match ids exactly.
  assert.match(error("[x](./b.md#Steps)"), /no heading with the id "Steps"/);
});

test("every form of a broken link fails", () => {
  const broken = [
    "[x](./missing.md)",
    "[x](./missing.md 'T')",
    "[x](./missing.md (T))",
    '[x](./missing.md "a \\" b")',
    "[x](<./my missing.md>)",
    "[see [b]](./missing.md)",
  ];
  for (const body of broken) {
    assert.match(linkError(body), /a\.md: link ".*" points at no guide/, body);
  }
});

test("a link to a guide written as a reference fails: only inline links reach the assistant as help links", () => {
  for (const body of ["[b][r]\n\n[r]: ./b.md", "[b][r]\n\n[r]: ./b.md#steps", "[b]\n\n[b]: ./b.md"]) {
    assert.match(
      linkError(body),
      /a\.md: link "\.\/b\.md(#steps)?": write a link to a guide inline, \[text\]\(\.\/b\.md(#steps)?\), not as a reference/,
      body,
    );
  }
});

test("a relative link not written ./<slug>.md fails", () => {
  assert.match(linkError("See [b](b.md)."), /link "b\.md": must be written \.\/<slug>\.md/);
  assert.match(linkError("See [b](../b.md)."), /must be written \.\/<slug>\.md/);
});

test("an image fails: guides are text only", () => {
  assert.match(
    linkError("![screen](./screen.png)"),
    /a\.md: image "\.\/screen\.png": guides are text only/,
  );
});

test("a link to a guide some of its readers can't see fails", () => {
  const glossary = guide("glossary", {
    permissions: ["MEDICAL_READ"],
    body: "See [void](./void.md).",
  });
  const voiding = guide("void", { permissions: ["MEDICAL_MANAGE"] });
  assert.throws(
    () => validateGuides([glossary, voiding]),
    (error: Error) =>
      error.message ===
      'glossary.md: link "./void.md" points at a guide that readers with ' +
        "MEDICAL_READ but none of MEDICAL_MANAGE can't see. Drop the link " +
        '(list "void" in related instead: each reader only sees the related ' +
        "guides they can open), or add MEDICAL_READ to void.md only if " +
        "everyone holding it should see that guide",
  );
  validateGuides([
    glossary,
    { ...voiding, permissions: ["MEDICAL_READ", "MEDICAL_MANAGE"] },
  ]);
});

test("loadGuides reports every problem in the folder at once", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "guides-"));
  try {
    const front = (slug: string, extra = "") =>
      `---\ntitle: ${slug}\nsummary: ${slug}\npermissions: [MEDICAL_READ]\nverified: 2026-11-09\n${extra}---\n\nSteps.\n`;
    await writeFile(path.join(dir, "README.md"), "Not a guide.");
    await writeFile(path.join(dir, ".DS_Store"), "");
    await writeFile(
      path.join(dir, "future.md"),
      front("future").replace("2026-11-09", "2027-01-01"),
    );
    await writeFile(
      path.join(dir, "linker.md"),
      front("linker", "related: [future]\n").replace("Steps.", "See [x](./missing.md)."),
    );
    await writeFile(path.join(dir, "renamed.markdown"), front("renamed"));

    await assert.rejects(loadGuides(dir, { now }), (error: Error) => {
      const lines = error.message.split("\n");
      assert.deepEqual(lines, [
        "future.md: verified must not be after 2026-11-11 (no time zone has reached a later date yet)",
        "renamed.markdown: only guides (<slug>.md) and README.md belong in this folder",
        'linker.md: link "./missing.md" points at no guide',
      ]);
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty field reads as missing, not as the wrong type", () => {
  assert.throws(
    () => parseGuide("a", guideText(withField("title", "title:")), { now }),
    /a\.md: title is required/,
  );
  assert.throws(
    () => parseGuide("a", guideText(withField("permissions", "permissions: ~")), { now }),
    /a\.md: permissions is required: list at least one AppPermissions key \(there is no value for everyone\)/,
  );
});

test("a summary on two lines, an empty alias or a guide with no body fails", () => {
  assert.throws(
    () => parseGuide("a", guideText(withField("summary", 'summary: "one\\ntwo"')), { now }),
    /summary must be one line/,
  );
  assert.throws(
    () => parseGuide("a", guideText(`${valid}\naliases: [shot, ""]`), { now }),
    /a\.md: aliases must not hold empty entries/,
  );
  assert.throws(
    () => parseGuide("a", `---\n${valid}\n---\n\n`, { now }),
    /a\.md: the guide has no body/,
  );
});

test("front matter with no closing line or that isn't a set of fields fails", () => {
  assert.throws(
    () => parseGuide("a", `---\n${valid}\n\nSteps.`, { now }),
    /a\.md: front matter has no closing "---"/,
  );
  assert.throws(
    () => parseGuide("a", "---\n- one\n- two\n---\n\nSteps.", { now }),
    /a\.md: front matter must be a set of fields/,
  );
});

test("a YAML error doesn't end with a colon", () => {
  const text = guideText(`title: One\ntitle: Two\n${without("title")}`);
  assert.throws(
    () => parseGuide("a", text, { now }),
    (error: Error) => !error.message.endsWith(":"),
  );
});

test("related listing the guide itself fails", () => {
  assert.throws(
    () => validateGuides([guide("a", { related: ["a"] })]),
    /a\.md: related lists the guide itself/,
  );
});

test("raw HTML fails: guides are plain markdown", () => {
  assert.match(
    linkError('<a href="./missing.md">x</a>'),
    /a\.md: raw HTML "<a href=\\"\.\/missing\.md\\">": guides are plain markdown/,
  );
  assert.match(linkError('<img src="./shot.png">'), /raw HTML .*guides are plain markdown/);
});

test("links to other schemes, other sites or app pages fail", () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "notes:b.md"]) {
    assert.match(
      linkError(`[x](${url})`),
      /only https:\/\/, http:\/\/ and mailto: links are allowed/,
      url,
    );
  }
  assert.match(
    linkError("[x](//evil.example/b.md)"),
    /a link to another site must start with https:\/\//,
  );
  assert.match(
    linkError("[Due page](/dashboard/medical/due)"),
    /links to app pages aren't allowed/,
  );
});

test("loadGuides reports folders and links, and a guide that failed to parse isn't missing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "guides-"));
  try {
    const front = (slug: string, body = "Steps.") =>
      `---\ntitle: ${slug}\nsummary: ${slug}\npermissions: [MEDICAL_READ]\nverified: 2026-11-09\n---\n\n${body}\n`;
    await writeFile(path.join(dir, "broken.md"), "No front matter.");
    await writeFile(path.join(dir, "linker.md"), front("linker", "See [b](./broken.md)."));
    await mkdir(path.join(dir, "drafts"));
    await symlink(path.join(dir, "linker.md"), path.join(dir, "shortcut.md"));

    await assert.rejects(loadGuides(dir, { now }), (error: Error) => {
      assert.deepEqual(error.message.split("\n"), [
        'broken.md: must start with a "---" front matter block',
        "drafts: must be a plain file, not a folder",
        "shortcut.md: must be a plain file, not a link",
      ]);
      return true;
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
