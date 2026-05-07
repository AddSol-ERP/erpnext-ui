export const DOCTYPE_CONFIG = {
  "Purchase Order": {
    searchFields: ["name", "supplier"],
    filters: [
      { label: "Company", field: "company", type: "link", doctype: "Company" },
      {
        label: "Status",
        field: "status",
        type: "select",
        options: ["Draft", "To Receive and Bill", "Completed"],
      },
      { label: "Date", field: "transaction_date", type: "date" },
    ],
  },

  "Expense Claim": {
    searchFields: ["name", "employee"],
    filters: [
      {
        label: "Employee",
        field: "employee",
        type: "link",
        doctype: "Employee",
      },
      { label: "Date", field: "posting_date", type: "date" },
    ],
  },

  "Leave Application": {
    searchFields: ["name", "employee"],
    filters: [
      {
        field: "employee",
        label: "Employee",
        type: "link",
        doctype: "Employee",
      },
      {
        field: "leave_type",
        label: "Leave Type",
        type: "link",
        doctype: "Leave Type",
      },
      {
        field: "status",
        label: "Status",
        type: "select",
        options: ["Open", "Approved", "Rejected"],
      },
      {
        field: "from_date",
        label: "From Date",
        type: "date",
      },
    ],
  },
};
