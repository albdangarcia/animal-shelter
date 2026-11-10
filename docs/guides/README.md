# Staff guides: how to write one

Each file in this folder, except this README, is a how-to guide for staff: one
task, written by doing it in the app. `npm test` checks every guide's front
matter and links (`app/lib/guides/guides.test.ts`), so a malformed guide fails
CI.

## The file

`docs/guides/<slug>.md`. The file name is the slug: lowercase, kebab-case,
unique (`record-a-vaccine-test-or-treatment.md`). Pick it from the title and
don't change it once other guides link to it.

The file starts with YAML front matter, then the body:

```markdown
---
title: Record a vaccine, test or treatment
summary: Record care you gave, whether it was scheduled or not.
permissions: [MEDICAL_ADMINISTER, MEDICAL_MANAGE]
aliases: [give a shot, add vaccination, log rabies shot]
related: [schedule-care-and-read-the-due-page]
verified: 2026-11-09
---

## When to use this
...
```

| Field | Rule |
|---|---|
| `title` | Required, not empty. Says the task the way staff would ask for it. Put it in quotes if it has a colon: `title: "Glossary: what … mean"`. |
| `summary` | Required. One line of at most 160 characters saying what the guide lets you do. |
| `permissions` | Required, at least one. Each is a key of `AppPermissions` in `app/lib/auth/permissions.ts` (`MEDICAL_READ`, not `medical:read`). A reader sees the guide if they hold **any** of them. List the permission the server action behind the task checks, not a role. There is no "everyone" value: a guide is never shown to everyone by mistake. |
| `aliases` | Optional list of staff's own words for the task, for search. |
| `related` | Optional list of slugs of other guides. Each must exist. A reader is only shown the related guides they can see, so these may need more permissions than this guide. |
| `verified` | Required date, `YYYY-MM-DD`, not in the future. The day someone last walked the steps in the app. |

Any other field fails the check, so a typo such as `permission:` is caught.

### Picking `permissions`

Find the server action each step calls (in `app/lib/actions/`) and copy the
permission from its `RequirePermission(...)`. When the steps call actions behind
different permissions, list each one. Roles are due to become per-user
permission ticks, so don't rely on one role holding both.

### Links

Guides are plain GitHub-flavoured markdown. The check parses each body the
way the help page renders it, so links inside code aren't checked and
footnotes aren't links. A link may point at:

- another guide, written `./<slug>.md`:
  `[Correct or void an entry](./correct-or-void-an-entry.md)`. A section
  anchor is fine: `./medical-status-glossary.md#missed`. These work on
  GitHub, and the help page (`/dashboard/help/<slug>`) rewrites them to its
  own routes. The anchor must be the id of a heading in that guide, made the
  way GitHub makes it: lower case, punctuation dropped, spaces turned into
  `-` (`### Active, Chronic, Resolved` is `#active-chronic-resolved`). A
  repeated heading gets `-1`, `-2`. The check fails on an anchor that names
  no heading and lists the guide's heading ids.
- a web page, `https://…` or `http://…`, or a mail address, `mailto:…`.
- a heading in the same guide, `#…`, checked the same way.

Anything else fails the check:

- Links to app pages (`/dashboard/medical/due`). They break on GitHub and
  can't be checked against the guide's permissions. Name the page in words:
  "open **Medical**, then **Due**".
- Other schemes (`javascript:`, `file:`) and `//host` links. The help page
  would show them as dead links.
- Images and raw HTML (`<a href>`, `<img>`): guides are text only, and the
  help page shows HTML as plain text.

Everyone who can see a guide must be able to follow its links, so **the
linked guide must list every permission the linking guide lists**. The check
doesn't look at roles, because roles are due to become per-user ticks. When
it fails, the safe fix is to drop the link, say the step in words, and list
the guide in `related`: each reader is only shown the related guides they can
open. Add the permissions to the linked guide only if everyone holding them
should see it. For example, the glossary lists `MEDICAL_READ,
MEDICAL_ADMINISTER, MEDICAL_MANAGE` so every medical guide can link to it,
and it lists the guide on voiding, which needs `MEDICAL_MANAGE`, in `related`
rather than linking to it. A foster holds `MY_FOSTER_ANIMALS_CARE` but not
`MEDICAL_READ`, so a foster guide links to no staff guide.

### The folder

Only `<slug>.md` guides and this README belong here. Any other file or
folder, such as a guide saved as `.markdown`, fails the check rather than
being skipped, and so does a symlink. Names starting with a dot (`.DS_Store`,
or a draft you aren't ready to check) are skipped.

## The body

- No `#` heading: the title comes from the front matter.
- Start with `## When to use this`: two or three sentences, and when to use a
  different guide instead.
- Then `## Steps` (or a few `##` sections, one per way of doing the task).
  Numbered steps, one action each.
- Copy button and field labels from the screen, exactly, in **bold**:
  **Record selected as given**, not "the record button".
- After each step that changes something, say what you should see: the
  message that pops up, or where the change shows.
- End with `## If something goes wrong`: the real messages, copied from the
  screen or the code, and what to do about each.
- Plain English. Write to "you". Short sentences.
- Text only, no screenshots.
- Keep it short: enough to finish the task, no more. Explain a status word
  (Overdue, Missed, Exempt) by linking to
  [the glossary](./medical-status-glossary.md), not again in each guide.

## Writing and checking a guide

1. Boot the app against a throwaway seeded database, never the dev database
   (see `.claude/skills/verify`). Put `PLAYWRIGHT_DATABASE_URL=<url>` on every
   command that touches it.
2. Sign in as a seeded user who holds the guide's permissions and no more:
   `staff1@example.com` for staff tasks, `foster1@example.com` for a foster's.
3. Do every step in the browser and write down what you did and saw.
4. If a step doesn't work, or the app does something you can't explain
   honestly, stop and report it as a bug. Don't write the guide around it.
5. Set `verified` to the day you walked it.

When you change a screen a guide describes (a label, a step, an error
message), update the guide in the same branch and set its `verified` date.
