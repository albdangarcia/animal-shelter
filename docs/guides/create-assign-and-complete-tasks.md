---
title: Create, assign and complete tasks
summary: Add a to-do for an animal, assign it and set its due date, mark its progress, and see every animal's tasks on one page.
permissions: [ANIMAL_TASK_MANAGE]
aliases: [animals that have left, to-do, add a task, assign a task, due date, overdue task, mark done, trash a task, restore a task]
related: [review-and-undo-the-assistants-changes, add-edit-or-delete-a-note, record-an-outcome, take-back-an-animal-that-left]
verified: 2026-11-22
---

## When to use this

A task is a job someone has to do for an animal, such as a weigh-in or a
recheck. Each one belongs to one animal and can be assigned to a staff member
or a volunteer. Tasks are added on the animal's **Tasks** tab. The **Animal
Tasks** page in the sidebar lists every animal's tasks together.

If the AI assistant changed a task's status for you, see
[Review and undo the assistant's changes](./review-and-undo-the-assistants-changes.md).

## Add a task

1. Open the animal, then the **Tasks** tab.
2. Click **Add Task**. The box **Create Task** opens.
3. Type the **Title**, for example "Weigh-in", and any **Details**.
4. Pick the **Category**: **Medical**, **Behavioral**, **Administrative**,
   **Cleaning** or **Feeding**.
5. **Status** starts on **Todo** and **Priority** on **Medium**. Change them
   if needed.
6. To give it a deadline, click **Due Date** and pick the day. Days before
   today can't be picked. Click outside the calendar to close it.
7. Under **Assign to**, pick who should do it, or leave it empty.
8. Click **Create Task**.

You should see "Task created successfully." The task is listed with its
**Status**, **Category**, **Priority**, **Assignee** and **Due Date**, for
example "in 10 days". A task still **Todo** or **In Progress** after its due
day shows the date in red, for example "Overdue by 3 days".

## Assign or reassign a task

1. In the **Assignee** column, click the name (or **Unassigned**).
2. Pick a person, or **Unassigned**.

You should see "Assignee updated successfully."

## Mark progress

1. Click the **…** button at the end of the task's row.
2. Point at **Status**, then pick **Todo**, **In Progress**, **Done**,
   **Skipped**, **Canceled** or **On Hold**.

You should see "Task status updated". The animal's **Activity** tab keeps
each change, for example "Task "Weigh-in" status changed from TODO to DONE."

## Change a task

1. Click the **…** button on the task, then **Edit**. The box **Edit Task**
   opens.
2. Change what you need. To remove the due date, click the **x** beside it.
3. Click **Update Task**.

You should see "Task updated successfully."

## Move a task to the trash

1. Click the **…** button on the task, then **Move to Trash**.

You should see "Task moved to trash." Click **Undo** on that message to put
it back as it was.

A trashed task isn't gone for good: it stays on the list with the status
**Deleted**. To see only those, click **Status** and tick **Deleted**. Anyone
who can manage tasks can bring one back: click its **…** button, point at
**Status** and pick the status it should have.

## See every animal's tasks

1. In the sidebar, open **Animal Tasks**.

Each row names its **Animal**; click the name to open that animal's
**Tasks** tab. Type in **Filter by task title...**, or use **Category**,
**Status** and **Due**, to narrow the list. **Due** picks tasks by their due
date against today: **Overdue**, **Due today**, **Due later** or **No due
date**. Turn on **Hide animals that have left** to leave out the tasks of
animals that were adopted, transferred or died; without it they are listed
too, and the dashboard home page never counts them. The **…** button on each row works as on the
animal's **Tasks** tab. New tasks are added from the animal's own **Tasks**
tab.

## Tasks of an animal that leaves

When an animal leaves through an outcome, such as an adoption, a transfer or a
death, its tasks still **Todo**, **In Progress** or **On Hold** are set to
**Canceled**, and its **Activity** says why, for example "Task "Weigh-in"
status changed from TODO to CANCELED: the animal left (adoption)." While it is
archived, no task can be added to it or set back to **Todo**, **In Progress**
or **On Hold**. If an admin reverses the outcome, the tasks go back to the
status they had.

## If something goes wrong

- **"Title is required."** or **"Category is required."** Fill in the
  fields marked with *.
- **"This animal has left the shelter, so it can't have open tasks. To add
  or reopen one, re-intake the animal first."** The animal was adopted,
  transferred or otherwise left, and its open tasks were canceled then. You
  can still mark its tasks **Done**, **Skipped** or **Canceled**, or trash
  them. If the animal is back, ask someone who takes animals in to record
  its re-intake first.
- **"Database Error: Failed to create task."** Nothing was saved. Try again;
  if it keeps happening, tell an admin.
