import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownLeft, ArrowUpRight, PackageOpen, ShieldAlert } from "lucide-react";
import { get } from "../../../services/api";
import { openInDesk } from "../../../lib/deskUrl";

/**
 * The ledger behind one balance row: every movement, in order, with a running
 * balance and the voucher that caused it.
 *
 * This is the part that answers "where did this come from". A summary can only
 * ever show one number per item+warehouse, and for stock that arrived across
 * more than one receipt at more than one rate that number is a blend matching
 * nothing anyone purchased. CORE on QA is the live example: 3 Kg from
 * PR-26-00008, 2 Kg @ 1000 and 1 Kg @ 1200.
 *
 * Loaded lazily on expand -- the summary is page-sized, the ledger is not, and
 * nobody wants a query per row for a report they are still reading.
 *
 * Voucher links: Purchase Receipt has a real SPA route
 * (`/store/purchase-receipt/:name`), but Stock Entry does NOT -- there is only
 * `/store/stock-entry`, the create screen. So Stock Entry and every other
 * voucher type drill out to ERPNext desk in a new tab, which is the pattern
 * GenericList, GenericForm and tileNav already use.
 */

const SPA_ROUTES = {
  "Purchase Receipt": (name) => `/store/purchase-receipt/${encodeURIComponent(name)}`,
  "Material Request": (name) => `/store/material-request/${encodeURIComponent(name)}`,
};

const num = (v, digits = 2) =>
  v === null || v === undefined || v === ""
    ? "—"
    : Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      });

function VoucherLink({ type, name, onNavigate }) {
  const route = SPA_ROUTES[type];
  if (!name) return <span className="text-muted-foreground">—</span>;

  const label = (
    <>
      {name}
      <span className="ml-1 text-[11px] text-muted-foreground">{type}</span>
    </>
  );

  if (route) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onNavigate?.(route(name));
        }}
        className="text-left font-medium text-primary hover:underline"
      >
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openInDesk(type, name);
      }}
      className="text-left font-medium text-primary hover:underline"
      title={type}
    >
      {label}
    </button>
  );
}

/** Batch / serial chips for one ledger entry. */
function BundleChips({ bundle, traces, permissionRequired }) {
  const { t } = useTranslation();
  if (!bundle) return null;

  // A real state, not a failure: the bundle exists and we may not open it.
  // Saying nothing here would read as "this item has no batches", which is the
  // same lie the old report told.
  if (permissionRequired) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] text-orange-600 ring-1 ring-inset ring-orange-500/30 dark:text-orange-400">
        <ShieldAlert className="size-3" />
        {t("store.balance.batchPermission")}
      </span>
    );
  }

  const trace = traces?.[bundle];
  if (!trace || (!trace.batches?.length && !trace.serials?.length)) {
    return (
      <span className="text-[11px] text-muted-foreground">
        {t("store.balance.noBatchOnThisLine")}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap gap-1">
      {trace.batches.map((b) => (
        <span
          key={b.batch_no}
          className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-600 ring-1 ring-inset ring-indigo-500/30 dark:text-indigo-400"
        >
          {t("store.balance.batch")}: {b.batch_no}
        </span>
      ))}
      {trace.serials.map((s) => (
        <span
          key={s.serial_no}
          className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-600 ring-1 ring-inset ring-violet-500/30 dark:text-violet-400"
        >
          {t("store.balance.serial")}: {s.serial_no}
        </span>
      ))}
    </span>
  );
}

/**
 * The trail, given rows.
 *
 * Split from the fetching wrapper so it can be rendered directly in a test.
 * That is not test-driven contortion: `renderToString` is synchronous, so a
 * component that fetches on mount always renders its loading state under SSR
 * and its content can never be asserted. The two real assertions this suite
 * needs -- that the two lots stay separate, and that no key leaks -- are
 * exactly the ones that need the rows in hand.
 */
