### eSSL report import

After updating the app, run `bench setup requirements` and `bench --site <site> migrate`,
then restart the bench processes. A background worker for the `long` queue must be running.
Open **HR → eSSL Attendance Import** in Addsol UI (`/addsol_ui#/hr/attendance-import`).
The old `/app/essl-attendance-import` Desk bookmark redirects to this screen.
The feature is fully owned by `erpnext_ui`; `aitspl_integration` is not required.
HR import roles, the app's employee/department scope, and normal Employee,
Employee Checkin and Attendance permissions are enforced on the server.

1. Select the company and upload an eSSL **Monthly Status Report (Detailed Work Duration)**
   binary `.xls` file (single month, up to 5 MB / 10,000 attendance days).
2. Click **Preview / validate**. Suggestions compare report codes against Employee IDs,
   Employee Numbers and numeric ID suffixes, together with exact employee names.
   A unique exact name can also suggest a match. Device IDs are never used.
3. Review every suggested employee and select ERPNext employees for unresolved matches.
   Conflicting codes/names and duplicate names need manual mapping. Mapping two report
   employees to the same ERPNext employee is blocked. Validate again after edits.
   Reviewed mappings are saved automatically when importing, or immediately with
   **Save mappings**. They are shared across authorised HR users for that company,
   keyed by eSSL employee code. Future uploads prefer the saved selection. If the
   report name changes or the employee becomes inactive/inaccessible, select again.
   Clear a selection and save to forget it. Changing a mapping still invalidates
   the preview and requires validation before importing.
4. Review dates, status, duration, missing punches, assigned ERPNext shifts and existing records.
   Shift codes in the file are ignored. Submitted active Shift Assignments for the date
   take precedence over the Employee default shift. Unresolvable multiple shifts block
   that day; missing shifts are displayed as warnings.
5. Click **Import**. Attendance is created as drafts unless **Submit created Attendance**
   is checked. Submission invokes the site's existing attendance hooks. If Attendance
   has an active workflow, create drafts and approve them through that workflow instead.
   Imports run in the background; the page shows totals and failed days. Reopen it in
   the same browser tab to resume monitoring a running import.

The report's attendance status and net work duration are used; ERPNext validation
(including approved leave) still runs. `P`/`WOP`/`HP` map to Present, `A` to Absent,
and `½P`/`H½P` to Half Day. `WO` and `H` without punches are skipped.
Only days with both valid IN and OUT punches are imported. Missing or invalid punches
skip the employee/day entirely: no Checkins and no Attendance of any status, including
Absent or Half Day. Earlier OutTime values roll over to the following day; equal
timestamps and Absent status conflicting with punches are skipped. Malformed report
rows are reported and skipped while valid days can proceed. Missing punches are never
reconstructed from duration.

Any existing non-cancelled Attendance causes the entire employee/day to be skipped.
Otherwise, existing same-timestamp Checkins are reused, including synced punches with
blank directions. Existing punch times/directions are preserved; reused Checkins require
write permission. Imported/reused Checkins are linked to the new Attendance and marked
to skip auto attendance, preventing the scheduler from processing the same report day.
Each failed day rolls back its records together and appears in the result; successful
days remain imported. Re-imports skip those days. Saved mappings do not alter
Employee master data. They persist in the stock `DefaultValue` table under a private
app parent, separated from global/user defaults; no custom DocType is required.

The review screen uses separate **Employee mapping** and **Attendance preview** tabs.
Mapping shows all employees, including saved selections, with search and eight rows
per page. Optionally enable the unresolved-only filter. **Edit employee mappings**
on the preview opens the editable mapping table; saving replaces the remembered choices. The preview has search,
ready/skipped/warning filters and a monthly grid: one employee per row, one day per
column, paginated by fifteen employees. The employee column stays fixed while days
scroll horizontally; day headers stay visible during vertical scrolling. Cells show
report status and work hours, with colours for ready/skipped/warning entries. Select
a day to inspect punches, assigned shift and notes. Blank days do not imply absence.
Both tables have bounded scroll areas. Source settings collapse after loading a
report, and result errors are expandable, so monthly reports do not make one long page.

The sample report used for verification contained 20 employees, 476 attendance days,
and 29 days with incomplete punches. Personal source files are not bundled with the app.

### Moving from aitspl_integration

Deploy the changes in both repositories together. Install the relocated `xlrd`
dependency with `bench setup requirements`, migrate the site to refresh the legacy
Desk redirect, and restart web and background workers. Finish any jobs queued against
the old `aitspl_integration.attendance.essl_import` module before deploying the move.
The React production assets are rebuilt in `erpnext_ui/public/erp_ui`.

Existing Attendance, Checkins and employee master data are not migrated or modified
by this code move. The new importer checks those same stock ERPNext/HRMS records,
so importing a previously imported report skips existing attendance days.

