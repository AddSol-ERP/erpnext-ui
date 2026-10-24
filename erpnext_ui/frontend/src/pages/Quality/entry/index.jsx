import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { get } from "../../../services/api";
import ListLayout from "../../../components/ListLayout";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import { ListRow } from "../../../components/List/ListRow";
import DataTable from "../../../components/List/DataTable";
import { StatusBadge } from "../../../components/List/StatusBadge";
import { Button } from "@/components/ui/button";
import useListPagination from "../../../hooks/useListPagination";
import { useInspectionDraft } from "../../../hooks/useInspectionDraft";
import { clearInspectionDraft } from "../../../lib/inspectionDraft";
import { listFilterHandlers } from "../../../lib/filterChips";
import { summariseInspection } from "../../../lib/inspectionProgress";
import {
  INSPECTION_TYPES,
  REFERENCE_TYPES,
  inspectionTypeLabel,
  referenceTypesFor,
} from "../../../lib/inspectionTypes";

const getInspectionResult = (row, t) =>
  row.status === "Accepted"
    ? { label: t("quality.statusPass"), color: "complete" }
    : row.status === "Rejected"
      ? { label: t("quality.statusFail"), color: "danger" }
      : { label: t("quality.statusPending"), color: "open" };

export default function InspectionList() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  // The inspection the user walked away from, if there is one.
  //
  // The answers live OUTSIDE React (lib/inspectionDraft.js) so they survive
  // the form unmounting when the user navigates here. This hook subscribes to
  // that store, so the panel appears the moment a paper is started and
  // disappears when it is saved.
  const draft = useInspectionDraft();
  const draftProgress = useMemo(
    () => summariseInspection(draft?.parameters || []),
    [draft],
  );

  const [data, setData] = useState([]);
  const [documentState, setDocumentState] = useState("draft");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  /**
   * The inspection type, in the URL.
   *
   * The hub's tiles each open the list for one type, and the type rides in
   * the query string so the list can be LINKED to and RELOADED with the same
   * scope. It is in the filter state as well, because that is what the
   * filter bar and the chips work with -- the two are kept in step below.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = searchParams.get("type") || "";

  const [selectedFilters, setSelectedFilters] = useState(() =>
    typeFilter ? { inspection_type: typeFilter } : {},
  );

  /**
   * Keep the filter state in step with the URL.
   *
   * React Router does NOT remount the list when only the search params
   * change, so going from one tile's list to another's would leave the OLD
   * type in the filter state -- the list would show the wrong type under the
   * new tile's name.
   */
  useEffect(() => {
    // The URL is an EXTERNAL system: it is what the hub's tile set, and
    // what a shared link carries. Syncing an external value into state is
    // the case the rule is about.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedFilters((prev) => {
      if (typeFilter) {
        return prev.inspection_type === typeFilter
          ? prev
          : { ...prev, inspection_type: typeFilter };
      }
      if (!prev.inspection_type) return prev;
      const next = { ...prev };
      delete next.inspection_type;
      return next;
    });
  }, [typeFilter]);

  /**
   * Put the type back in the URL when the filter bar changes it.
   *
   * Without this the URL would keep the type the tile set, so a reload (or
   * a shared link) would show a different list from the one on screen.
   */
  const syncTypeToUrl = useCallback(
    (type) => {
      const next = new URLSearchParams(searchParams);
      if (type) next.set("type", type);
      else next.delete("type");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const filterUi = useMemo(() => {
    const base = listFilterHandlers(setSelectedFilters, resetPage);
    return {
      ...base,
      onApplyFilters: (filters) => {
        base.onApplyFilters(filters);
        syncTypeToUrl(filters.inspection_type || "");
      },
      onRemoveFilter: (field) => {
        base.onRemoveFilter(field);
        if (field === "inspection_type") syncTypeToUrl("");
      },
      onClearFilters: () => {
        base.onClearFilters();
        syncTypeToUrl("");
      },
    };
  }, [resetPage, syncTypeToUrl]);

  const filterConfig = {
    filters: [
      {
        label: t("quality.inspectionType"),
        field: "inspection_type",
        type: "select",
        // ERPNext's own values, so the filter matches what is stored.
        options: INSPECTION_TYPES.map((it) => ({
          value: it.value,
          label: t(it.labelKey),
        })),
      },
      {
        label: t("quality.referenceType"),
        field: "reference_type",
        type: "select",
        // ONLY the reference types that belong to the type this list is
        // scoped to. An "Incoming" list offering "Delivery Note" is a filter
        // that can only ever come back empty -- and an empty list reads as
        // "there is nothing here" rather than "that combination is
        // impossible".
        options: referenceTypesFor(typeFilter).map((name) => ({
          value: name,
          label: name,
        })),
      },
      {
        label: t("quality.result"),
        field: "status",
        type: "select",
        // ERPNext stores Accepted/Rejected; PASS/FAIL are only display labels.
        options: ["Accepted", "Rejected"],
      },
      {
        label: t("quality.template"),
        field: "quality_inspection_template",
        type: "link",
        doctype: "Quality Inspection Template",
      },
    ],
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = [["docstatus", "=", documentState === "submitted" ? 1 : 0]];

      Object.entries(selectedFilters).forEach(([k, v]) => {
        if (v) filters.push([k, "=", v]);
      });

      const params = {
        fields: JSON.stringify([
          "name",
          "quality_inspection_template",
          "item_code",
          "reference_name",
          // The reference NAME is not enough on its own: "PR-00042" and
          // "PI-00042" look alike, and the reader has to know WHICH kind of
          // document the inspection is against.
          "reference_type",
          "status",
          "inspection_type",
          "report_date",
          "modified",
        ]),
        filters: JSON.stringify(filters),
        order_by: "modified desc",
        limit_start,
        limit_page_length,
      };

      const orFilters = debouncedSearch
        ? [
            ["name", "like", `%${debouncedSearch}%`],
            ["quality_inspection_template", "like", `%${debouncedSearch}%`],
          ]
        : [];
      if (orFilters.length) params.or_filters = JSON.stringify(orFilters);

      const [listRes, countRes] = await Promise.all([
        get("resource/Quality Inspection", params),
        get("method/frappe.client.get_count", {
          doctype: "Quality Inspection",
          filters: JSON.stringify(filters),
          ...(orFilters.length && { or_filters: JSON.stringify(orFilters) }),
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
  }, [
    debouncedSearch,
    documentState,
    selectedFilters,
    limit_start,
    limit_page_length,
    setTotal,
  ]);

  useEffect(() => {
    setHeader({
      title: t("quality.inspections"),
      subtitle: t("quality.inspectionsSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.inspections") },
      ],
      actions: [
        {
          // With a paper in progress this becomes "continue" -- the primary
          // action on this page is always the one the user most likely
          // wants, and there is exactly one button per intent. The panel
          // below carries the explicit "start a new one".
          label: draft
            ? t("quality.continueInspection")
            : t("quality.newInspection"),
          variant: "btn-primary",
          onClick: () => navigate("/quality/inspection/new"),
        },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const handleSearch = useCallback(
    (q) => {
      setDebouncedSearch(q);
      resetPage();
    },
    [resetPage],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const listData = useMemo(
    () =>
      data.map((row) => {
        const result = getInspectionResult(row, t);
        return {
          title: row.name,
          subtitle: `${row.item_code || "-"} · ${inspectionTypeLabel(row.inspection_type, t)}`,
          meta: `${row.reference_name || "-"} · ${row.reference_type || "-"} · ${row.report_date || "-"}`,
          status: result.color,
          statusLabel: result.label,
          raw: row,
        };
      }),
    [data, t],
  );

  const columns = useMemo(
    () => [
      {
        id: "name",
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
          <StatusBadge tone={row.status}>{row.statusLabel}</StatusBadge>
        ),
      },
    ],
    [t],
  );

  const statusTabs = useMemo(() => (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 pb-2">
      {[
        { id: "draft", label: t("common.draft") },
        { id: "submitted", label: t("common.submitted") },
      ].map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={documentState === tab.id}
          onClick={() => {
            setDocumentState(tab.id);
            resetPage();
          }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            documentState === tab.id
              ? "bg-primary/15 text-primary ring-1 ring-primary/40"
              : "text-chrome-muted hover:bg-muted hover:text-chrome-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ), [documentState, resetPage, t]);

  return (
    <ListLayout
      contentMode="auto"
      loading={loading}
      error={error}
      onRetry={loadData}
      tabs={statusTabs}
      actionBar={
        <div>
          {draft ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-3 py-2 sm:px-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {t("quality.continueInspection")}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {[draft.doc?.item_code, draft.doc?.template]
                    .filter(Boolean)
                    .join(" · ") || t("quality.inspectionInProgress")}
                  {" · "}
                  {t("quality.inspectionProgress", {
                    done: draftProgress.complete,
                    total: draftProgress.total,
                  })}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  clearInspectionDraft();
                  navigate("/quality/inspection/new");
                }}
              >
                {t("quality.startNewInspection")}
              </Button>
            </div>
          ) : null}
          <ActionBar
            onSearch={handleSearch}
            resultCount={totalItems}
            filterConfig={filterConfig}
            selectedFilters={selectedFilters}
            {...filterUi}
          />
        </div>
      }
      cards={
        <div className="card-stack flex flex-col gap-2.5">
          {listData.map((item, i) => (
            <ListRow
              key={i}
              item={item}
              index={limit_start + i + 1}
              onClick={() => navigate(`/quality/inspection/${item.raw.name}`)}
            />
          ))}
        </div>
      }
      table={
        <DataTable
          columns={columns}
          data={listData}
          rowKey={(row) => row.raw?.name}
          onRowClick={(row) => navigate(`/quality/inspection/${row.raw.name}`)}
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
      emptyTitle={t("quality.emptyInspections")}
    />
  );
}
