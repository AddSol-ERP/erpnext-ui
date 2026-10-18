import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import ListLayout from "../../../components/ListLayout";
import PlateGroups from "./plate-groups";
import Pagination from "../../../components/Pagination";
import ActionBar from "../../../components/ActionBar";
import { listFilterHandlers } from "../../../lib/filterChips";
import { fetchAvailablePlates } from "./api";

const PAGE_SIZE = 10;



/**
 * Plates waiting to be cut.
 *
 * A click opens the cutting form with this plate already chosen, which is the
 * whole point of the tab: the plate is the one thing an operator already knows,
 * so it should never have to be picked a second time.
 */
export default function AvailablePlates({ tabs }) {
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
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAvailablePlates({
        search,
        warehouse: filters.warehouse || "",
        limitStart: (page - 1) * PAGE_SIZE,
        pageLength: PAGE_SIZE,
      });
      setRows(res.plates);
      setTotal(res.total);
    } catch (e) {
      setError(e.message || t("common.failedToLoad", { name: t("store.plateOffcut.title") }));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, filters.warehouse, page, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // A warehouse is the one axis that genuinely splits this list: a shop with
  // several plate stores cannot tell at a glance which pile is in front of them,
  // and the endpoint already takes it as a filter.
  const filterConfig = useMemo(
    () => ({
      filters: [
        {
          label: t("store.plateOffcut.warehouse"),
          field: "warehouse",
          type: "link",
          doctype: "Warehouse",
        },
      ],
    }),
    [t],
  );

  const resetPage = useCallback(() => setPage(1), []);
  const filterUi = useMemo(
    () => listFilterHandlers(setFilters, resetPage),
    [resetPage],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));


  return (
    <ListLayout
      tabs={tabs}
      loading={loading}
      error={error}
      onRetry={load}
      isEmpty={!loading && rows.length === 0}
      emptyTitle={t("store.plateOffcut.noAvailablePlates")}
      emptyDescription={t("store.plateOffcut.noAvailablePlatesHint")}
      actionBar={
        <ActionBar
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          resultCount={total}
          filterConfig={filterConfig}
          selectedFilters={filters}
          {...filterUi}
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
      <PlateGroups
        plates={rows}
        loading={loading}
        onSelect={(plate) =>
          navigate(`/store/plate-offcut/new?serial=${encodeURIComponent(plate.serial)}`)
        }
      />
    </ListLayout>
  );
}
