---
title: "Glossary: what Overdue, Missed, Altered and Exempt mean"
summary: What the status words on medical pages mean, exactly as the app works them out.
permissions: [MEDICAL_READ, MEDICAL_ADMINISTER, MEDICAL_MANAGE]
aliases: [overdue meaning, missed dose, what does altered mean, spay neuter status, exemption lapsed, declined vs voided]
related: [schedule-care-and-read-the-due-page, record-a-vaccine-test-or-treatment, correct-or-void-an-entry, record-reschedule-or-decline-scheduled-care, order-a-medication-and-record-doses, open-a-care-episode-add-a-condition-or-allergy, record-or-correct-a-microchip, verify-a-fosters-vet-visit-report]
verified: 2026-11-10
---

## When to use this

Use this when a medical page shows a status word and you want to know exactly
what it means. Days are the shelter's days, in the shelter's time zone, not
your computer's.

## Due dates

### Overdue

Scheduled care whose due date is before today. The Due page says how late
it is ("3 days overdue"); the animal's **Medical** tab shows an **Overdue**
badge. It stays overdue until someone records, declines, reschedules or voids
it. A spay/neuter exemption whose review day has passed is overdue for review
in the same way.

### Due today

Scheduled care whose due date is today.

### Upcoming

Scheduled care due in the next 7 days. The Due page shows nothing further
ahead; the animal's **Medical** tab shows all of it.

## Medication doses

Each medication order expects a dose at set times each day (**AM**,
**Midday**, **PM**), depending on how often it is given.

### Due

The dose time hasn't ended yet and nothing is recorded for it.

### Missed

The dose time has ended and nothing is recorded for it. When each time ends
is set by an admin in the shelter's dose time settings. A dose recorded as
**Refused** or **Not given** is accounted for, so it isn't missed. A missed
dose can still be recorded with **Give** if it was given late.

### Given, Refused, Not given

What was recorded for the dose: it was given, the animal wouldn't take it, or
it wasn't given for a reason someone wrote down.

## Medication orders

- **Active**: it has started, and hasn't ended or been stopped. An order
  given every few days or as needed can be active on a day with no dose due.
- **Starts** *day*: ordered for a later start. No dose is expected yet.
- **Ended** *day*: its end date has passed.
- **Discontinued from** *day*: someone stopped it, with a reason. No dose is
  expected from that day on.
- **Voided**: it should never have been ordered. Its doses count for nothing.

## Spay and neuter

The app works out an animal's spay/neuter status from its medical record each
time you look. Nothing is stored, so recording, correcting or voiding an entry
changes it at once. It is one of these, checked in this order.

### Altered

A spay or neuter is recorded as given, from any source, including before
intake. It is shown as "Altered (neuter, Nov 3, 2026)", or "date unknown"
when nobody knows the day; the animal's profile says "Yes (neuter)". Altered
wins over any exemption. An exam that found the animal already altered
doesn't make it Altered on its own: only a surgery entry does.

### Exempt

Someone declined the spay or neuter and gave a reason (too young or
underweight, medical risk, partner will alter, or other), and the exemption
still holds: its review day is today or later, or it has no review day. Shown
as "Exempt until Nov 3, 2026: too young or underweight".

From 7 days before its review day, a **Spay/neuter exemption review** row
appears on the Due page. Settle it with **Schedule spay/neuter** or **Record a
new exemption**. When the review day passes, the exemption **lapses**: the
entry shows **Exemption lapsed** and the status falls back to Intact or Not on
record.

### Intact

Not Altered or Exempt, and the latest exam that recorded the animal's
reproductive status found it intact. Shown as "Intact (exam Oct 3, 2026)".

### Not on record

None of the above.

## Entries

### Declined

Scheduled care that won't be given, with the reason someone gave. It leaves
the due list and stays on the record. A decline is final.

### Voided

An entry that should never have been recorded. It stays on **History**,
struck through, with who voided it and why, and no longer counts anywhere
else. A void can't be undone.

## Problem list

### Active, Chronic, Resolved

A condition or allergy is **Active** while the animal has it, **Chronic** when
it is long term, and **Resolved** once it has cleared up, with the day. The
list shows allergies first, then the conditions the animal lives with, then
those resolved.

### Open care episode

The animal is under vet care or hospitalised now. It has no end date yet, and
shows at the top of the animal's page. An animal has one open episode at a
time; once closed, the episode shows its start and end days.

## Microchip registration

- **Unknown**: nobody has checked.
- **Not registered**: the chip isn't registered with any registry.
- **Pending**: sent to a registry, not confirmed yet. Shows the registry, if
  given.
- **Registered**: confirmed with a registry. Shows the registry and, if known,
  the day.

## Foster reports

- **Waiting for review**: a foster reported an outside vet visit and nobody
  at the shelter has looked at it. It is listed on the Due page.
- **Reviewed**: staff recorded what the paperwork supports and marked it
  reviewed.
- **Dismissed**: staff decided there was nothing to record, and said why. The
  report and its paperwork stay on the record.
