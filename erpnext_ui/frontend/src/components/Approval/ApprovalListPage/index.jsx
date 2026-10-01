import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../ActionBar";
import Pagination from "../../Pagination";
import { get } from "../../../services/api";
import ListLayout from "../../ListLayout";
import ApprovalPreview from "../ApprovalPreview";
import { ListRow } from "../../List/ListRow";
import DataTable from "../../List/DataTable";
import { StatusBadge } from "../../List/StatusBadge";
import useListPagination from "../../../hooks/useListPagination";
import { listFilterHandlers } from "../../../lib/filterChips";
import {
  getApprovalMeta,
  pickFields,
  resolveStatusField,
} from "../../../lib/approvalMeta";

// `docstatus` is required for the default (no-Workflow) Draft -> Submitted
// lifecycle. It only exists on submittable doctypes, so pickFields drops it
// for the rest.
const BASE_FIELDS = [
  "name",
  "owner",
  "creation",
  "modified",
  "docstatus",
  "status",
];

const DOCTYPE_FIELDS = {
  "Purchase Order": [
    "supplier",
    "transaction_date",
    "grand_total",
    "terms",
    // Only requested when a Workflow is configured for the doctype.
    "workflow_state",
  ],
  "Expense Claim": [
    "employee",
    "posting_date",
    "total_claimed_amount",
    "workflow_state",
  ],
  "Leave Application": [
    "employee",
    "employee_name",
    "leave_type",
    "from_date",
    "to_date",
    "total_leave_days",
    "workflow_state",
  ],
  Quotation: [
    "customer_name",
    "transaction_date",
    "grand_total",
    "terms",
    "workflow_state",
  ],
  "Overtime Log": [
    "employee",
    "employee_name",
    "attendance_date",
    "shift",
    "in_time",
    "out_time",
    "overtime_hours",
    "status",
    "remarks",
  ],
};

const SEARCH_FIELDS = {
  "Purchase Order": ["name", "supplier"],
  "Expense Claim": ["name", "employee"],
  "Leave Application": ["name", "employee", "employee_name"],
  Quotation: ["customer_name", "title"],
  "Overtime Log": ["name", "employee", "employee_name"],
};

