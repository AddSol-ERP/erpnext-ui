import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardList, Factory, Search, Package } from "lucide-react";
import AppModal from "../../AppModal";
import { get, getMethod } from "../../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "../../FormField";
import { useToast } from "../../../context/ToastContext";

/**
 * Get Items — the two ways stock enters a Stock Entry, chosen by what the entry
 * is *for*, not by ERPNext doctype.
 *
 * The previous version opened on a dropdown of five raw doctype names
 * ("Material Request", "Purchase Receipt", "Bill of Materials", …) that did not
 * depend on the selected entry type at all, so a user could pick a Material
 * Request to drive a Material Receipt. On top of that it copied `item_code /
 * qty / uom` and nothing else — no `material_request`, no
 * `material_request_item` — so issuing goods never moved the source request's
 * `ordered_qty`, and an indent stayed "owed" forever. It also loaded a request
 * at its full requested quantity rather than what was outstanding, so a second
 * load double-issued.
 *
 * This version asks one question: what are these items coming from?
 *
 *   - a pending indent (Material Issue / Material Transfer)  -> make_stock_entry
 *   - a work order (the manufacturing moves)                  -> make_stock_entry
 *   - nowhere, I know the items                               -> add them yourself
 *
 * Both document paths go through ERPNext's own whitelisted mappers, which
 * validate the source, set the linkage fields and prefill the outstanding
 * quantity. We never rebuild that mapping.
 */

/** Source kinds, per entry type. ERPNext doctype names appear nowhere above. */
const SOURCES = {
  issue: ["indent", "self"],
  receipt: ["self"],
  transfer: ["indent", "self"],
  transferForManufacture: ["workOrder", "self"],
  consumption: ["workOrder", "self"],
  manufacture: ["self"],
  repack: ["self"],
  disassemble: ["self"],
  subcontractor: ["self"],
};

const SOURCE_ICONS = {
  indent: ClipboardList,
  workOrder: Factory,
  self: Package,
};

