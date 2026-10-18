import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import DashboardShell from "../../../../components/dashboard/DashboardShell";
import FormSection from "../../../../components/FormSection";
import { FormField } from "../../../../components/FormField";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import LinkField from "../../../../components/LinkField";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  Boxes,
  Loader2,
  Plus,
  Save,
  Scissors,
  Send,
  Trash2,
} from "lucide-react";
import {
  fetchDocument,
  saveDocument,
  submitDocument,
} from "../../../../lib/docTransition";
import { stripChildRow, stripSystemFields } from "../../../../lib/childRows";
import PlateCanvas from "../PlateCanvas";
import {
  ESTIMATE_DEBOUNCE_MS,
  fetchEstimate,
  pieceTotal,
  plateGeometry,
  serverReason,
} from "../estimate";

const DOCTYPE = "Plate Offcut";

/** Only Active serials can be cut -- the server refuses anything else. */
const SERIAL_FILTERS = { status: "Active" };

/**
 * Client-only keys on an offcut row. `pieces` is a UI affordance: the doctype has
 * no such field, so it is expanded into one child row per piece before the
 * document goes anywhere. See estimate.expandRows -- the SAME expansion feeds the
 * estimate request, or the preview would total six pieces and the save one.
 */
const ROW_CLIENT_FIELDS = ["_rid", "pieces", "weight_kg", "theoretical_weight_kg", "value"];

