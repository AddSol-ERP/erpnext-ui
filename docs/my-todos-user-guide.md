# My To-Dos: User Guide

This guide explains the **My To-Dos** card on the Home page, the To-Do list, and Notification-generated tasks.

## What is a To-Do?

A To-Do is the ERP system's built-in task record. It can be assigned to a user, given a due date, priority, color, description, and a reference to another document. This feature uses the system's existing task functionality.

## My To-Dos on Home

The Home card shows open tasks assigned to the currently logged-in user. It separates tasks into two sections:

- **Action Needed** — tasks that need you to do something.
- **For Information** — tasks shared for awareness; no action is expected.

Each row can show its description, reference document, due date, priority, and color accent. The card shows up to three rows at a time in each section; scroll inside a section to see more. A count beside each section title shows how many tasks are in that section.

Select a task to open its standard To-Do form in the ERP system. **View all** opens your To-Do list, where you can search and review additional details. Use the form to update the task or change its status. Tasks with status **Closed** or **Cancelled** no longer appear in the Home card.

## Understanding task details

- **Description** explains the task. Notification rules can fill it from a Jinja template.
- **Due Date** indicates when the task is expected. A blank date means no due date was set.
- **Priority** is High, Medium, or Low. High and Low priorities are emphasized on the Home card.
- **Color** is a visual marker. It appears as a colored accent on the Home card; it does not change task behavior.
- **Reference** links the task to the document that prompted it. Open the reference only if you have permission to read that document.
- **Status** controls whether the task is still open. Close a completed task; cancel one that should no longer be done.

## How Notification-generated tasks work

An administrator can enable **Create To-Do** on a Notification rule. The system still checks when that rule's event and condition match and sends its configured alerts. Creating a To-Do is an additional action.

The administrator configures:

1. **To-Do Description Template** — text or Jinja, for example `Review {{ doc.name }}`.
2. **Assign To** — one of:
   - **Specific User** — one selected user.
   - **User Field** — a User link on the source document, such as its owner.
   - **Role** — every enabled user who has the selected role.
3. **Due Date Fieldname** (optional) and **Due Date Offset (Days)** — use a Date or Datetime field from the source document, then add or subtract days. If no field is selected, the offset is applied to today.
4. **To-Do Priority**, **To-Do Color**, and **For Information Only** — how the task should appear and whether it is FYI.

Before assigning or refreshing a task, the system checks whether that assignee can read the specific source document. If access is denied, no task is assigned to that user. The denial is recorded in the system's **Error Log** under **Notification To-Do Skipped: No Source Access**, including the Notification, assignee, and source document. Permission-check errors are also logged, and the task is not assigned.

Repeated matching events update the same open task instead of creating duplicates. Closed or cancelled tasks are terminal and are not reopened by later matching events.

## Troubleshooting

### I cannot see a task on Home

- Confirm the task is assigned to your logged-in user.
- Confirm its status is **Open**. Closed and Cancelled tasks are hidden from Home.
- Check **View all** in case you are looking for a task outside the Home card's scroll area.
- FYI tasks appear in **For Information**; action tasks appear in **Action Needed**.

### A Notification did not create a task

- Confirm the Notification is enabled and its event and condition matched the source document.
- Confirm **Create To-Do** is enabled and the description template produces non-empty text.
- Check that the selected user is enabled, the User Field contains a valid user, or the Role has enabled users.
- Confirm the target user has read access to the source document. Otherwise the task is intentionally skipped.
- Ask an administrator to review **Error Log** for **Notification To-Do Skipped: No Source Access** or **To-Do Access Check Failed**.

### Clicking a task does not open it

The task opens in the ERP system's standard To-Do form in a new tab. Sign in there if prompted. If the source reference is unavailable, ask an administrator to verify that your access to the referenced document is still current.

### The To-Do card reports a loading error

Refresh the page and try again. If the issue continues, ask an administrator to check the system Error Log and contact support if needed.

## Permission changes after assignment

The source-document access check runs when a Notification creates or refreshes a task. It does not continuously monitor later permission changes. If access is revoked after assignment, an administrator should review and cancel the task as appropriate.