/* ===============================
   MAIN PAGE
=============================== */
const ApprovalListPage = () => {
  const { doctype } = useParams();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState({});
  const [meta, setMeta] = useState(null);
  const [filterConfig, setFilterConfig] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    page,
    setPage,
    totalItems,
    setTotal,
    totalPages,
    resetPage,
    limit_start,
    limit_page_length,
  } = useListPagination({ pageSize: 10 });

  const filterUi = useMemo(
    () => listFilterHandlers(setSelectedFilters, resetPage),
    [resetPage],
  );

  const buildFilterConfig = (fields) => {
    const has = (name) => fields.some((f) => f.fieldname === name);

    const PRIORITY_FIELDS = [
      "workflow_state",
      "status",
      "company",
      "supplier",
      "customer",
      "employee",
      "posting_date",
      "transaction_date",
      "from_date",
      "to_date",
      // Expense Claim keeps the outcome in `approval_status`; only offer it
      // when there is no `status` column, so we never show two status filters.
      ...(has("status") ? [] : ["approval_status"]),
    ];

    const allowedTypes = ["Link", "Select", "Date"];
    let filters = [];

    PRIORITY_FIELDS.forEach((key) => {
      const f = fields.find((x) => x.fieldname === key);
      if (!f) return;

      if (f.fieldtype === "Select" && f.options) {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "select",
          options: f.options
            .split("\n")
            .map((o) => o.trim())
            .filter(Boolean),
        });
      }

      if (f.fieldtype === "Link") {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "link",
          doctype: f.options,
        });
      }

      if (f.fieldtype === "Date") {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "date",
        });
      }
    });

    for (const f of fields) {
      if (filters.length >= 8) break;

      if (!f.fieldname || filters.find((x) => x.field === f.fieldname))
        continue;

      if (!allowedTypes.includes(f.fieldtype)) continue;

      if (
        ["name", "owner", "creation", "modified", "idx", "docstatus"].includes(
          f.fieldname,
        )
      )
        continue;

      if (f.fieldtype === "Link") {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "link",
          doctype: f.options,
        });
      }

      if (f.fieldtype === "Select" && f.options) {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "select",
          options: f.options.split("\n"),
        });
      }

      if (f.fieldtype === "Date") {
        filters.push({
          label: f.label,
          field: f.fieldname,
          type: "date",
        });
      }
    }

    return { filters };
  };

  const getBaseFilters = (statusField) => {
    let filters = [];
    filters.push(["docstatus", "=", 0]);

    if (doctype === "Purchase Order") {
      filters.push([statusField, "not in", ["Completed", "Cancelled"]]);
    }
    if (doctype === "Expense Claim") {
      filters.push([statusField, "!=", "Approved"]);
    }
    if (doctype === "Leave Application") {
      filters.push([statusField, "in", ["Open", "Applied"]]);
    }
    if (doctype === "Overtime Log") {
      filters.push([statusField, "=", "Draft"]);
    }

    return filters;
  };

  const buildOrFilters = (meta) => {
    if (!search) return [];
    const fields = pickFields(meta, SEARCH_FIELDS[doctype] || ["name"]);
    if (!fields.length) return [];
    return fields.map((f) => [f, "like", `%${search}%`]);
  };

  const buildFilters = (meta, statusField) => {
    let filters = [];
    const status = selectedFilters.status || selectedFilters.workflow_state;

    if (status === "Draft") {
      filters.push(["docstatus", "=", 0]);
    } else if (status) {
      filters.push(["docstatus", "=", 1]);
      filters.push([statusField, "=", status]);
    } else {
      filters.push(...getBaseFilters(statusField));
    }

    Object.entries(selectedFilters).forEach(([field, value]) => {
      if (!value) return;
      if (field === "status" || field === "workflow_state") return;
      if (field === "approval_status" && field === statusField) return;
      // Only filter on columns this doctype actually has, otherwise Frappe
      // rejects the whole query.
      if (meta && !meta.fieldSet.has(field)) return;
      filters.push([field, "=", value]);
    });

    return filters;
  };

  const getFields = (meta) => {
    const wanted = [...BASE_FIELDS, ...(DOCTYPE_FIELDS[doctype] || [])];
    return pickFields(meta, wanted);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Meta is memoised in approvalMeta, so this is a cache hit after the
      // first load per doctype.
      const meta = await getApprovalMeta(doctype);
      setMeta(meta);

      const statusField = resolveStatusField(meta, doctype);
      const fields = getFields(meta);
      const filters = buildFilters(meta, statusField);
      const or_filters = buildOrFilters(meta);

      const params = {
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        order_by: "modified desc",
        limit_start,
        limit_page_length,
      };

      if (or_filters.length) {
        params.or_filters = JSON.stringify(or_filters);
      }

      const [listRes, countRes] = await Promise.all([
        get(`resource/${doctype}`, params),
        get("method/frappe.client.get_count", {
          doctype,
          filters: JSON.stringify(filters),
          ...(or_filters.length && {
            or_filters: JSON.stringify(or_filters),
          }),
        }),
      ]);

      setData(listRes.data || []);
      setTotal(countRes.message || 0);
    } catch (e) {
      console.error(e);
      setError(e);
      setData([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, search, selectedFilters, limit_start, limit_page_length, setTotal]);

  const getDisplayStatus = useCallback(
    (row, statusField) => {
      // `workflow_state` only exists when a Workflow is configured, so fall
      // back to the doctype's own status column.
      const raw =
        row.workflow_state ||
        row[statusField] ||
        (row.docstatus === 0
          ? "Draft"
          : row.docstatus === 1
            ? "Submitted"
            : row.docstatus === 2
              ? "Cancelled"
              : "");

      if (row.docstatus === 2 || raw === "Rejected") {
        return { label: t("approvals.status.rejected"), color: "danger" };
      }

      if (["Approved", "Completed", "Delivered", "Closed"].includes(raw)) {
        return { label: t("approvals.status.approved"), color: "complete" };
      }

      if (
        [
          "Open",
          "Pending",
          "To Receive",
          "To Bill",
          "To Receive and Bill",
          "Submitted",
        ].includes(raw) ||
        row.docstatus === 1
      ) {
        return {
          label: t("approvals.status.waitingForApproval"),
          color: "pending",
        };
      }

      if (row.docstatus === 0) {
        return { label: t("approvals.status.draft"), color: "open" };
      }

      return { label: raw || t("approvals.status.unknown"), color: "open" };
    },
    [t],
  );

  const mapToList = useCallback(
    (row) => {
      const status = getDisplayStatus(row, resolveStatusField(meta, doctype));

      if (doctype === "Leave Application") {
        return {
          title: row.employee_name || row.employee || "—",
          subtitle: row.leave_type || "—",
          meta: `${row.from_date || ""} → ${row.to_date || ""}${
            row.total_leave_days
              ? ` (${t("approvals.daysCount", { days: row.total_leave_days })})`
              : ""
          }`,
          statusLabel: status.label,
          statusColor: status.color,
          raw: row,
        };
      }

      if (doctype === "Quotation") {
        return {
          title: row.name || "—",
          subtitle: row.customer_name,
          meta: `${row.transaction_date}`,
          statusLabel: status.label,
          statusColor: status.color,
          raw: row,
        };
      }

      if (doctype === "Overtime Log") {
        return {
          title: row.employee_name || row.employee || "—",
          subtitle: t("approvals.otSummary", {
            hours: row.overtime_hours || 0,
          }),
          meta: row.attendance_date || "",
          statusLabel: status.label,
          statusColor: status.color,
          raw: row,
        };
      }

      return {
        title: row.name,
        subtitle: row.title || row.supplier || row.employee || row.party || "—",
        meta: row.posting_date || row.transaction_date || row.creation || "",
        statusLabel: status.label,
        statusColor: status.color,
        raw: row,
      };
    },
    [doctype, t, getDisplayStatus, meta],
  );

  const handleRowClick = (doc) => {
    setPreviewDoc(doc);
    setShowPreview(true);
  };

  const handleSearch = useCallback(
    (q) => {
      setSearch(q);
      resetPage();
    },
    [resetPage],
  );

  useEffect(() => {
    setHeader({
      title: doctype,
      subtitle: t("approvals.pendingApprovals"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.approvals"), path: "/approvals" },
        { label: doctype },
      ],
      actions: [
        {
          label: t("common.refresh"),
          variant: "btn-outline-primary",
          onClick: loadData,
        },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, page]);

  useEffect(() => {
    const loadFilters = async () => {
      const m = await getApprovalMeta(doctype);
      setFilterConfig(buildFilterConfig(m?.fields || []));
    };

    if (doctype) loadFilters();
  }, [doctype]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const listData = useMemo(() => data.map(mapToList), [data, mapToList]);

  const columns = useMemo(
    () => [
      {
        id: "title",
        header: t("common.name"),
        cell: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.title}</div>
            <div className="truncate text-xs text-muted-foreground">
              {row.subtitle}
            </div>
          </div>
        ),
      },
      {
        id: "meta",
        header: t("common.date"),
        hideBelow: "md",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">{row.meta}</span>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row) => (
          <StatusBadge tone={row.statusColor}>{row.statusLabel}</StatusBadge>
        ),
      },
    ],
    [t],
  );

  return (
    <>
      <ApprovalPreview
        show={showPreview}
        onClose={() => setShowPreview(false)}
        doc={previewDoc}
        doctype={doctype}
        onSuccess={loadData}
      />

      <ListLayout
        contentMode="auto"
        loading={loading}
        error={error}
        onRetry={loadData}
        actionBar={
          <ActionBar
            onSearch={handleSearch}
            resultCount={totalItems}
            filterConfig={filterConfig}
            selectedFilters={selectedFilters}
            {...filterUi}
          />
        }
        cards={
          <div className="flex flex-col">
            {listData.map((item, idx) => (
              <ListRow
                key={idx}
                item={item}
                index={limit_start + idx + 1}
                onClick={(doc) => handleRowClick(doc.raw ?? doc)}
              />
            ))}
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={listData}
            rowKey={(row) => row.raw?.name}
            onRowClick={(row) => handleRowClick(row.raw)}
            loading={loading}
            rowOffset={limit_start}
          />
        }
        pagination={
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={totalItems}
            pageSize={limit_page_length}
            disabled={loading}
          />
        }
        isEmpty={!loading && listData.length === 0}
        emptyTitle={t("approvals.noPendingApprovals")}
      />
    </>
  );
};

export default ApprovalListPage;