let ridSeq = 0;
const nextRid = () => `o${++ridSeq}`;

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function PlateOffcutForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const isEdit = Boolean(name);

  const [estimate, setEstimate] = useState(null);
  // Why the last estimate is missing, in the server's words. Separate from
  // `error` (the page-level red banner) because "this plate cannot be cut" is
  // not a malfunction and must not be dressed as one.
  const [plateNotice, setPlateNotice] = useState("");
  const [highlight, setHighlight] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  // A new offcut has nothing to fetch -- the plate is the only input and every
  // other field is derived from it server-side -- so starting on a spinner made
  // a blank form blink for a frame. Seeding the draft here also means the body
  // renders on the very first paint instead of after the effect, which is what
  // lets .smoke-tmp/entry.jsx exercise it under renderToString.
  const [doc, setDoc] = useState(() =>
    isEdit ? null : { doctype: DOCTYPE, docstatus: 0, offcuts: [] },
  );
  const [rows, setRows] = useState(() =>
    isEdit ? [] : [{ _rid: nextRid(), length_mm: "", width_mm: "", pieces: 1 }],
  );
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // `dirty` is event-based, never diff-based: only a row edit or a serial change
  // counts. The server's own derived fields arrive on load and must not be
  // mistaken for user edits.
  const [dirty, setDirty] = useState(false);
  const docRef = useRef(doc);
  const estimateSeq = useRef(0);
  const debounceTimer = useRef(null);

  /* ------------------------------------------------------------------ load */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isEdit) {
          const full = await fetchDocument(DOCTYPE, name);
          if (cancelled) return;
          setDoc(full);
          // A saved draft already carries the server's own row weights; adopt
          // them rather than re-asking, so a reopened draft shows its numbers
          // without touching a field first.
          setRows(
            (full.offcuts || []).map((row) => ({
              _rid: nextRid(),
              length_mm: row.length_mm ?? "",
              width_mm: row.width_mm ?? "",
              pieces: 1,
              weight_kg: row.weight_kg,
              theoretical_weight_kg: row.theoretical_weight_kg,
              value: row.value,
              saved_name: row.name,
            })),
          );
          setEstimate({
            source_weight_kg: full.source_weight_kg,
            total_offcut_weight_kg: full.total_offcut_weight_kg,
            total_offcut_value: full.total_offcut_value,
            scrap_weight_kg: full.scrap_weight_kg,
            scrap_value: full.scrap_value,
            over_by_kg: 0,
            perRow: new Map(),
            geometry: {
              length_mm: num(full.source_length_mm),
              width_mm: num(full.source_width_mm),
              thickness_mm: num(full.thickness_mm),
            },
          });
        } else if (!cancelled) {
          // A new offcut is a blank draft; the only field the operator supplies is
          // the plate, and everything else is derived from it server-side.
          setDoc({ doctype: DOCTYPE, docstatus: 0, offcuts: [] });
          setRows([]);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || t("common.failedToLoad", { name: name }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  /* -------------------------------------------------------------- estimate */
  const requestEstimate = useCallback(
    (serialNo, currentRows) => {
      if (!serialNo) return;
      if (docRef.current?.docstatus) return; // a submitted doc holds its own numbers

      // Keystrokes are a firehose; asking per keystroke would queue replies.
      clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        // A slow earlier reply must never overwrite a newer answer.
        const seq = ++estimateSeq.current;
        fetchEstimate(serialNo, currentRows)
          .then((payload) => {
            if (seq !== estimateSeq.current) return;
            setPlateNotice("");
            setEstimate({ ...payload, geometry: plateGeometry(payload) });
          })
          .catch((e) => {
            if (seq !== estimateSeq.current) return;
            // Drop the stale numbers rather than leave last time's weights
            // standing next to new dimensions.
            setEstimate(null);
            // And say WHY, quietly. "Serial No PL-000008 has no weight on it"
            // is a fact about the plate, not a failure of this screen, so it
            // belongs under the plate field -- not in the red banner, which
            // reads as "your save broke" and would be the wrong story. A
            // transport failure yields "" and stays silent.
            setPlateNotice(serverReason(e));
          });
      }, ESTIMATE_DEBOUNCE_MS);
    },
    [],
  );

  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  /* ----------------------------------------------------------------- edits */
  const patchRow = useCallback((rid, changes) => {
    setRows((prev) => prev.map((r) => (r._rid === rid ? { ...r, ...changes } : r)));
    setDirty(true);
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { _rid: nextRid(), length_mm: "", width_mm: "", pieces: 1 }]);
    setDirty(true);
  }, []);

  const removeRow = useCallback((rid) => {
    setRows((prev) => prev.filter((r) => r._rid !== rid));
    setDirty(true);
  }, []);

  const onSerialChange = useCallback(
    (serial) => {
      setDoc((prev) => ({ ...prev, source_serial_no: serial || "" }));
      setDirty(true);
      // Choosing a plate invalidates every number from the previous one.
      setEstimate(null);
      setPlateNotice("");
      if (serial) requestEstimate(serial, rows);
    },
    [rows, requestEstimate],
  );

  /* ------------------------------------------------------------ validation */
  const validate = useCallback(() => {
    const errors = {};
    if (!doc?.source_serial_no) errors.source_serial_no = t("store.plateOffcut.errNoSerial");
    if (!rows.length) errors.offcuts = t("store.plateOffcut.errNoOffcuts");
    rows.forEach((r, i) => {
      if (!(num(r.length_mm) > 0) || !(num(r.width_mm) > 0)) {
        errors.offcuts =
          errors.offcuts ||
          t("store.plateOffcut.errRowSize", { row: i + 1 });
      }
    });
    return errors;
  }, [doc, rows, t]);

  /* ------------------------------------------------------------------ save */
  const buildPayload = useCallback(() => {
    const out = stripSystemFields(doc || {});
    out.doctype = DOCTYPE;
    // `pieces` becomes real child rows. Nothing client-only survives: the server
    // recomputes offcut_item / theoretical_weight_kg / weight_kg / value in
    // validate(), so posting them back would be stale at best.
    out.offcuts = rows.flatMap(expandForSave).map((row) => stripChildRow(row));
    return out;
  }, [doc, rows]);

  const handleSave = useCallback(async () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setError("");
    try {
      const res = await saveDocument({
        doctype: DOCTYPE,
        name: isEdit ? name : undefined,
        doc: buildPayload(),
      });
      const saved = res.data.name;
      setDirty(false);
      navigate(`/store/plate-offcut/${encodeURIComponent(saved)}`);
    } catch (e) {
      setError(e.message || t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [buildPayload, isEdit, name, navigate, t, validate]);

  /* ---------------------------------------------------------------- submit */
  const handleSubmit = useCallback(async () => {
    setConfirmSubmit(false);
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    setError("");
    try {
      // No Workflow exists for this doctype, so this correctly falls through to
      // frappe.client.submit rather than apply_workflow.
      const payload = buildPayload();
      const saved = await saveDocument({
        doctype: DOCTYPE,
        name: isEdit ? name : undefined,
        doc: payload,
      });
      await submitDocument({
        doctype: DOCTYPE,
        name: saved.data.name,
        doc: payload,
      });
      setDirty(false);
      navigate(`/store/plate-offcut/${encodeURIComponent(saved.data.name)}`);
    } catch (e) {
      setError(e.message || t("common.submitFailed"));
    } finally {
      setSaving(false);
    }
  }, [buildPayload, isEdit, name, navigate, t, validate]);

  /* --------------------------------------------------------------- derived */
  const geometry = estimate?.geometry;
  const utilisation = useMemo(() => {
    const src = num(estimate?.source_weight_kg);
    if (!(src > 0)) return null;
    return Math.round((num(estimate.total_offcut_weight_kg) / src) * 1000) / 10;
  }, [estimate]);

  const canvasPieces = useMemo(
    () =>
      rows.map((r) => ({
        id: r._rid,
        length_mm: r.length_mm,
        width_mm: r.width_mm,
        count: r.pieces,
      })),
    [rows],
  );

  const submitted = Boolean(doc?.docstatus);
  const pieces = pieceTotal(rows);
  const over = num(estimate?.over_by_kg);

  /* --------------------------------------------------------------- header */
  useEffect(() => {
    const actions = [];
    if (!submitted) {
      if (dirty) {
        actions.push({
          label: t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
        });
        actions.push({
          label: t("common.submit"),
          variant: "btn-primary",
          onClick: () => setConfirmSubmit(true),
        });
      }
    } else {
      actions.push({
        label: t("store.plateOffcut.backToList"),
        variant: "btn-outline-primary",
        onClick: () => navigate("/store/plate-offcut"),
      });
    }

    setHeader({
      title: isEdit ? name : t("store.plateOffcut.newTitle"),
      subtitle: submitted
        ? t("store.plateOffcut.submittedReadOnly", { name: name || "" })
        : t("store.plateOffcut.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.plateOffcut.title"), path: "/store/plate-offcut" },
        ...(isEdit ? [{ label: name }] : [{ label: t("common.new") }]),
      ],
      actions: actions.filter(Boolean),
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, name, submitted, dirty, saving]);

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell className="max-w-[1400px]">
      <FormErrorSummary summary={error} fieldErrors={fieldErrors} />

      <FormSection
        title={t("store.form.basics")}
        icon={Scissors}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
      >
        <FormField
          label={t("store.plateOffcut.sourceSerial")}
          required
          name="source_serial_no"
          error={fieldErrors.source_serial_no}
          // `hint` and not `error`: FormField drops the hint whenever an error
          // is set, and marks aria-invalid -- both wrong here, since nothing is
          // invalid about what the operator typed. The plain hint also survives
          // a real "pick a plate" validation error being shown above it.
          hint={plateNotice || t("store.plateOffcut.sourceSerialHint")}
        >
          <LinkField
            doctype="Serial No"
            filters={SERIAL_FILTERS}
            value={doc?.source_serial_no || ""}
            onChange={onSerialChange}
            placeholder={t("store.plateOffcut.sourceSerial")}
            disabled={submitted}
          />
        </FormField>

        {/* Everything below is DERIVED by the server from the serial
            (PlateOffcut.set_source) and shown for confirmation only. */}
        <ReadOnly
          label={t("store.plateOffcut.sourceItem")}
          value={doc?.source_item}
        />
        <ReadOnly label={t("store.plateOffcut.batch")} value={doc?.source_batch} />
        <ReadOnly label={t("store.plateOffcut.heatNumber")} value={doc?.heat_number} />
        <ReadOnly label={t("store.plateOffcut.warehouse")} value={doc?.warehouse} />
        <ReadOnly
          label={t("store.plateOffcut.plateSize")}
          value={
            geometry?.length_mm
              ? `${geometry.length_mm} x ${geometry.width_mm} mm`
              : ""
          }
        />
        <ReadOnly
          label={t("store.plateOffcut.plateWeight")}
          value={
            estimate?.source_weight_kg !== undefined &&
            estimate?.source_weight_kg !== null
              ? `${estimate.source_weight_kg} Kg`
              : doc?.source_weight_kg
                ? `${doc.source_weight_kg} Kg`
                : ""
          }
        />
      </FormSection>

      {/* OVERAGE -- a warning, never a block. `over_by_kg` comes from the
          PREVIEW, so it can be stale the moment the operator types again, and
          the server's compute_totals is the authority on whether a save is
          allowed. Blocking here could refuse a valid cut. */}
      {over > 0 ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" />
          {t("store.plateOffcut.overBy", { kg: over })}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <FormSection
          title={t("store.plateOffcut.offcutsTitle")}
          icon={Boxes}
          action={
            !submitted ? (
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="size-4" />
                {t("common.addRow")}
              </Button>
            ) : null
          }
        >
          {fieldErrors.offcuts ? (
            <p className="mb-2 text-xs text-destructive">{fieldErrors.offcuts}</p>
          ) : null}

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("store.plateOffcut.noOffcutsYet")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("store.plateOffcut.length")}</TableHead>
                    <TableHead>{t("store.plateOffcut.width")}</TableHead>
                    <TableHead className="text-end">
                      {t("store.plateOffcut.pieces")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("store.plateOffcut.weightEach")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("store.plateOffcut.rowWeight")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("store.plateOffcut.rowValue")}
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const agg = estimate?.perRow?.get(row._rid);
                    const shown =
                      agg ??
                      (row.weight_kg !== undefined
                        ? {
                            weight_kg: num(row.weight_kg),
                            value: num(row.value),
                          }
                        : null);
                    const pieces = Math.max(1, Math.floor(num(row.pieces) || 1));
                    return (
                      <TableRow
                        key={row._rid}
                        className={
                          highlight === row._rid ? "bg-primary/[0.06]" : undefined
                        }
                        onMouseEnter={() => setHighlight(row._rid)}
                        onMouseLeave={() => setHighlight(null)}
                      >
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-8"
                            value={row.length_mm ?? ""}
                            disabled={submitted}
                            aria-label={t("store.plateOffcut.length")}
                            onChange={(e) => {
                              patchRow(row._rid, { length_mm: e.target.value });
                              requestEstimate(docRef.current?.source_serial_no, [
                                ...rows.filter((r) => r._rid !== row._rid),
                                { ...row, length_mm: e.target.value },
                              ]);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="h-8"
                            value={row.width_mm ?? ""}
                            disabled={submitted}
                            aria-label={t("store.plateOffcut.width")}
                            onChange={(e) => {
                              patchRow(row._rid, { width_mm: e.target.value });
                              requestEstimate(docRef.current?.source_serial_no, [
                                ...rows.filter((r) => r._rid !== row._rid),
                                { ...row, width_mm: e.target.value },
                              ]);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-end">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            className="h-8 text-end tabular-nums"
                            value={row.pieces ?? 1}
                            disabled={submitted}
                            aria-label={t("store.plateOffcut.pieces")}
                            onChange={(e) => {
                              patchRow(row._rid, { pieces: e.target.value });
                              requestEstimate(docRef.current?.source_serial_no, [
                                ...rows.filter((r) => r._rid !== row._rid),
                                { ...row, pieces: e.target.value },
                              ]);
                            }}
                          />
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">
                          {shown && pieces > 1
                            ? `${(shown.weight_kg / pieces).toFixed(3)}`
                            : shown
                              ? shown.weight_kg.toFixed(3)
                              : "—"}
                        </TableCell>
                        <TableCell className="text-end font-medium tabular-nums">
                          {shown ? shown.weight_kg.toFixed(3) : "—"}
                        </TableCell>
                        <TableCell className="text-end tabular-nums text-muted-foreground">
                          {shown ? shown.value.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell>
                          {!submitted ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeRow(row._rid)}
                              aria-label={t("common.delete")}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* TOTALS -- all four come from the server. */}
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Total
              label={t("store.plateOffcut.totalPieces")}
              value={String(pieces)}
            />
            <Total
              label={t("store.plateOffcut.totalOffcutWeight")}
              value={
                estimate?.total_offcut_weight_kg !== undefined
                  ? `${estimate.total_offcut_weight_kg} Kg`
                  : "—"
              }
            />
            <Total
              label={t("store.plateOffcut.totalOffcutValue")}
              value={
                estimate?.total_offcut_value !== undefined
                  ? estimate.total_offcut_value.toFixed(2)
                  : "—"
              }
            />
            <Total
              label={t("store.plateOffcut.scrap")}
              value={
                estimate?.scrap_weight_kg !== undefined
                  ? `${estimate.scrap_weight_kg} Kg`
                  : "—"
              }
            />
          </div>
        </FormSection>

        <div className="space-y-3">
          <FormSection title={t("store.plateOffcut.canvasTitle")} icon={Scissors}>
            <PlateCanvas
              plateLength={geometry?.length_mm}
              plateWidth={geometry?.width_mm}
              pieces={canvasPieces}
              weightsByRow={estimate?.perRow}
              highlightedRow={highlight}
              onHighlightRow={setHighlight}
              utilisationPct={utilisation}
            />
          </FormSection>

          {!submitted && dirty ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="size-4" />
                {t("common.save")}
              </Button>
              <Button
                variant="btn-primary"
                onClick={() => setConfirmSubmit(true)}
                disabled={saving}
              >
                <Send className="size-4" />
                {t("common.submit")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Submitting POSTS STOCK: it creates Items, a Batch and a reserved Serial
          No per offcut, then submits a Repack Stock Entry. It must not read as an
          ordinary save. */}
      <ConfirmDialog
        open={confirmSubmit}
        loading={saving}
        title={t("store.plateOffcut.submitTitle")}
        message={t("store.plateOffcut.submitMessage", {
          pieces,
          scrap: estimate?.scrap_weight_kg ?? 0,
        })}
        onCancel={() => setConfirmSubmit(false)}
        onConfirm={handleSubmit}
      />
    </DashboardShell>
  );
}

/**
 * One child row per piece, for the save payload.
 *
 * The doctype has no `pieces` field, so the UI count has to become real rows.
 * Exactly one child may carry `name`: the row a saved draft already had. The
 * pieces BEYOND it are genuinely new children, and repeating the name across them
 * would make Frappe treat each as an update to the same row rather than an insert.
 */
function expandForSave(row) {
  const count = Math.max(1, Math.floor(num(row.pieces) || 1));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const child = { length_mm: row.length_mm, width_mm: row.width_mm };
    if (i === 0 && row.saved_name) child.name = row.saved_name;
    out.push(child);
  }
  return out;
}

function ReadOnly({ label, value }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="flex h-8 items-center truncate text-sm text-muted-foreground">
        {value || "—"}
      </span>
    </div>
  );
}

function Total({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
