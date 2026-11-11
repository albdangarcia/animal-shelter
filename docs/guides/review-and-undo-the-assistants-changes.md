---
title: Review and undo the assistant's changes
summary: See every change the AI assistant made to shelter data, who approved it, and undo one that was a mistake.
permissions: [AI_ACTIVITY_READ, ANIMAL_TASK_MANAGE]
aliases: [AI activity, assistant changes, undo assistant, revert AI change, what did the assistant do, AI marked task done, chatbot changed a task, AI log, audit assistant]
verified: 2026-11-10
---

## When to use this

When you ask the AI assistant to change something and approve it, the change
is saved and listed on the AI Activity page. Today the only change it can
make is a task's status, for example marking "Weigh-in" as **Done**. The
chat itself isn't kept, so this page is the record of what it did.

Use this guide to check what the assistant changed, or to put a task back the
way it was. To change a task yourself, open the animal's **Tasks** tab
instead.

## See what the assistant changed

1. In the sidebar, open **Settings**, then the **AI Activity** card.

Each row is one change, newest first:

- **When**: the day it was made.
- **Who**: the person who approved it in the chat.
- **What**: what kind of change it was, for example "Task status change".
- **Target**: the task and the animal, for example "Weigh-in and body
  condition score · Frisco". Click it to open the animal's **Tasks** tab.
- **Change**: the status before and after, for example **Todo** → **Done**.
- **State**: **Undone** if someone has undone it, empty if not.

To narrow the list, click **State** and pick **Active** or **Undone**, or
click **Actor** and pick a person. Click **Reset** to show every row again.

## Undo a change

1. On the change's row, click the **…** button, then **Undo this change**.

You should see "Change undone." The row now shows **Undone** under **State**,
and the task is back to the status it had before, shown on the left under
**Change**. The animal's **Activity** tab lists the undo as your change, for
example "Olivia Chen updated a task's status".

A change can be undone once. Its **…** menu then reads **Already undone**,
greyed out.

## If something goes wrong

- **"This task was changed after the assistant modified it, so it can't be
  undone automatically."** Someone changed the task again after the
  assistant did. The app won't overwrite their change. Open the task from
  **Target**, check its status, and change it by hand if it is still wrong.
- **"This change has already been undone."** Someone else undid it a moment
  ago. Reload the page to see it.
- **"The task this change applied to no longer exists."** The task was
  deleted, so there is nothing to put back.
- **No … button on the rows.** Undoing needs the permission to manage tasks.
  Ask an admin.