export function TrailTable({
  itemCode = "",
  warehouse = "",
  rows = [],
  traces,
  permissionRequired,
  hasMore,
  onNavigate,
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <p className="text-xs font-medium">
          {t("store.balance.trail")} · {itemCode}
          {warehouse ? ` · ${warehouse}` : ""}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {t("store.balance.runningBalance")}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <PackageOpen className="size-3.5" />
          {t("store.balance.noMovements")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/70 text-left text-[11px] text-muted-foreground">
                <th className="py-1 pr-3 font-medium">{t("store.receipt.postingDate")}</th>
                <th className="py-1 pr-3 font-medium">{t("store.balance.inQty")}</th>
                <th className="py-1 pr-3 font-medium">{t("store.balance.rate")}</th>
                <th className="py-1 pr-3 font-medium">
                  {t("store.balance.batch")} / {t("store.balance.serial")}
                </th>
                <th className="py-1 pr-3 font-medium">{t("common.name")}</th>
                <th className="py-1 text-end font-medium">
                  {t("store.balance.runningBalance")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const inbound = r.direction === "in";
                const rate = inbound ? r.incoming_rate : r.outgoing_rate;
                return (
                  <tr
                    key={`${r.posting_date}-${r.voucher_no}-${i}`}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                      {r.posting_date}
                      {r.posting_time ? ` ${r.posting_time}` : ""}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="inline-flex items-center gap-1">
                        {inbound ? (
                          <ArrowDownLeft className="size-3 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <ArrowUpRight className="size-3 text-orange-600 dark:text-orange-400" />
                        )}
                        <span className="tabular-nums">
                          {num(Math.abs(r.actual_qty))}
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-muted-foreground">
                      {num(rate)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <BundleChips
                        bundle={r.serial_and_batch_bundle}
                        traces={traces}
                        permissionRequired={permissionRequired}
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <VoucherLink
                        type={r.voucher_type}
                        name={r.voucher_no}
                        onNavigate={onNavigate}
                      />
                    </td>
                    <td className="py-1.5 text-end font-medium tabular-nums">
                      {num(r.running_balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasMore ? (
            <p className="pt-2 text-[11px] text-muted-foreground">
              {t("store.balance.truncated")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function BalanceTrail({ row, onNavigate }) {
  const { t } = useTranslation();

  // Starts in "loading" rather than "idle" on purpose. This component is only
  // mounted while a row is expanded, so loading IS the initial state -- setting
  // it from inside the effect is a synchronous setState that cascades a render.
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [traces, setTraces] = useState(null);
  const [permissionRequired, setPermissionRequired] = useState(false);

  // Destructured so the dependency is the value, not the object: the compiler
  // infers `row` for a callback reading row.item_code, and a manually narrower
  // dependency list than the inferred one is rejected as unpreservable.
  const itemCode = row?.item_code;
  const warehouse = row?.warehouse;

  const load = useCallback(async () => {
    if (!itemCode || !warehouse) return;
    try {
      const res = await get("method/erpnext_ui.api.get_stock_ledger_trail", {
        item_code: itemCode,
        warehouse,
      });
      setState({ status: "done", data: res.message || res.data || null, error: "" });

      const bundles = (res.message?.rows || [])
        .map((r) => r.serial_and_batch_bundle)
        .filter(Boolean);
      if (!bundles.length) {
        setTraces({});
        setPermissionRequired(false);
        return;
      }

      const traceRes = await get("method/erpnext_ui.api.get_bundle_trace", {
        bundles: JSON.stringify(bundles),
      });
      const payload = traceRes.message || {};
      setPermissionRequired(!!payload.permission_required);
      setTraces(payload.results || {});
    } catch (e) {
      setState({ status: "error", data: null, error: e?.message || String(e) });
    }
  }, [itemCode, warehouse]);

  useEffect(() => {
    // Every setState in `load` happens after an awaited API response, never
    // synchronously in the effect body -- which is why the loading state is the
    // component's initial state rather than something set here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (state.status === "loading") {
    return <p className="px-3 py-3 text-xs text-muted-foreground">{t("common.loading")}</p>;
  }
  if (state.status === "error") {
    return <p className="px-3 py-3 text-xs text-destructive">{state.error}</p>;
  }

  return (
    <TrailTable
      itemCode={itemCode}
      warehouse={warehouse}
      rows={state.data?.rows || []}
      traces={traces}
      permissionRequired={permissionRequired}
      hasMore={state.data?.has_more}
      onNavigate={onNavigate}
    />
  );
}