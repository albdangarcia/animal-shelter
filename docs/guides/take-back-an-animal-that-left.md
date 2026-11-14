---
title: Take back an animal that left
summary: Record a re-intake when an adopted, transferred or returned animal comes back, so it is in care again on its old record.
permissions: [INTAKE_MANAGE]
aliases: [re-intake, reintake, returned adoption, adoption return, animal came back, bring an animal back, returned animal, re-admit, readmit, adopter brought it back, second intake]
related: [take-in-a-new-animal, correct-an-intake, find-an-intake, set-up-or-change-a-medical-protocol, schedule-care-and-read-the-due-page]
verified: 2026-11-14
---

## When to use this

Use this when an animal that left the shelter comes back: an adopted animal
returned by its adopter, a transferred animal sent back, or one that ran off
from its owner again. The animal keeps its record, history and medical
record. A re-intake adds a new intake to it and brings it back into care.

Don't add the animal again with **Add Animal**: it would get a second record.

If the outcome should never have been recorded at all, the animal didn't
leave and come back. An admin reverses the outcome instead.

## Where to find it

When an animal leaves through an outcome, such as an adoption, a transfer
out, a return to its owner or **Other**, its record is archived. From then
on, the animal's page shows **Create Re-Intake** where **Create Outcome**
used to be. The animal still shows on the **Animals** list, marked
**Archived**; search for it by name.

An animal whose outcome was **Deceased** or **Euthanized** can't be taken
back in. Its page has no **Create Re-Intake**, and shows "Outcome: Deceased"
(or "Outcome: Euthanized") in its place. If the death was recorded by
mistake, an admin reverses that outcome from the **Outcomes** list. The
animal is then back in care, with no re-intake needed.

## Steps

1. Open the animal and click **Create Re-Intake**. The form **Re-Intake
   Animal: Zoe** (with the animal's name) opens.
2. Under **Intake & Source Details**, pick the **Intake Type**.
3. Check the **Intake Date**. It starts on today. It can't be before the day
   the animal left, and days after today can't be picked.
4. Fill in the source the type asks for:
   - **Stray**: under **Location Found**, the **City**, the **State** and
     the **Address / Cross Streets**.
   - **Transfer In**: under **Transfer Details**, the **Source Partner**.
   - **Owner Surrender** (for example an adopter bringing the animal back):
     under **Surrendering Person Details**, click **Surrendering Person**,
     type part of a name, email or phone number, and pick the person. If
     they aren't in the directory, click **Add a new person**.
5. Add anything else under **Internal Notes**, for example why the animal
   came back.
6. Check the **Medical Protocol** part (see below), then click **Process
   Re-Intake**.

You should see "Animal re-intake processed successfully. Puppy protocol: 13
entries scheduled." (with the protocol's name and count). If the protocol
fits but everything it would schedule is still open from the last stay, it
ends "Puppy protocol: nothing scheduled." It is just "Animal re-intake
processed successfully." when no protocol fits the animal, or when you
unticked **Schedule this protocol's care**.

The animal's page opens. It is listed as **Draft** again, it is
**Unplaced**, and the button reads **Create Outcome** again.

The new intake is on the **Intakes** list, beside the animal's earlier ones.

## What the medical protocol does

The protocol for the animal's species and its age on the intake day is
applied again, so it gets its boosters again. The **Medical Protocol** part
shows what will be scheduled, for example "Puppy protocol: 13 entries".

- Care still open from the animal's last stay isn't scheduled twice. It is
  listed under "Not scheduled:" as "(already scheduled)". If everything is
  still open, the part says "Puppy protocol: nothing to schedule".
- A chip or a spay or neuter already on the medical record is left out too:
  "microchip (already microchipped)", "spay/neuter (already spayed or
  neutered)".
- Untick **Schedule this protocol's care** only when the animal shouldn't get
  the protocol's care.

After you save, the scheduled items are under **Due** on the animal's
**Medical** tab, marked "From the Puppy protocol" (with the protocol's name).

The **Medical Protocol** part is shown only to staff who can manage medical
care. For anyone else, the protocol is applied as the shelter set it, with no
choice, and the message after saving still says what it scheduled.

## If something goes wrong

- **No Create Re-Intake button, and Create Outcome instead.** The animal is
  still in care, so it hasn't left. Opening the re-intake page anyway shows
  **Cannot Process Re-Intake**: "Re-intake is only available for animals
  that are no longer in the shelter (i.e., have an ARCHIVED status)."
- **No Create Re-Intake button, and "Outcome: Deceased" or "Outcome:
  Euthanized" instead.** The animal died, so it can't come back. Opening the
  re-intake page anyway shows **Cannot Process Re-Intake**: "An animal that
  has died can't be taken back in. If the outcome was recorded by mistake, an
  admin can reverse it from the Outcomes list, which puts the animal back in
  care." If the death was a mistake, ask an admin to reverse it.
- **"Cannot process re-intake: This animal's outcome was Deceased, and an
  animal that has died can't be taken back in. If the outcome was recorded
  by mistake, an admin can reverse it from the Outcomes list, which puts the
  animal back in care."** (it may say Euthanized) The animal's record changed
  while you had the form open, and its stay now ends in a death. Nothing was
  saved. If the death was a mistake, ask an admin to reverse it.
- **"The intake date can't be before the previous outcome on Nov 3, 2026."**
  (with the outcome's day) The animal came back after it left. Pick that
  day or a later one.
- **"The intake date can't be Nov 14, 2026: this animal already has an
  intake and an outcome that day, and a day can hold only one of each."**
  (with the day; it may say "an intake" or "an outcome" alone) The animal
  already arrived and left that day. If it really
  came back the same day, check that the outcome was right: an outcome that
  should never have been recorded is reversed by an admin.
- **"City is required for strays."**, **"State is required for strays."**,
  **"Address is required for strays."**, **"Source partner is required for
  transfers."** or **"A surrendering person is required."** Fill in the
  source the **Intake Type** asks for.
- **"Cannot process re-intake: This animal is not currently archived or was
  just re-intaked."** Someone else took the animal back a moment ago. Open
  the animal's page to see it.
- **"No matching person found. Add them to the directory first, then start
  this intake."** Your account can't add people. Ask someone who manages the
  people directory to add the person.
- **Access Denied on the re-intake form.** Your account can't take animals
  in. Ask an admin.
- **"Database Error: Failed to process re-intake."** Nothing was saved. Try
  again; if it keeps happening, tell an admin.
