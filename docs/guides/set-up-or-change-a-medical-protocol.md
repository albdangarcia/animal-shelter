---
title: Set up or change a medical protocol
summary: Choose the care that is scheduled automatically when an animal is admitted, by species and age, and see what a change does to animals already in care.
permissions: [MEDICAL_SETTINGS_MANAGE]
aliases: [intake protocol, puppy protocol, kitten protocol, automatic vaccines, schedule vaccines at intake, auto schedule care, change the vaccine schedule, retire a protocol, protocol steps, default care for new animals]
related: [add-edit-or-retire-a-medical-catalog-item, schedule-care-and-read-the-due-page, record-reschedule-or-decline-scheduled-care, medical-status-glossary, take-in-a-new-animal, take-back-an-animal-that-left]
verified: 2026-11-10
---

## When to use this

A protocol is the care a new animal is scheduled when it is admitted. It is
for one species and a range of ages, for example "Puppy: dogs under 140 days".
Each step is one piece of care: an exam, a vaccine, a test, a treatment, a
microchip or spay/neuter.

An animal's age on its intake day picks the protocol, and at most one protocol
fits. Use this guide to add one, change one, or retire one. To plan care for a
single animal, schedule it on the animal's record instead.

## Add a protocol

1. In the sidebar, open **Settings**, then the **Medical** card, then the
   **Protocols** tab. The protocols are listed by species.
2. Click **Add Protocol**.
3. Type the **Name**, for example "Puppy", and pick the **Species**.
4. Set the ages it covers. **From age (days)** is the youngest age, and empty
   means from birth. **Under age (days)** is the age it stops at, and empty
   means for life. An animal exactly **Under age** old is not covered. The form
   says "Covers:" with what you set. Two live protocols of a species can't
   cover the same age.
5. Fill in **Step 1**. It starts as an intake exam, **Days after intake**
   0. Change it, or click the **X** to remove it. For each step:
   - **Kind**: **Vaccine**, **Test**, **Treatment**, **Spay/neuter**, **Exam**
     or **Microchip**.
   - The item: pick it from the catalog. Only items that are not retired and
     fit the protocol's species are listed. If the list is empty, the form
     says "The catalog has none for rabbits." (or the species): add one first,
     see
     [Add, edit or retire a medical catalog item](./add-edit-or-retire-a-medical-catalog-item.md).
     An **Exam** step asks for the **Exam type** instead.
   - **Days after intake**: 0 is the day it is admitted.
   - **Not before age (days)**: the first dose waits until the animal is this
     old, and is never due before today.
   - **Repeat every (days)**, **Doses after the first** and **Only under age
     (days)** (vaccines, tests and treatments only): how often it repeats,
     how many more doses there are, and the age it stops at. **Doses after
     the first** needs **Repeat every (days)**, and **Repeat every (days)**
     needs **Doses after the first**, **Only under age (days)**, or both.
     **Only under age (days)** must be above **Not before age (days)**.
   - **Notes**: copied onto each entry the step schedules.
6. Click **Add step** for each more step. Use the arrows to reorder and the
   **X** to remove.
7. Click **Create Protocol**.

You should see "Puppy protocol added." (with your protocol's name). It
appears under its species. Under the name is who it is for, for example "Dogs
under 140 days", then one line for each step, for example "DHPP · from intake,
not before 6 weeks, every 14 days until 20 weeks".

## What a change does to animals already in care

A protocol is applied each time an animal is admitted, including when one
comes back. It schedules entries for that animal, and from then on those
entries stand on their own. Care still open from a returning animal's last
stay isn't scheduled twice.

- **Animals already in care are not changed.** Care already scheduled stays as
  it was, whatever you edit or retire in the protocol. To change one
  animal's scheduled care, reschedule or decline it on the animal's record.
- **Animals admitted afterwards** get the steps as saved. That includes an
  animal that comes back later, which is scheduled from the protocol as it is
  then.
- A step you leave as it was stays. A step you change or remove is retired,
  and a changed one is added again as a new step. Entries already scheduled
  from the old step keep pointing at it.
- At intake, a step is left out for an animal it doesn't fit, for example a
  microchip step for an animal already microchipped.

## Change a protocol

1. On the protocol's row, click the **…** button, then **Edit**.
2. Change what you need. The box says "Care already scheduled from this
   protocol stays as it was."
3. Click **Update Protocol**.

You should see "Puppy protocol updated." (with its name), and the row shows
the new steps.

If you close the box with changes not saved, it asks "Discard unsaved
protocol?". Click **Cancel** to go back, or **Discard** to lose the changes.

## Retire a protocol, or bring it back

1. On the protocol's row, click the **…** button, then **Retire**.

You should see "Protocol retired." The row turns grey and shows **Retired**.
Animals admitted afterwards don't get it. A retired protocol can't be edited,
and its ages are free for another protocol.

To bring it back, click **…**, then **Unretire**. You should see "Protocol
unretired." It comes back only if no live protocol covers the same ages.

To replace a protocol for the same ages, retire the old one first, then add
the new one.

## When a step stops scheduling

If a step's item is retired in the catalog, or narrowed to other species, the
step shows in red under its row, for example "Won't be scheduled: retired from
the catalog". The rest of the protocol still schedules.

To fix it, unretire the item or tick the species in the catalog, or edit the
protocol and pick another item for that step.

## If something goes wrong

- **"Name is required."** and **"Pick a species."** Fill in every field
  marked with *.
- **"Pick the item."** Pick the item under the step's **Kind**.
- **"Repeats need an interval."** You filled in **Doses after the first**
  without **Repeat every (days)**. Fill in the days, or clear the doses.
- **"Rabbit walkthrough already covers rabbits at every age."** (the name and
  ages are the other protocol's) Another live protocol covers some of the same
  ages. Change **From age** or **Under age**, or retire the other protocol
  first. Unretiring gives the same kind of message, for example "Puppy already
  covers dogs from birth to 139 days."
- **A protocol named "…" already exists.** A name can be used once across all
  species, in any capitals, so a name used for another species is taken too.
  Pick another name. If it is a retired one (A retired protocol named "…"
  already exists. Unretire it instead.), unretire that protocol.
- **"A protocol needs at least one step."** Add a step.
- **"Must be older than the youngest age."** Shown under **Under age (days)**.
  Check **From age (days)** and **Under age (days)**.
- **"Give a number of repeats, an age to stop at, or both."** A step has
  **Repeat every (days)** but neither **Doses after the first** nor **Only
  under age (days)**. Fill in one of them, or clear the days.
- **"Must be after the earliest age."** Under a step's **Only under age
  (days)**. It must be above **Not before age (days)**.
- **"… isn't for rabbits."** or **"… has been retired from the catalog."**
  The item can't be a step of this protocol. Pick another, or fix it in the
  catalog.
- **"This protocol is retired. Unretire it to edit it."** Unretire it first.
- **"This protocol is already retired."** or **"This protocol isn't
  retired."** Someone else just changed it. The page refreshes to show how the
  row is now.
