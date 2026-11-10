---
title: Add, edit or retire a medical catalog item
summary: Add a vaccine, test, treatment or medication to the catalog, choose which species it is for, change it, or retire it so staff can no longer pick it.
permissions: [MEDICAL_SETTINGS_MANAGE]
aliases: [add a vaccine, new vaccine, add a medication, add a test, add a treatment, which species a vaccine is for, retire a vaccine, rabies vaccine setting, default dose, analytes, combination test, medical settings, medical catalog]
related: [set-up-or-change-a-medical-protocol, record-a-vaccine-test-or-treatment, order-a-medication-and-record-doses, medical-status-glossary]
verified: 2026-11-10
---

## When to use this

The catalog is the list staff pick from when they record a vaccine, test or
treatment, and when they order a medication. Use this guide to add to it,
change an item, or take an item out of use. It needs the permission to manage
medical settings, which not everyone who gives care holds.

To have care scheduled automatically when an animal is admitted, see
[Set up or change a medical protocol](./set-up-or-change-a-medical-protocol.md).

## Add an item

1. In the sidebar, open **Settings**, then the **Medical** card. The
   **Catalog** tab opens.
2. Click **Add Item**.
3. Under **Kind**, pick **Vaccine**, **Test**, **Treatment** or **Medication**.
   The fields below change with the kind.
4. Type the **Name**, for example "DHPP". **Manufacturer** is optional.
5. Fill in what the kind shows:
   - **Vaccine**: **Repeat every (days)**, **Default route**, and the
     **Rabies vaccine** switch. Turn the switch on for a rabies vaccine: it
     asks for a tag number and duration when staff record it, and works out the
     day it is valid until.
   - **Test**: **Repeat every (days)** and the **Analytes**. An analyte is
     what the test reports a result for. Type each one, for example "FeLV
     antigen", and click **Add analyte** for the next. A combination test has
     one per result. Use the arrows to put them in the order staff enter them.
   - **Treatment**: **Repeat every (days)**, **Default route**, and a
     **Default dose** with its **Unit**.
   - **Medication**: **Default route** and a **Default dose** with its
     **Unit**. It has no repeat: each order says how often.
6. Under **Species**, tick the species the item is for. See
   [Choose which species an item is for](#choose-which-species-an-item-is-for).
7. Click **Create Item**.

You should see "DHPP added to the catalog." (with your item's name). The item
appears under its kind, with what you set under its name, for example "Dog ·
Acme Vet · Repeats every 28 days".

The defaults fill in the form when staff record the item, and they can change
them. A repeat interval is how many days later the recording form offers to
schedule the next one.

## Choose which species an item is for

Staff only see the items that fit the animal in front of them. For example, a
cat's **Vaccine** list shows the items ticked for **Cat** and the items with no
species ticked, and none of the dog-only ones. Protocol steps work the same
way.

- Tick one or more species to limit the item to them.
- Leave all unticked for an item that applies to every species. The row reads
  "All species".

To change it later, edit the item (next section) and tick or untick species.

## Edit an item

1. On the item's row, click the **…** button, then **Edit**.
2. Change what you need. Changes to the name show on entries already recorded.
   Changes to the defaults apply to new entries only.
3. Click **Update Item**.

You should see "DHPP updated." (with the item's name), and the row shows the
change.

Some things you can't change:

- **Kind**. Once an item has been recorded on an animal, ordered for an
  animal, or used as a step in a protocol, **Kind** is greyed out and says why,
  for example "Recorded on animals, so its kind can't change." Retire the item
  and add a new one.
- A test's analytes are retired, not deleted. Remove an analyte and results
  already recorded keep it. The form lists retired ones, and adding one back
  under the same name restores it.

If you narrow an item to other species, a protocol step that uses it stops
scheduling care for the species you took away. The protocol's row says so; see
[Set up or change a medical protocol](./set-up-or-change-a-medical-protocol.md).

## Retire an item

Retire an item staff should stop using, for example an old stock. Items are
never deleted.

1. On the item's row, click the **…** button, then **Retire**. There is no
   confirmation, so check the name first.

You should see "Item retired." The row turns grey and shows **Retired**.
Staff can no longer pick it for new entries or orders, and a protocol step
that uses it stops scheduling. Entries and orders that already use it keep it.

To bring it back, click **…**, then **Unretire**. You should see "Item
unretired."

## If something goes wrong

- **"Name is required."** Type a name under **Name**.
- **A vaccine named "DHPP" already exists.** A name can be used once for each
  kind, in any capitals. Pick another name, or edit the existing item. If the
  message says it is a retired one (A retired vaccine named "…" already exists.
  Unretire it instead.), unretire that item.
- **"A default dose needs a unit."** Pick the **Unit**, or clear the **Default
  dose**.
- **"The dose must be more than zero."** Check the **Default dose**.
- **"The analyte "…" is listed twice."** Each analyte of a test needs its own
  name, in any capitals.
- **"Every analyte needs a name."** or **"A test needs at least one
  analyte…"** Fill in each analyte, or remove the empty row. A test needs at
  least one.
- **"At least one day."**, **"Use a whole number of days."** or **"At most …
  days (five years)."** Check **Repeat every (days)**.
- **"This item is already retired."** or **"This item isn't retired."**
  Someone else just changed it. The page refreshes to show how the row is now.
- **"…" was an analyte of this test. Add it back under that name instead of
  giving the name to another.** The name belongs to an analyte you removed
  earlier. Use that exact name for the analyte you mean, or pick another name.
- **Kind is greyed out.** See [Edit an item](#edit-an-item).
