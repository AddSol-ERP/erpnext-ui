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
  },
  "Salary Slip": {
    list: {
      titleField: "employee_name",
      subtitleField: "employee",
      metaField: "posting_date",
      statusField: "docstatus",
    },
    searchFields: ["employee_name", "employee"],
    readOnly: true,   // renders ERPNext print format instead of editable form
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
  },
  Quotation: {
    list: {
      titleField: "customer_name",
      subtitleField: "name",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["customer_name", "name"],
  },
  "Sales Order": {
    list: {
      titleField: "customer_name",
      subtitleField: "name",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["customer_name", "name"],
  },
  "Sales Invoice": {
    list: {
      titleField: "customer_name",
      subtitleField: "name",
      metaField: "posting_date",
      statusField: "status",
    },
    searchFields: ["customer_name", "name"],
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
  },
  "Purchase Receipt": {
    list: {
      titleField: "supplier",
      subtitleField: "name",
      metaField: "posting_date",
      statusField: "status",
    },
    searchFields: ["supplier", "name"],
  },
  "Purchase Invoice": {
    list: {
      titleField: "supplier",
      subtitleField: "name",
      metaField: "posting_date",
      statusField: "status",
    },
    searchFields: ["supplier", "name"],
  },
  "Supplier Quotation": {
    list: {
      titleField: "supplier",
      subtitleField: "name",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["supplier", "name"],
  },
  "Request for Quotation": {
    list: {
      titleField: "name",
      subtitleField: "company",
      metaField: "transaction_date",
      statusField: "status",
    },
    searchFields: ["name"],
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
  "Stock Reconciliation": {
    list: {
      titleField: "name",
      subtitleField: "company",
      metaField: "posting_date",
      statusField: "docstatus",
    },
    searchFields: ["name"],
  },

  // ============================
  // QUALITY MODULE (enhancements)
  // ============================
  "Non Conformance": {
    list: {
      titleField: "subject",
      subtitleField: "name",
      metaField: "date",
      statusField: "status",
    },
    searchFields: ["subject", "name"],
  },
  "Corrective Action": {
    list: {
      titleField: "name",
      subtitleField: "status",
      metaField: "date",
      statusField: "status",
    },
    searchFields: ["name"],
  },
  "Quality Procedure": {
    list: {
      titleField: "name",
      subtitleField: "procedure_scope",
      metaField: "",
      statusField: "is_active",
    },
    searchFields: ["name"],
  },
};

/**
 * Get display config for a doctype.
 * Returns a default config if none is defined.
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
