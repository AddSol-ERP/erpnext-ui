/**
 * Doctype Display Configuration
 *
 * For each doctype, define:
 * - list: which fields to show as title, subtitle, meta, and status
 * - searchFields: fields to search against
 * - baseFilters: default filters applied to list queries
 * - fields: explicit field list to fetch (optional — auto from metadata if omitted)
 *
 * Pattern:
 *   titleField  → displayed as the primary row text (bold)
 *   subtitleField → secondary row text (grey)
 *   metaField   → extra info shown on desktop (date, amount, etc.)
 *   statusField → drives the status badge color
 */
export const DOCTYPE_CONFIG = {
  // ============================
  // HR MODULE
  // ============================
  Employee: {
    list: {
      titleField: "employee_name",
      subtitleField: "designation",
      metaField: "department",
      statusField: "status",
    },
    searchFields: ["employee_name", "employee", "designation"],
    printFormat: "Employee Appointment Letter",
    // Large master → force multi-step form (overrides auto layout)
    form: { layout: "stepper" },
  },
  Department: {
    list: {
      titleField: "department_name",
      subtitleField: "",
      metaField: "",
      statusField: "disabled",
    },
    searchFields: ["department_name"],
    baseFilters: [],
  },
  Designation: {
    list: {
      titleField: "designation_name",
      subtitleField: "",
      metaField: "",
      statusField: "",
    },
    searchFields: ["designation_name"],
  },
  "Leave Type": {
    list: {
      titleField: "leave_type_name",
      subtitleField: "max_days",
      metaField: "",
      statusField: "is_active",
    },
    searchFields: ["leave_type_name"],
    form: { layout: "single" },
  },
  "Holiday List": {
    list: {
      titleField: "holiday_list_name",
      subtitleField: "",
      metaField: "",
      statusField: "",
    },
    searchFields: ["holiday_list_name"],
  },
  Attendance: {
    list: {
      titleField: "employee_name",
      subtitleField: "employee",
      metaField: "attendance_date",
      statusField: "status",
    },
    searchFields: ["employee_name", "employee"],
    baseFilters: [],
  },
  "Salary Structure": {
    list: {
      titleField: "name",
      subtitleField: "company",
      metaField: "",
      statusField: "is_active",
    },
    searchFields: ["name"],
    nativeForm: true,
  },
  "Overtime Log": {
    list: {
      titleField: "employee_name",
      subtitleField: "employee",
      metaField: "attendance_date",
      statusField: "status",
    },
    searchFields: ["employee_name", "employee"],
    readOnly: true,
  },
  "Salary Slip": {
    list: {
      titleField: "employee_name",
      subtitleField: "employee",
      metaField: "posting_date",
      statusField: "docstatus",
    },
    searchFields: ["employee_name", "employee"],
    readOnly: true,      // renders ERPNext print format instead of editable form
    printFormat: "Salary Slip",  // custom print format name for this doctype
  },
  "Job Opening": {
    list: {
      titleField: "job_title",
      subtitleField: "designation",
      metaField: "publish",
      statusField: "status",
    },
    searchFields: ["job_title", "designation"],
  },
  "Job Applicant": {
    list: {
      titleField: "applicant_name",
      subtitleField: "email_id",
      metaField: "job_title",
      statusField: "status",
    },
    searchFields: ["applicant_name", "email_id"],
  },

  // ============================
  // SALES MODULE
  // ============================
  Customer: {
    list: {
      titleField: "customer_name",
      subtitleField: "customer_type",
      metaField: "territory",
      statusField: "disabled",
    },
    searchFields: ["customer_name", "name"],
  },
  Lead: {
    list: {
      titleField: "lead_name",
      subtitleField: "company_name",
      metaField: "status",
      statusField: "status",
    },
    searchFields: ["lead_name", "company_name", "email_id"],
  },
  Opportunity: {
    list: {
      titleField: "opportunity_from",
      subtitleField: "customer_name",
      metaField: "expected_closing",
      statusField: "status",
    },
    searchFields: ["customer_name", "opportunity_from"],
    nativeForm: true,
  },
  Quotation: {
    list: {
      titleField: "customer_name",
      subtitleField: "name",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["customer_name", "name"],
    nativeForm: true,
  },
  "Sales Order": {
    list: {
      titleField: "customer_name",
      subtitleField: "name",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["customer_name", "name"],
    nativeForm: true,
  },
  "Sales Invoice": {
    list: {
      titleField: "customer_name",
      subtitleField: "name",
      metaField: "posting_date",
      statusField: "status",
    },
    searchFields: ["customer_name", "name"],
    nativeForm: true,
  },
  Item: {
    list: {
      titleField: "item_name",
      subtitleField: "item_code",
      metaField: "item_group",
      statusField: "disabled",
    },
    searchFields: ["item_name", "item_code"],
  },

  // ============================
  // PURCHASE MODULE
  // ============================
  Supplier: {
    list: {
      titleField: "supplier_name",
      subtitleField: "supplier_type",
      metaField: "",
      statusField: "disabled",
    },
    searchFields: ["supplier_name", "name"],
  },
  "Purchase Order": {
    list: {
      titleField: "supplier",
      subtitleField: "name",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["supplier", "name"],
    nativeForm: true,
  },
  "Purchase Receipt": {
    list: {
      titleField: "supplier",
      subtitleField: "name",
      metaField: "posting_date",
      statusField: "status",
    },
    searchFields: ["supplier", "name"],
    nativeForm: true,
  },
  "Purchase Invoice": {
    list: {
      titleField: "supplier",
      subtitleField: "name",
      metaField: "posting_date",
      statusField: "status",
    },
    searchFields: ["supplier", "name"],
    nativeForm: true,
  },
  "Supplier Quotation": {
    list: {
      titleField: "supplier",
      subtitleField: "name",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["supplier", "name"],
    nativeForm: true,
  },
  "Request for Quotation": {
    list: {
      titleField: "name",
      subtitleField: "company",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["name"],
    nativeForm: true,
  },

  // ============================
  // STOCK MODULE (enhancements)
  // ============================
  Warehouse: {
    list: {
      titleField: "warehouse_name",
      subtitleField: "company",
      metaField: "",
      statusField: "disabled",
    },
    searchFields: ["warehouse_name"],
  },

  // BOM is a stock master but it is the *bridge* from Project to items: the
  // Store module resolves "which items does this project need" by looking up
  // `BOM.project` and exploding that BOM (erpnext_ui.api.get_project_items).
  //
  // A BOM with no project is invisible to that lookup, so tagging a BOM with a
  // project is a prerequisite for project-scoped indents. It is exposed through
  // GenericForm rather than the desk so whoever owns engineering can do it
  // without leaving the SPA.
  //
  // `project` is deliberately part of searchFields: with ~1 BOM per project on
  // a manufacturing site, "which BOM belongs to project X" is the first question
  // anyone asks, and the list is filtered far more often than it is browsed.
  BOM: {
    list: {
      titleField: "item_name",
      subtitleField: "name",
      metaField: "modified",
      statusField: "docstatus",
    },
    searchFields: ["name", "item_name", "project"],
    baseFilters: [["is_active", "=", 1]],
    form: { layout: "tabs" },
  },

  "Stock Reconciliation": {
    list: {
      titleField: "name",
      subtitleField: "company",
      metaField: "posting_date",
      statusField: "docstatus",
    },
    searchFields: ["name"],
    nativeForm: true,
  },

  // NL-only (addsol_nl_custom). A submittable stock document that consumes a
  // source Serial No and, on submit, creates and submits a Repack Stock Entry
  // moving the offcuts back into the same warehouse.
  //
  // No `nativeForm`: this used to hand out to the ERPNext desk, and now has a
  // bespoke SPA list and form at /store/plate-offcut because the offcut rows are
  // priced live from the server as they are typed. DOCTYPE_CONFIG is static, so
  // the tile and nav entry are gated on `hasApp("addsol_nl_custom")` -- without
  // that they would appear on every customer and link to a doctype that is not
  // there.
  "Plate Offcut": {
    list: {
      titleField: "name",
      subtitleField: "source_item",
      metaField: "warehouse",
      statusField: "docstatus",
    },
    searchFields: ["name", "source_item", "heat_number"],
  },

  // ============================
  // QUALITY MODULE (enhancements)
  // ============================
  // The parameter-group master is served by its own screens
  // (`/quality/parameter-groups`), but the generic `/quality/:doctype` routes
  // also resolve it -- and a doctype with no entry here falls back to
  // `titleField: "name"`, which for this doctype is the same string as
  // `group_name` anyway. Declared so the fallback is deliberate rather than
  // accidental.
  "Quality Inspection Parameter Group": {
    list: {
      titleField: "group_name",
      subtitleField: "",
      metaField: "modified",
      statusField: "",
    },
    searchFields: ["group_name", "name"],
  },
  "Non Conformance": {
    list: {
      titleField: "subject",
      subtitleField: "name",
      // The doctype has NO `date` field -- it was named here, and a field the
      // doctype lacks fails the WHOLE query, so this list was dead too.
      // `modified` is a standard field and always exists.
      metaField: "modified",
      statusField: "status",
    },
    searchFields: ["subject", "name"],
  },
  "Quality Action": {
    list: {
      // ERPNext's CAPA doctype. It has no title field -- the name
      // (QA-ACT-00001) IS the label -- and `corrective_preventive` is what
      // says which half of the CAPA a row is.
      //
      // This entry used to be "Corrective Action", which is a FIELD on
      // "Non Conformance" and not a doctype at all: the tile asked ERPNext for
      // `resource/Corrective Action` and was answered "DocType Corrective
      // Action not found".
      titleField: "name",
      subtitleField: "corrective_preventive",
      metaField: "date",
      statusField: "status",
    },
    searchFields: ["name", "goal"],
  },
  "Quality Procedure": {
    list: {
      titleField: "quality_procedure_name",
      subtitleField: "process_owner_full_name",
      metaField: "",
      // `procedure_scope` and `is_active` were named here; NEITHER exists on
      // the doctype, and a field the doctype lacks fails the whole query.
      statusField: "",
    },
    searchFields: ["quality_procedure_name"],
  },
};

/**
 * Get display config for a doctype.
 * Returns a default config if none is defined.
 *
 * Optional form layout override (GenericForm):
 *   form: { layout: "auto" | "single" | "tabs" | "stepper" }
 */
export function getDoctypeConfig(doctype) {
  return (
    DOCTYPE_CONFIG[doctype] || {
      list: {
        titleField: "name",
        subtitleField: "",
        metaField: "modified",
        statusField: "docstatus",
      },
      searchFields: ["name"],
    }
  );
}
