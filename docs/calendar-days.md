# Calendar days and instants

Two kinds of value in this schema get loosely called "a date", and they are not
interchangeable:

- **A calendar day.** A birthday, the day an animal arrived, the day a vet visit
  happened. It has no time of day and belongs to no timezone. A shelter that
  records an intake on the 18th means the 18th, everywhere, for every viewer.
- **An instant.** When a row was written, when an application was submitted,
  when a weight was measured. A point on the universal timeline, rendered in
  whatever zone the reader is in.

Conflating them is the defect this convention exists to prevent. An instant
standing in for a day is read as a different day depending on where the reader
sits, so the same row lands in different buckets in a report, a chart and a
table.

## The rule

A field's name says which kind it is, and its type must agree.

| Name shape                        | Kind         | Prisma type              |
| --------------------------------- | ------------ | ------------------------ |
| ends `Date`, or begins `date`     | calendar day | `String` (`yyyy-MM-dd`)  |
| ends `At`                         | instant      | `DateTime`               |

Examples of each, so the shapes are unambiguous: `intakeDate`, `outcomeDate`,
`birthDate`, `dateLost`, `dateOfRecord`, `dueDate` and `expectedEndDate` are
days. `createdAt`, `updatedAt`, `publishedAt`, `submittedAt`, `recordedAt` are
instants.

`recordedAt` on a vitals log is the instructive case. A measurement is taken at
a time — fosters report late and backdate them — so it is an instant, and it is
named accordingly. It is not a calendar day and must not be treated as one.

`prisma/schema.prisma` is checked against this rule by
`app/lib/schema-conventions.test.ts`, which runs under `npm test`. The test
carries an allowlist for fields that do not follow the rule yet; each entry
names the field and why. An allowlist entry is a recorded deferral, not a
permanent exemption, and the list is expected to shrink to nothing.

## The day type

A calendar day is a branded string, so an arbitrary string cannot stand in for
one:

```ts
type CalendarDay = string & { readonly __brand: unique symbol };
```

Values are parsed into that type at the three edges where unknown input becomes
a day, and nowhere else:

1. **A form submission.** A date picker submits `yyyy-MM-dd` directly, which is
   also what the HTML `<input type="date">` value is specified to be. Nothing
   constructs a `Date` in the browser and sends the instant.
2. **Today.** Resolved in the shelter's timezone — see below.
3. **A read from the database.** The column already holds the shape; the parse
   is what attaches the brand.

After those edges nothing re-validates, so a function taking a `CalendarDay`
can trust it. That is the point of parsing at a boundary rather than checking
everywhere.

Days sort and compare as plain strings, because `yyyy-MM-dd` is fixed-width and
zero-padded. This holds in Postgres (`ORDER BY`, `BETWEEN`, `<`, `>`) and in
JavaScript, so a day column needs no special handling to sort chronologically,
and a report range is two string comparisons.

Day arithmetic (shifting by n days, counting days between two days) lives in
`app/lib/utils/shelter-day.ts`. When `Temporal.PlainDate` is available in this
runtime it replaces that arithmetic without changing the stored column, since
`Temporal.PlainDate.toString()` is the same `yyyy-MM-dd`.

## The timezone

A calendar day needs no timezone. Resolving *which day it is now* does, and
that is the only thing the shelter's timezone is for:

- today's date, for defaults and for "is this overdue"
- where a reporting month or year begins
- filling a day-valued column on a write that supplied none

It is read from the shelter settings row, so it can change without a rebuild.
The environment variable is used only while the row is missing. It is read
server-side only. The browser never needs it: it receives days already resolved
as `yyyy-MM-dd` and renders them.

That last point is structural rather than incidental. Because the zone lives in
the database it cannot be inlined into a client bundle, which makes the correct
split the only possible one — the server decides which day a value falls on and
the client renders the answer.

## Rejected alternatives

**A `DateTime` pinned to the start of the day in a configured zone.** Keeps
the column type and encodes the day as an instant. It works, and it was
implemented before this convention replaced it. The objection is that the
invariant cannot live in the type: every writer has to be normalised (which a
Prisma client extension can do, except for nested writes, which bypass query
extensions), and every reader has to remember to decode in the configured zone
rather than its own. Both are conventions enforced by review. A stored instant
also has to be re-decoded if the configured zone ever changes, so historical
days silently move.

**`DateTime @db.Date`.** The right storage type — Postgres `DATE` is four bytes
and means a calendar day — and worth revisiting if the reports ever move into
SQL, where native date semantics (`date_trunc`, `GROUP BY`, `generate_series`)
would pay for themselves. It is not used today because Prisma has no date-only
scalar: a `DATE` column is surfaced as a JavaScript `Date` at UTC midnight, so
the value's type claims to be an instant. Every generic date helper accepts it
and shifts it a day for any reader west of UTC, silently. The failure mode of a
mistyped string is a visibly broken value; the failure mode of a lying `Date` is
a quietly wrong day, which is the defect this convention exists to prevent.

The underlying gap is JavaScript's, not Prisma's — the language has no calendar
date type for a `DATE` column to map to. `Temporal.PlainDate` closes it, and at
that point a `DATE` column becomes worth reopening.
