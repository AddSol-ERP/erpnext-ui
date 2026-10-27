import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ListLayout from "../../../components/ListLayout";
import DataTable, { StatusBadge } from "../../../components/List/DataTable";
import ActionBar from "../../../components/ActionBar";
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
 * Each row opens its submitted Plate Offcut detail page. The full cutting
 * record is the right place to review the produced pieces and print their QR
 * labels, rather than expanding a detail panel over the register tabs.
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
    } catch (e) {
      setError(e.message || t("common.failedToLoad", { name: t("store.plateOffcut.title") }));
      setRows([]);
      setTotal(0);
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

  return (
    <>
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
          onRowClick={(row) =>
            navigate(`/store/plate-offcut/${encodeURIComponent(row.offcut)}`)
          }
        />
      </ListLayout>
    </>
  );
}
