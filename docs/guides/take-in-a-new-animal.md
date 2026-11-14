---
title: Take in a new animal
summary: Record a new animal and the intake that brought it in, such as a stray, a surrender or a transfer, and see the care its protocol schedules.
permissions: [INTAKE_MANAGE]
aliases: [new animal, add an animal, admit an animal, intake form, new intake, stray intake, owner surrender, surrender an animal, transfer in, born in care, seized animal, impound, create intake, check in an animal, register a new animal]
related: [take-back-an-animal-that-left, correct-an-intake, find-an-intake, set-up-or-change-a-medical-protocol, record-or-correct-a-microchip, record-a-surgery-spay-neuter-or-exemption, add-edit-or-delete-a-location-or-unit, schedule-care-and-read-the-due-page]
verified: 2026-11-14
---

## When to use this

Use this when an animal arrives that has never been at the shelter. One form
records the animal, where it came from, and where it is housed. When it is
saved, the shelter's medical protocol for the animal's species and age
schedules its first care.

If the animal has been here before and left, don't add it again: see
[Take back an animal that left](./take-back-an-animal-that-left.md). To fix
an intake already recorded, see
[Correct an intake](./correct-an-intake.md).

## Steps

1. In the sidebar, open **Animals**, then click **Add Animal**. The form
   **New Animal Intake** opens.
2. Under **Animal Information**, type the **Animal Name**, then pick the
   **Species**, the **Breed** and the **Primary Color**. Pick the species
   first: the breeds listed are that species'. **Expected Adult Size** fills
   in from the breed; change it if you know better.
3. Pick the **Sex**. It starts on **Unknown**.
4. Under **Estimated Birth Date**, pick the day. A guess is fine. The animal's
   age on its intake day picks its medical protocol.
5. Fill in what else you know: **Additional Colors**, **Weight**, **Height
   (cm)** and **Description**.
6. If the scan found a chip, type it under **Microchip number**. Spaces and
   hyphens are taken out when you leave the field.
7. If the animal is already spayed or neutered, turn on **Already spayed or
   neutered**. Pick the **Procedure** (filled in for you when the sex allows
   only one) and the **Evidence**: **Owner records**, **Vet records**,
   **Tattoo** or **Scar**.
8. **Listing Status** starts on **Draft**. Leave it, or pick **Published**.
9. To house the animal, pick its **Location**, then its **Unit**. Each unit
   shows how many animals it holds, for example "A-1 · 2/1 (full)". You can
   still pick a full one. Leave **Unplaced** if you don't know yet.
10. Under **Intake & Source Details**, pick the **Intake Type**. **Intake
    Date** starts on today; change it if the animal arrived earlier. Days
    after today can't be picked.
11. Fill in the source the type asks for:
    - **Stray**: under **Location Found**, the **City**, the **State** and
      the **Address / Cross Streets**.
    - **Transfer In**: under **Transfer Details**, the **Source Partner**.
    - **Owner Surrender**: under **Surrendering Person Details**, click
      **Surrendering Person**, type part of a name, email or phone number,
      and pick the person. If they aren't in the directory, click **Add a
      new person**, fill in **New Person** and click **Create Person**.
    - **Born In Care**, **Seize**, **Service In** and **Aco Impound** need
      nothing more.
12. Add anything else about the arrival under **Internal Notes**.
13. Check the **Medical Protocol** part (see below), then click **Create
    Intake**.

You should see "Animal intake created successfully. Puppy protocol: 15
entries scheduled." (with the protocol's name and count), or just "Animal
intake created successfully." when no protocol fits the animal. The
**Animals** list opens, with the new animal on it, listed as **Draft** unless
you picked **Published**.

## What the medical protocol does

When the form knows the species, birth date and intake date, a **Medical
Protocol** part appears at the bottom if a protocol fits the animal. It shows
what will be scheduled, for example "Puppy protocol: 15 entries", then one
line per item with its due days, such as "Intake exam: Nov 14".

- Under the list, "Not scheduled:" names steps left out, and why: "microchip
  (already microchipped)" when you typed a chip, or "spay/neuter (sex
  unknown)" when the sex is **Unknown**.
- **Schedule this protocol's care** is ticked. Untick it only when the
  animal shouldn't get the protocol's care. The form then says "Nothing from
  this protocol will be scheduled. Care can still be scheduled on the
  animal's Medical tab."

After you save, open the animal, then the **Medical** tab. Each scheduled
item is under **Due**, marked "From the Puppy protocol" (with the protocol's
name). The animal's card also shows what is waiting, for example "Awaiting
intake exam, due Nov 14, 2026".

## Parts of the form only some staff see

- **Microchip number**, **Already spayed or neutered** and the **Medical
  Protocol** part are shown only to staff who can manage medical care. For
  anyone else, the protocol is still applied as the shelter set it, with no
  choice, and the message after saving still says what it scheduled. Ask a
  staff member who manages medical care to record the chip or the spay or
  neuter on the animal's **Medical** tab afterwards.
- **Add a new person** is offered only to staff who can manage the people
  directory. Anyone else sees "No matching person found. Add them to the
  directory first, then start this intake." Ask someone who manages people
  to add the person, then fill in the form.

## If something goes wrong

- **"Animal name is required."**, **"Pick a species."**, **"Pick a
  breed."**, **"Pick a primary color."** or **"Estimated birth date is
  required."** Fill in every field marked with *.
- **"City is required for strays."**, **"State is required for strays."** or
  **"Address is required for strays."** Fill in the **Location Found** part.
- **"Source partner is required for transfers."** Pick the **Source
  Partner**.
- **"A surrendering person is required."** Pick the **Surrendering Person**.
- **"That chip number is already on Walkie's record."** (with the other
  animal's name) The chip belongs to an animal already in the app. Check the
  number. If it is right, the animal may have been here before: see
  [Take back an animal that left](./take-back-an-animal-that-left.md).
- **"A chip number is 9 to 15 letters or digits."** or **"A chip number has
  only letters and digits."** Check the number on the scanner.
- **"Pick spay or neuter."** or **"Say what shows the surgery was done before
  intake."** Fill in **Procedure** and **Evidence**, or turn off **Already
  spayed or neutered**.
- **"The primary color shouldn't be repeated in additional colors."** Remove
  it from **Additional Colors**.
- **"The intake date can't be in the future."** Pick today or an earlier day.
- **Access Denied** when you open the form. Your account can't take animals
  in. Ask an admin.
- **"Database Error: Failed to create intake record."** Nothing was saved.
  Try again; if it keeps happening, tell an admin.
