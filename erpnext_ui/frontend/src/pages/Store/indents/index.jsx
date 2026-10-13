import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, HandHelping } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import { get, post } from "../../../services/api";
import { submitDocument } from "../../../lib/docTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "../../../components/List/StatusBadge";

/**
 * The store keeper's side of an indent: everything raised by others that is
 * still owed material.
 *
 * Outstanding quantity is `stock_qty - ordered_qty` per item, computed
 * server-side by `erpnext_ui.api.get_indent_queue`. This page deliberately does
 * **not** re-derive it — see MEMORY.md §3.7 for why `received_qty` is the wrong
 * field here.
 *
 * Handing material over goes through ERPNext's own
 * `material_request.make_stock_entry`, which maps purpose, warehouses and the
 * material_request / material_request_item linkage, and pre-fills each line with
 * the outstanding quantity. We let the store keeper lower a quantity for a
 * partial issue and then save + submit, rather than assembling a Stock Entry by
 * hand — the `Stock Entry` `on_submit` hook is what keeps the indent's
 * progress honest.
 */

const STATUS_TONE = {
  Draft: "open",
  Submitted: "pending",
  Stopped: "danger",
  Cancelled: "danger",
};

function statusOf(request) {
  if (request.status === "Stopped") return { label: "Stopped", tone: "danger" };
  if (request.per_ordered >= 100) return { label: "Complete", tone: "complete" };
  return { label: request.status || "Submitted", tone: "pending" };
}

export default function IndentQueue() {
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState({});
  const [busy, setBusy] = useState(false);

  /** request name -> { item_row_name: qty to hand over now } */
  const [giveQty, setGiveQty] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const message = await get("method/erpnext_ui.api.get_indent_queue");
      setData(message.requests || []);
    } catch (e) {
      setError(e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setHeader({
      title: t("store.giveItems.title"),
      subtitle: t("store.giveItems.description"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.giveItems.title") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // load only setStates after the awaited API response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const toggle = (name) => setExpanded((p) => ({ ...p, [name]: !p[name] }));

  const setQty = (requestName, itemName, value) =>
    setGiveQty((p) => ({
      ...p,
      [requestName]: { ...(p[requestName] || {}), [itemName]: value },
    }));

  /** Quantity for a row: what the user typed, else the full outstanding qty. */
  const qtyFor = (request, item) => {
    const typed = giveQty[request.name]?.[item.name];
    return typed === undefined || typed === "" ? item.outstanding_qty : typed;
  };

  /**
   * Hand material over against one indent.
   *
   * `make_stock_entry` is the whitelisted ERPNext mapper. It returns the mapped
   * (still unsaved) Stock Entry with purpose, warehouses, linkage fields and
   * per-line outstanding quantities already filled in, so the only thing this
   * page changes is the quantity the store keeper actually hands over now.
   */
  const give = async (request) => {
    setBusy(true);
    setError(null);
    setNotice("");

    try {
      const mapped = await post(
        "method/erpnext.stock.doctype.material_request.material_request.make_stock_entry",
        { source_name: request.name },
      );

      // make_stock_entry returns a mapped-doc list; be tolerant of either shape.
      const doclist = Array.isArray(mapped?.message) ? mapped.message : null;
      const draft = doclist ? doclist[0] : mapped?.message;
      if (!draft) throw new Error(t("common.failedToLoad"));

      // Lower (never raise) each line to what the user typed. Raising above the
      // outstanding quantity would be rejected by ERPNext anyway -- the MR's
      // update_completed_qty check throws on over-issue.
      const wanted = giveQty[request.name] || {};
      const items = (draft.items || []).map((row) => {
        const wantedQty = wanted[row.material_request_item];
        if (wantedQty === undefined || wantedQty === "") return row;
        const converted = Number(wantedQty) / (Number(row.conversion_factor) || 1);
        // transfer_qty is read-only and re-derived server-side by
        // set_transfer_qty, so posting a value here would be discarded. Strip it
        // rather than sending a stale one.
        const row2 = { ...row };
        delete row2.transfer_qty;
        return { ...row2, qty: Math.min(Math.max(converted, 0), Number(row.qty) || 0) };
      });

      const keepable = items.filter((row) => Number(row.qty) > 0);
      if (!keepable.length) {
        setNotice(t("store.giveItems.nothingToGive"));
        return;
      }

      const created = await post("resource/Stock Entry", { ...draft, items: keepable });
      const entryName = created?.data?.name;

      if (entryName) {
        await submitDocument({ doctype: "Stock Entry", name: entryName });
      }

      setGiveQty((p) => ({ ...p, [request.name]: {} }));
      setNotice(t("store.giveItems.given", { name: entryName }));
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(
    () =>
      data.map((request) => {
        const status = statusOf(request);
        return { ...request, statusLabel: status.label, statusTone: status.tone };
      }),
    [data],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 pt-4">
      {notice ? (
        <p className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message || String(error)}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border border-border/70 bg-card px-4 py-10 text-center">
          <HandHelping className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("store.giveItems.empty")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((request) => {
            const isOpen = !!expanded[request.name];
            const noWarehouse = request.items.some((i) => !i.warehouse);

            return (
              <div key={request.name} className="border border-border/70 bg-card">
                <button
                  type="button"
                  onClick={() => toggle(request.name)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{request.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[
                        request.company,
                        request.material_request_type,
                        request.projects?.length
                          ? request.projects.join(", ")
                          : t("store.scopes.general"),
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  </div>
                  <StatusBadge tone={request.statusTone}>{request.statusLabel}</StatusBadge>
                </button>

                {isOpen ? (
                  <div className="border-t border-border/60 px-3 py-2">
                    <p className="mb-2 text-xs text-muted-foreground">
                      {t("store.giveItems.partialHint")}
                    </p>

                    <div className="flex flex-col gap-2">
                      {request.items.map((item) => (
                        <div
                          key={item.name}
                          className="grid grid-cols-1 gap-2 sm:grid-cols-12 sm:items-center"
                        >
                          <div className="sm:col-span-5 min-w-0">
                            <div className="truncate text-sm">{item.item_name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {[
                                item.item_code,
                                item.project || t("store.scopes.general"),
                                t("store.giveItems.outstanding") +
                                  `: ${item.outstanding_qty} ${item.stock_uom || ""}`,
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </div>
                          </div>
                          <div className="sm:col-span-3">
                            <Input
                              type="number"
                              aria-label={t("store.giveItems.giveNow")}
                              value={qtyFor(request, item)}
                              onChange={(e) =>
                                setQty(request.name, item.name, e.target.value)
                              }
                            />
                          </div>
                          <div className="sm:col-span-4">
                            {!item.warehouse ? (
                              <span className="text-xs text-amber-600">
                                {t("store.giveItems.noWarehouse")}
                              </span>
                            ) : (
                              <span className="truncate text-xs text-muted-foreground">
                                {item.warehouse}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex justify-end">
                      <Button
                        onClick={() => give(request)}
                        disabled={busy || noWarehouse}
                      >
                        {t("store.giveItems.title")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
