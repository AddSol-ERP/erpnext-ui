/** Blank line overrides intentionally clear optional global defaults. */
export function directIssueLineFields(row, defaults) {
  return {
    s_warehouse: row.issue_warehouse ?? defaults.warehouse ?? "",
    project: row.issue_project ?? defaults.project ?? "",
    custom_store_work_order: row.issue_work_order ?? defaults.workOrder ?? "",
    custom_store_requested_by: row.issue_requested_user ?? defaults.requestedUser ?? "",
  };
}
