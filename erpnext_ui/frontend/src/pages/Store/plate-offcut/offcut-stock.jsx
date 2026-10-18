import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import ListLayout from "../../../components/ListLayout";
import DataTable, { StatusBadge } from "../../../components/List/DataTable";
import ActionBar from "../../../components/ActionBar";
import { Button } from "@/components/ui/button";
import Pagination from "../../../components/Pagination";
import { fetchOffcutStock } from "./api";

const PAGE_SIZE = 10;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 1250 x 625 -- the piece's own footprint, which is what identifies it. */
function sizeLabel(row) {
  const length = num(row.length_mm);
  const width = num(row.width_mm);
  if (!length || !width) return "—";
  return `${length} x ${width}`;
}

/**
 * The offcut pieces already produced, each traceable to the plate it came from.
 *
 * Clicking a row reveals its details in place rather than opening a page: an
 * offcut's whole value is knowing WHICH plate produced it and what it weighed,
 * and that is four lines of context, not a document to navigate to. The link to
 * the Plate Offcut that made it is offered alongside for when the operator does
 * want the job itself.
 */
export default function OffcutStock({ tabs }) {
  // The hub passes its scope strip down rather than wrapping these panels:
  // ListLayout draws `tabs` as a strip inside its OWN card, so a panel that
  // rendered its own without it would lose the strip, and a hub that wrapped
  // them would produce two nested elevated cards.
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchOffcutStock({
        search,
        limitStart: (page - 1) * PAGE_SIZE,
        pageLength: PAGE_SIZE,
      });
      setRows(res.pieces);
      setTotal(res.total);
      // The open detail must not outlive the row it describes: filtering or
      // paging can remove the selected serial, and a panel naming a piece that
      // is no longer listed reads as a bug.
      setSelected((prev) => (prev && res.pieces.some((p) => p.serial === prev.serial) ? prev : null));
    } catch (e) {
      setError(e.message || t("common.failedToLoad", { name: t("store.plateOffcut.title") }));
      setRows([]);
      setTotal(0);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [search, page, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = useMemo(
    () => [
      {
        id: "serial",
        header: t("store.plateOffcut.offcutSerial"),
        cell: (row) => <span className="font-medium">{row.serial}</span>,
      },
      {
        id: "size",
        header: t("store.plateOffcut.offcutSize"),
        cell: (row) => <span className="text-sm tabular-nums">{sizeLabel(row)}</span>,
      },
      {
        id: "item_code",
        header: t("store.plateOffcut.sourceItem"),
        hideBelow: "md",
        cell: (row) => (
          <span className="truncate text-sm text-muted-foreground">{row.item_code}</span>
        ),
      },
      {
        id: "source_serial",
        header: t("store.plateOffcut.fromPlate"),
        hideBelow: "lg",
        cell: (row) => (
          <span className="text-sm text-muted-foreground">{row.source_serial}</span>
        ),
      },
      {
        id: "weight_kg",
        header: t("store.plateOffcut.sourceWeight"),
        cell: (row) => (
          <span className="text-end tabular-nums">
            {num(row.weight_kg) ? `${num(row.weight_kg).toFixed(3)} Kg` : "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: t("common.status"),
        cell: (row) => (
          <StatusBadge tone={row.status === "Active" ? "complete" : "warning"}>
            {row.status || t("common.unknown")}
          </StatusBadge>
        ),
      },
    ],
    [t],
  );

  const detail = [
    [t("store.plateOffcut.offcutSerial"), selected?.serial],
    [t("store.plateOffcut.offcutSize"), sizeLabel(selected || {})],
    [t("store.plateOffcut.sourceItem"), selected?.item_code],
    [t("store.plateOffcut.grade"), selected?.item_group],
    [t("store.plateOffcut.fromPlate"), selected?.source_serial],
    [t("store.plateOffcut.heatNumber"), selected?.heat_number],
    [t("store.plateOffcut.batch"), selected?.batch_no],
    [t("store.plateOffcut.warehouse"), selected?.warehouse],
    [
      t("store.plateOffcut.sourceWeight"),
      num(selected?.weight_kg) ? `${num(selected?.weight_kg).toFixed(3)} Kg` : "—",
    ],
    [
      t("store.plateOffcut.theoreticalWeight"),
      num(selected?.theoretical_weight_kg)
        ? `${num(selected?.theoretical_weight_kg).toFixed(3)} Kg`
        : "—",
    ],
    [
      t("store.plateOffcut.totalOffcutValue"),
      num(selected?.value) ? Number(selected?.value).toFixed(2) : "—",
    ],
  ].filter(([, v]) => v);

  return (
    <>
      {selected && (
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {t("store.plateOffcut.offcutDetails")}
            </h3>
            <div className="flex items-center gap-2">
              {selected.offcut && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigate(
                      `/store/plate-offcut/${encodeURIComponent(selected.offcut)}`,
                    )
                  }
                >
                  <ExternalLink className="size-4" />
                  {t("store.plateOffcut.openCuttingJob")}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                {t("common.close")}
              </Button>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
            {detail.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <dd className="truncate text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <ListLayout
      tabs={tabs}
        loading={loading}
        error={error}
        onRetry={load}
        isEmpty={!loading && rows.length === 0}
        emptyTitle={t("store.plateOffcut.noOffcutStock")}
        emptyDescription={t("store.plateOffcut.noOffcutStockHint")}
        actionBar={
          <ActionBar
            onSearch={(value) => {
              setSearch(value);
              setPage(1);
            }}
            resultCount={total}
          />
        }
        pagination={
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={total}
            pageSize={PAGE_SIZE}
            disabled={loading}
          />
        }
      >
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          onRowClick={(row) => setSelected((prev) => (prev?.serial === row.serial ? null : row))}
        />
      </ListLayout>
    </>
  );
}