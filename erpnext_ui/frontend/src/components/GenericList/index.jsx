import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../context/HeaderContext";
import { get, getMethod } from "../../services/api";
import { getDoctypeConfig } from "../../config/doctypes";
import { openInDesk } from "../../lib/deskUrl";
import ActionBar from "../ActionBar";
import Pagination from "../Pagination";
import ListLayout from "../ListLayout";
import { ListRow } from "../List/ListRow";
import DataTable from "../List/DataTable";
import { StatusBadge } from "../List/StatusBadge";
import { statusTone } from "../List/statusTones";
import useListPagination from "../../hooks/useListPagination";
import { listFilterHandlers } from "../../lib/filterChips";
import { getApprovalMeta } from "../../lib/approvalMeta";
import { Plus, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Extract the hub name from the first segment of the current path. */
function useHub() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);
  return segments[0] || "";
}

const BASE_FIELDS = ["name", "owner", "creation", "modified", "docstatus"];

/**
 * Status color mapping for status badges.
 */
const STATUS_COLORS = {
  Draft: "open",
  "Not Started": "open",
  Open: "open",
  "To Receive and Bill": "pending",
  "To Receive": "pending",
  "To Bill": "pending",
  Pending: "pending",
  "In Process": "pending",
  Applied: "pending",
  "Waiting for Approval": "pending",
  Approved: "complete",
  Completed: "complete",
  Delivered: "complete",
  Present: "complete",
  Submitted: "pending",
  Active: "complete",
  Cancelled: "danger",
  Rejected: "danger",
  Closed: "danger",
  Absent: "danger",
  "On Leave": "info",
  "Half Day": "warning",
};

function resolveStatus(row, statusField) {
  /**
   * Precedence while the document is STILL IN APPROVAL (docstatus 0):
   * `workflow_state` > the configured status column.
   *
   * An approval Workflow advances `workflow_state`, not `status` -- the seeded
   * and admin-authored workflows here carry no `update_field`, so ERPNext's own
   * `status` column sits at "Draft" for the whole approval. A Quotation in
   * "Waiting For Approval" therefore has to be read off `workflow_state`, or
   * the badge lies.
   *
   * Once submitted (docstatus >= 1) the workflow outcome is settled, and the
   * doctype's own status carries the richer meaning the reader wants
   * ("Ordered"/"Partially Ordered" on a Quotation), so it takes over.
   *
   * `workflow_state` is only requested when the doctype's meta has the field
   * (see getFields) -- never on a hunch, since naming an absent field fails
   * the entire query.
   */
  const raw =
    Number(row.docstatus) === 0 && row.workflow_state
      ? row.workflow_state
      : statusField === "docstatus"
        ? { 0: "Draft", 1: "Submitted", 2: "Cancelled" }[row.docstatus] || "Draft"
        : row[statusField];

  if (!statusField && !(Number(row.docstatus) === 0 && row.workflow_state)) {
    return { label: "", color: "" };
  }

  if (typeof raw === "boolean" || raw === 0 || raw === 1) {
    if (raw === true || raw === 1)
      return { label: "Active", color: "complete" };
    return { label: "Disabled", color: "danger" };
  }

  const label = raw || "Unknown";
  // The table is an exact match on a handful of known values and misses
  // admin-authored workflow states ("Waiting For Approval" is not even spelled
  // with the same case as the entry here). `statusTone` is the shared
  // keyword matcher those states are meant to go through.
  const color = STATUS_COLORS[label] || statusTone(label);
  return { label, color };
}

/* ===============================
   GENERIC LIST PAGE
=============================== */
/**
 * @param {string} [props.doctypeOverride] Real ERPNext doctype name, when the
 *   URL segment is a readable slug rather than the doctype itself.
 *
 *   `/ess/salary-slip` reads better in an address bar than `/ess/Salary Slip`,
 *   but the segment no longer matches the doctype, so GenericList -- which
 *   resolves everything from `useParams()` -- would query a doctype literally
 *   called "salary-slip" and get a 404 from Frappe. The route supplies the real
 *   name here. With no override this is unchanged: the param is the doctype.
 */