export default function GetItemsModal({
  show,
  onClose,
  purpose,
  loadMappedDocument,
  addItemByCode,
}) {
  const { t } = useTranslation();
  const toast = useToast();

  // Which sources make sense for the entry type currently selected.
  const allowed = useMemo(() => SOURCES[purpose] || ["self"], [purpose]);

  // Seeded from the purpose, and the parent keys this component on
  // `show` + purpose -- so it remounts with the right source selected and no
  // leftover state from a previous, abandoned attempt. That avoids both a
  // synchronous setState-in-effect reset and a stale source carried over.
  const [source, setSource] = useState(() => allowed[0] || "self");
  const [loading, setLoading] = useState(false);

  // Document pickers
  const [documents, setDocuments] = useState([]);
  const [selected, setSelected] = useState("");
  const [rows, setRows] = useState([]);

  // Self add
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("1");
  const [hits, setHits] = useState([]);

  const searchTimer = useRef(null);

  /**
   * List the source documents for the chosen source kind.
   *
   * Each list is filtered to what can actually be acted on. The old version
   * fetched `fields: ["name"]` with no filters at all on type change, so it
   * briefly offered drafts and closed orders before overwriting them.
   */
  const listDocuments = useCallback(async (kind) => {
    if (kind === "indent") {
      const message = await getMethod("method/erpnext_ui.api.get_indent_queue");
      return (message.requests || []).map((r) => ({
        id: r.name,
        title: r.name,
        subtitle: [
          r.company,
          r.projects?.length ? r.projects.join(", ") : t("store.scopes.general"),
          t("store.giveItems.outstanding"),
        ]
          .filter(Boolean)
          .join(" • "),
        qty: r.outstanding_total,
      }));
    }

    if (kind === "workOrder") {
      // Must be submitted and not stopped for a Work Order to be consumable
      // (stock_entry.py:2146-2151 rejects anything else).
      const res = await get("resource/Work Order", {
        filters: JSON.stringify([
          ["docstatus", "=", 1],
          ["status", "not in", ["Closed", "Stopped"]],
        ]),
        fields: JSON.stringify([
          "name",
          "production_item",
          "status",
          "qty",
          "produced_qty",
        ]),
        order_by: "modified desc",
        limit_page_length: 20,
      });
      return (res.data || []).map((w) => ({
        id: w.name,
        title: w.name,
        subtitle: `${w.production_item} • ${w.status}`,
        qty: Number(w.qty) - Number(w.produced_qty),
      }));
    }

    return [];
  }, [t]);

  useEffect(() => {
    if (!show || !source || source === "self") return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const list = await listDocuments(source);
        if (!cancelled) setDocuments(list);
      } catch (e) {
        if (!cancelled) {
          setDocuments([]);
          toast.error(e.message || String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [show, source, listDocuments, toast]);

  /** Preview what picking a document would bring in, with outstanding quantities. */
  const openDocument = useCallback(
    async (id) => {
      setLoading(true);
      try {
        if (source === "indent") {
          const res = await get(
            "method/erpnext.stock.doctype.material_request.material_request.make_stock_entry",
            { source_name: id },
          );
          const draft = Array.isArray(res.message) ? res.message[0] : res.message;
          setSelected(id);
          setRows(
            (draft?.items || []).map((r) => ({
              key: r.material_request_item || r.item_code,
              code: r.item_code,
              name: r.item_name,
              qty: Number(r.qty) || 0,
              uom: r.uom,
              stockUom: r.stock_uom,
            })),
          );
        } else {
          const res = await get(
            "method/erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry",
            { work_order_id: id, purpose },
          );
          const draft = Array.isArray(res.message) ? res.message[0] : res.message;
          setSelected(id);
          setRows(
            (draft?.items || []).map((r) => ({
              key: r.item_code,
              code: r.item_code,
              name: r.item_name,
              qty: Number(r.qty) || 0,
              uom: r.uom,
              stockUom: r.stock_uom,
            })),
          );
        }
      } catch (e) {
        toast.error(e.message || String(e));
      } finally {
        setLoading(false);
      }
    },
    [source, purpose, toast],
  );

  const confirmDocument = useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    try {
      if (source === "indent") {
        const res = await get(
          "method/erpnext.stock.doctype.material_request.material_request.make_stock_entry",
          { source_name: selected },
        );
        const draft = Array.isArray(res.message) ? res.message[0] : res.message;
        await loadMappedDocument(draft, { stockMode: "strict" });
      } else {
        const res = await get(
          "method/erpnext.manufacturing.doctype.work_order.work_order.make_stock_entry",
          { work_order_id: selected, purpose },
        );
        const draft = Array.isArray(res.message) ? res.message[0] : res.message;
        await loadMappedDocument(draft, { stockMode: "strict" });
      }
      onClose();
    } catch (e) {
      toast.error(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [selected, source, purpose, loadMappedDocument, onClose, toast]);

  const searchItems = useCallback((value) => {
    setCode(value);
    clearTimeout(searchTimer.current);

    if (!value || value.length < 2) {
      setHits([]);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      try {
        const res = await get("method/frappe.desk.search.search_link", {
          doctype: "Item",
          txt: value,
          page_length: 10,
          filters: JSON.stringify([
            ["disabled", "=", 0],
            ["has_variants", "=", 0],
            ["is_stock_item", "=", 1],
          ]),
        });
        setHits(res.message || []);
      } catch {
        setHits([]);
      }
    }, 300);
  }, []);

  const addSelfItem = useCallback(async () => {
    if (!code || !Number(qty) || Number(qty) <= 0) return;
    await addItemByCode(code, Number(qty));
    setCode("");
    setQty("1");
    setHits([]);
  }, [code, qty, addItemByCode]);

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("store.getItems.title")}
      footer={
        source === "self" ? (
          <>
            <Button variant="outline" onClick={onClose}>
              {t("common.done")}
            </Button>
            <Button onClick={addSelfItem} disabled={!code || !Number(qty) || Number(qty) <= 0}>
              {t("store.getItems.addItem")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirmDocument} disabled={!selected || loading}>
              {t("store.getItems.useThese", { count: rows.length })}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {/* WHAT ARE THESE ITEMS FROM? */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {allowed.map((kind) => {
            const Icon = SOURCE_ICONS[kind] || Package;
            const active = source === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  setSource(kind);
                  setSelected("");
                  setRows([]);
                }}
                className={`flex flex-col items-start gap-1 rounded-lg p-3 text-start ring-1 transition-colors ${
                  active
                    ? "bg-primary/10 ring-primary/40"
                    : "bg-background ring-foreground/10 hover:bg-muted"
                }`}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {t(`store.getItems.sources.${kind}.title`)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(`store.getItems.sources.${kind}.description`)}
                </span>
              </button>
            );
          })}
        </div>

        {source === "self" ? (
          <div className="relative">
            <Input
              value={code}
              onChange={(e) => searchItems(e.target.value)}
              placeholder={t("store.getItems.searchItem")}
              aria-label={t("store.getItems.searchItem")}
              autoFocus
            />
            {hits.length ? (
              <div className="absolute start-0 end-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10">
                {hits.map((h) => (
                  <button
                    key={h.value}
                    type="button"
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setCode(h.value);
                      setHits([]);
                    }}
                  >
                    <Search className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate text-sm">{h.value}</div>
                      {h.description ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {h.description}
                        </div>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {t("store.getItems.selfHint")}
            </p>
            <FormField label={t("store.form.qty")} required className="mt-3">
              <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
            </FormField>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              {loading && !documents.length ? (
                <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
              ) : null}

              {!loading && !documents.length ? (
                <p className="text-xs text-muted-foreground">
                  {t("store.getItems.nothingToPick")}
                </p>
              ) : null}

              {documents.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => openDocument(d.id)}
                  className={`flex w-full flex-col rounded-lg px-3 py-2 text-start ring-1 transition-colors ${
                    selected === d.id
                      ? "bg-primary/10 ring-primary/40"
                      : "bg-background ring-foreground/10 hover:bg-muted"
                  }`}
                >
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {d.subtitle}
                  </div>
                </button>
              ))}
            </div>

            {rows.length ? (
              <div className="flex flex-col gap-1 border-t border-border/60 pt-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("store.getItems.willAdd", { count: rows.length })}
                </p>
                <div className="max-h-48 overflow-y-auto">
                  {rows.map((r) => (
                    <div
                      key={r.key}
                      className="flex items-center justify-between gap-2 py-0.5 text-sm"
                    >
                      <span className="truncate">
                        {r.code}
                        {r.name ? (
                          <span className="text-muted-foreground"> · {r.name}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {r.qty} {r.uom}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </AppModal>
  );
}
