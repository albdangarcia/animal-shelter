---
title: Edit an animal's details
summary: Correct an animal's name, species, breed, colors, sex, birth date, size, height or description, or change its listing between Draft and Published.
permissions: [ANIMAL_INFO_MANAGE]
aliases: [edit profile, change animal name, wrong breed, mixed breed, additional breeds, wrong birth date, publish an animal, unpublish, listing status, expected adult size]
related: [move-an-animal-to-another-unit, find-an-animal, record-weight-and-vitals, record-or-correct-a-microchip, record-a-surgery-spay-neuter-or-exemption, correct-an-intake, add-edit-or-delete-a-species-breed-or-color]
verified: 2026-11-16
---

## When to use this

Use this to correct or update what the record says about the animal itself:
its name, species, breed, colors, sex, estimated birth date, expected adult
size, height, description, and whether its listing is a draft or published.

Some details are kept elsewhere, where each change keeps its history:

- **Weight** comes from the animal's **Vitals** page. Record a new weigh-in
  there.
- The microchip and the spay or neuter are on the **Medical** tab.
- Where the animal is housed: see
  [Move an animal to another unit](./move-an-animal-to-another-unit.md).
- How and when it came in is on its intake: correct the intake from the
  **Intakes** list.

## Steps

1. Open the animal, then click **Edit Profile**. The page **Edit Animal
   Details** opens. (On the **Animals** list, the **…** button at the end of
   a row, then **Edit**, opens it too.)
2. Change what is wrong: **Animal Name**, **Species**, **Breed**,
   **Additional Breeds**, **Primary Color**, **Additional Colors**, **Sex**,
   **Estimated Birth Date**, **Expected Adult Size**, **Height (cm)** or
   **Description**. Pick the species first: the breeds listed are that
   species'. A mixed animal shows one breed under **Breed** and the others
   under **Additional Breeds**; click the **×** on a breed to take it off.
   Pick one of them as **Breed** instead and it leaves **Additional Breeds**.
   Picking another breed fills in an empty **Expected Adult Size** with that
   breed's usual size.
3. To change the listing, pick **Draft** or **Published** under **Listing
   Status**.
4. Click **Save Changes**.

You should see "Animal updated successfully." The animal's record opens with
the change.

A change of listing status is kept twice: the **Activity** tab shows "Olivia
Chen changed the status" (with your name), and **Show details** says
"Listing status changed from DRAFT to PUBLISHED." The **Journey** tab lists it
as **Status Change**.

**Weight** on the form can't be changed. It shows the latest weigh-in and its
day, for example "14.6 kg as of May 20, 2026". Click **View vitals history**
to see or record weigh-ins.

## When the listing status is locked

**Pending Adoption** and **Archived** are set for you: an approved adoption
application makes an animal **Pending Adoption**, and an outcome archives it.
For such an animal, **Listing Status** is greyed out. Point at or click the
warning icon beside it to read "Status is locked. It can only be changed via
the application or outcome process."

An archived animal has left the shelter, so its **Location** and **Unit** are
greyed out too.

## If something goes wrong

- **"Animal name is required."**, **"Pick a species."**, **"Pick a
  breed."** or **"Pick a primary color."** Fill in every field marked with *.
- **"The primary color shouldn't be repeated in additional colors."** Remove
  it from **Additional Colors**.
- **"Height must be a positive number."** Type the height in centimeters, or
  leave it empty.
- **"The selected species is no longer available. Please refresh and try
  again."** (or "The selected breed is no longer available for this
  species…", "One or more additional breeds are no longer available for this
  species…", or "One or more selected colors are no longer available…") An
  admin deleted it while you had the form open. Reload the page and pick
  another.
- **"Database Error: Failed to update animal record."** Nothing was saved.
  Try again; if it keeps happening, tell an admin.