export default function GenericListPage({ doctypeOverride }) {
  const params = useParams();
  const doctype = doctypeOverride || params.doctype;
  const hub = useHub();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState({});
  const [filterConfig, setFilterConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedQuotations, setSelectedQuotations] = useState([]);
  const [quotationOrderStatus, setQuotationOrderStatus] = useState(null);

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

  const config = useMemo(() => getDoctypeConfig(doctype), [doctype]);
  const fieldsCache = useRef({});
  const decodedDoctype = decodeURIComponent(doctype);

  /**
   * The doctype's meta, fetched ONCE per doctype and SHARED.
   *
   * Two things need it: the filter chips need the whole field list, and the
   * query needs to know which configured columns actually exist. Sharing one
   * promise means the second use costs no extra request.
   *
   * Keyed by doctype, so a route change to another doctype fetches its own
   * meta rather than reusing the previous one's.
   *
   * A FAILED fetch resolves to null, which means "unknown" -- and unknown
   * must NOT be treated as "this doctype has no fields", or a permission
   * blip would silently strip every configured column.
   */
  const metaCache = useRef({});
  const doctypeMeta = useCallback(() => {
    const cached = metaCache.current[decodedDoctype];
    if (cached) return cached;
    // The SAME meta the approval screens use, and the same cache: it knows to
    // add a Workflow's state column, which `resource/DocType/<dt>` cannot
    // report -- a Workflow creates that column as a Custom Field, and that
    // endpoint serialises only the DocType's own DocFields. Validating
    // `workflow_state` against it therefore always concluded "absent" and the
    // column was never requested, so the badge fell back to `status`. See
    // `lib/approvalMeta.js`.
    const promise = getApprovalMeta(decodedDoctype).then((meta) => {
      // A failed lookup must not be remembered for the life of the page: the
      // Refresh action should be able to succeed after a blip.
      if (!meta) delete metaCache.current[decodedDoctype];
      return meta;
    });
    metaCache.current[decodedDoctype] = promise;
    return promise;
  }, [decodedDoctype]);

  useEffect(() => {
    if (hub !== "purchase" || decodedDoctype !== "Supplier Quotation" || !data.length) return;
    let active = true;
    getMethod("method/erpnext_ui.quotation_comparison.quotation_order_status", { names: JSON.stringify(data.map((row) => row.name)) })
      .then((status) => { if (active) setQuotationOrderStatus(status); })
      .catch(() => { if (active) setQuotationOrderStatus(null); });
    return () => { active = false; };
  }, [data, hub, decodedDoctype]);

  const filterUi = useMemo(
    () => listFilterHandlers(setSelectedFilters, resetPage),
    [resetPage],
  );

  const buildFilterConfig = (fields) => {
    const PRIORITY_FIELDS = [
      "workflow_state",
      "status",
      "company",
      "department",
      "supplier",
      "customer",
      "employee",
      "employee_name",
      "posting_date",
      "transaction_date",
      "from_date",
      "to_date",
      "item_code",
      "item_group",
    ];

    const allowedTypes = ["Link", "Select", "Date"];
    let filters = [];

    PRIORITY_FIELDS.forEach((key) => {
      const f = fields.find((x) => x.fieldname === key);
      if (!f) return;
      if (filters.length >= 8) return;

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
        filters.push({ label: f.label, field: f.fieldname, type: "date" });
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
        filters.push({ label: f.label, field: f.fieldname, type: "date" });
      }
    }

    return { filters };
  };

  const getFields = useCallback(async () => {
    if (fieldsCache.current[decodedDoctype]) {
      return fieldsCache.current[decodedDoctype];
    }

    const customFields = [];
    const cfg = config.list;
    if (cfg.titleField && cfg.titleField !== "name")
      customFields.push(cfg.titleField);
    if (cfg.subtitleField) customFields.push(cfg.subtitleField);
    if (cfg.metaField) customFields.push(cfg.metaField);
    if (cfg.statusField) customFields.push(cfg.statusField);

    // Drop any column the doctype does not have.
    //
    // `GenericList` does NOT meta-validate the configured fields, and a field
    // the doctype lacks fails the WHOLE query -- so one wrong name in
    // config/doctypes.js takes the entire list down, with an error naming a
    // column rather than the config entry that is wrong. Three such entries
    // existed and had killed the "Non Conformance", "Quality Procedure" and
    // "Corrective Action" lists.
    //
    // The doctype's meta is fetched anyway, for the filter chips, so this
    // costs one shared request rather than an extra one.
    const meta = await doctypeMeta();
    const real = meta?.fields?.map((f) => f.fieldname) || null;
    // A Workflow's state column is what `resolveStatus` reads while a document
    // is still in approval, and it is the one field here that is NOT in
    // config/doctypes.js: it exists only where a Workflow does. So it is
    // requested only when this doctype's meta proves it is there -- naming an
    // absent field fails the whole query (same trap the configured columns are
    // filtered against below), and a failed meta fetch resolves to null, which
    // must NOT be read as "the field exists".
    //
    // The meta must come from `lib/approvalMeta.js`, not `resource/DocType/`:
    // that column is a Custom Field, which the REST meta endpoint cannot
    // report, so validating against it made this check a permanent no-op and
    // the column was never requested.
    const workflowField = meta?.workflowField || null;
    if (
      workflowField &&
      real?.includes(workflowField) &&
      !customFields.includes(workflowField)
    ) {
      customFields.push(workflowField);
    }
    const usable = real
      ? customFields.filter((field) => real.includes(field))
      : customFields;
    if (real) {
      const dropped = customFields.filter((field) => !real.includes(field));
      if (dropped.length) {
        console.warn(
          `[GenericList] ${decodedDoctype}: config names fields the doctype does not have -- ${dropped.join(", ")}`,
        );
      }
    }

    const fields = [...BASE_FIELDS, ...usable];
    // Only remember a list that was validated against real meta. Without meta
    // every configured column is sent unvalidated -- and a failed lookup must
    // not be frozen in place, or Refresh could never repair the list after a
    // blip (the workflow column, in particular, would stay missing).
    if (real) fieldsCache.current[decodedDoctype] = fields;
    return fields;
  }, [decodedDoctype, config, doctypeMeta]);

  const buildFilters = useCallback(() => {
    const filters = [];

    // `baseFilters` are always-on constraints declared in config/doctypes.js --
    // the "cancelled records are not documents" kind of rule. They are merged in
    // first and are NOT clearable from the filter bar, because a user who ticks
    // a status chip should never be able to widen a list past a business rule.
    //
    // This field was documented in doctypes.js and set on two entries but never
    // read anywhere, so it silently did nothing. It is read here.
    (config.baseFilters || []).forEach((f) => filters.push(f));

    Object.entries(selectedFilters).forEach(([field, value]) => {
      if (!value) return;
      // A base filter on the same field is the caller's constraint, not a
      // default; letting a chip widen it would defeat the point above.
      if (filters.some(([f]) => f === field)) return;
      filters.push([field, "=", value]);
    });

    return filters;
  }, [selectedFilters, config]);

  const buildOrFilters = useCallback(
    (realFields) => {
      const fields = config.searchFields || ["name"];
      // Same reasoning as the list's columns: a search field the doctype does
      // not have fails the whole query, so it is dropped rather than fatal.
      const usable = realFields
        ? fields.filter((f) => realFields.includes(f))
        : fields;
      return usable.map((f) => [f, "like", `%${search}%`]);
    },
    [search, config],
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQuotationOrderStatus(null);
    try {
      const meta = await doctypeMeta();
      const real = meta?.fields?.map((f) => f.fieldname) || null;
      const fields = await getFields();
      const filters = buildFilters();
      const orFilters = buildOrFilters(real);

      const params = {
        fields: JSON.stringify(fields),
        filters: JSON.stringify(filters),
        order_by: "modified desc",
        limit_start,
        limit_page_length,
      };

      if (orFilters.length) {
        params.or_filters = JSON.stringify(orFilters);
      }

      const [listRes, countRes] = await Promise.all([
        get(`resource/${decodedDoctype}`, params),
        get("method/frappe.client.get_count", {
          doctype: decodedDoctype,
          filters: JSON.stringify(filters),
          ...(orFilters.length && { or_filters: JSON.stringify(orFilters) }),
        }),
      ]);

      setData(listRes.data || []);
      setTotal(countRes.message || 0);
    } catch (e) {
      console.error(`Failed to load ${decodedDoctype}:`, e);
      setError(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [
    decodedDoctype,
    doctypeMeta,
    getFields,
    buildFilters,
    buildOrFilters,
    limit_start,
    limit_page_length,
    setTotal,
  ]);

  useEffect(() => {
    const hubName = hub ? hub.charAt(0).toUpperCase() + hub.slice(1) : "";
    const actions = [];

    if (config.nativeForm) {
      actions.push({
        label: t("common.new"),
        variant: "btn-primary",
        icon: Plus,
        onClick: () => openInDesk(decodedDoctype, null, true),
      });
    } else if (!config.readOnly) {
      actions.push({
        label: t("common.new"),
        variant: "btn-primary",
        icon: Plus,
        onClick: () =>
          navigate(`/${hub}/${encodeURIComponent(decodedDoctype)}/new`),
      });
    }

    actions.push({
      label: t("common.refresh"),
      variant: "btn-outline-primary",
      icon: RefreshCcw,
      onClick: loadData,
    });

    setHeader({
      title: decodedDoctype,
      subtitle: t("common.module", { name: hubName }),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: hubName, path: `/${hub}` },
        { label: decodedDoctype },
      ],
      actions,
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype, hub, page, config.readOnly, config.nativeForm]);

  useEffect(() => {
    const loadFilters = async () => {
      // The SAME promise the query uses -- one request for both.
      const meta = await doctypeMeta();
      setFilterConfig(buildFilterConfig(meta?.fields || []));
    };
    loadFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctype]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleSearch = useCallback(
    (q) => {
      setSearch(q);
      resetPage();
    },
    [resetPage],
  );

  const handleRowClick = (doc) => {
    if (config.nativeForm) {
      openInDesk(decodedDoctype, doc.name);
    } else if (config.readOnly) {
      navigate(
        `/${hub}/print/${encodeURIComponent(decodedDoctype)}/${encodeURIComponent(doc.name)}`,
      );
    } else {
      navigate(
        `/${hub}/${encodeURIComponent(decodedDoctype)}/${encodeURIComponent(doc.name)}`,
      );
    }
  };

  const mapToList = (row) => {
    const cfg = config.list;
    const status = resolveStatus(row, cfg.statusField);

    return {
      title: cfg.titleField ? row[cfg.titleField] || row.name || "—" : row.name,
      subtitle: `${cfg.subtitleField ? row[cfg.subtitleField] || "" : ""}${hub === "purchase" && decodedDoctype === "Supplier Quotation" && quotationOrderStatus?.[row.name] ? " · Purchase order exists" : ""}`,
      meta: cfg.metaField ? row[cfg.metaField] || "" : "",
      statusLabel: status.label,
      statusColor: status.color,
      raw: row,
    };
  };

  const listData = data.map(mapToList);

  const isQuotationList = hub === "purchase" && decodedDoctype === "Supplier Quotation";
  const toggleQuotation = (name) => setSelectedQuotations((current) =>
    current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
  );
  const selection = (name) => (
    <input type="checkbox" aria-label={`Select ${name}`} checked={selectedQuotations.includes(name)}
      onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}
      onChange={() => toggleQuotation(name)} />
  );

  const columns = [
    ...(isQuotationList ? [{ id: "select", header: "Select", cell: (row) => selection(row.raw.name) }] : []),
    {
      id: "title",
      header: t("common.name"),
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.title}</div>
          {row.subtitle ? (
            <div className="truncate text-xs text-muted-foreground">
              {row.subtitle}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "meta",
      header: t("common.modified"),
      hideBelow: "lg",
      cell: (row) => (
        <span className="text-xs text-muted-foreground">{row.meta}</span>
      ),
    },
    {
      id: "status",
      header: t("common.status"),
      cell: (row) =>
        row.statusLabel ? (
          <StatusBadge tone={row.statusColor}>{row.statusLabel}</StatusBadge>
        ) : null,
    },
  ];

  return (
    <ListLayout
      contentMode="auto"
      loading={loading}
      error={error}
      onRetry={loadData}
      actionBar={
        <>
        {isQuotationList && <div className="flex items-center gap-3 px-4 py-2"><Button type="button" disabled={selectedQuotations.length < 2 || selectedQuotations.length > 20} onClick={() => navigate("/purchase/quotation-comparison", { state: { names: selectedQuotations } })}>Compare selected ({selectedQuotations.length})</Button><span className="text-sm text-muted-foreground">Select 2 to 20 quotations.</span></div>}
        <ActionBar
          onSearch={handleSearch}
          resultCount={totalItems}
          filterConfig={filterConfig}
          selectedFilters={selectedFilters}
          {...filterUi}
        />
        </>
      }
      cards={
        <div className="flex flex-col">
          {listData.map((item, idx) => (
            <ListRow
              key={idx}
              item={item}
              index={limit_start + idx + 1}
              onClick={handleRowClick}
              actions={isQuotationList ? selection(item.raw.name) : null}
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
      emptyTitle={t("common.noRecords")}
    />
  );
}
