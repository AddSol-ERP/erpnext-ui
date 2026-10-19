import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import DashboardShell from "../../../../components/dashboard/DashboardShell";
import FormSection from "../../../../components/FormSection";
import { FormField } from "../../../../components/FormField";
import FormErrorSummary from "../../../../components/FormErrorSummary";
import LinkField from "../../../../components/LinkField";
import ConfirmDialog from "../../../../components/ConfirmDialog";
import { AttachDialog } from "../../../../components/Attachments";
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
  minOffcut,
  plateGeometry,
  serverReason,
} from "../estimate";
import { isComplete, rowIssues } from "../../../../lib/offcutIssues";

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
  // A plate chosen from the "available" tab arrives here as ?serial=, so the
  // operator never picks the same plate twice. useSearchParams, not
  // window.location: the router owns the query string and a raw read would miss
  // a client-side navigation.
  const [searchParams] = useSearchParams();
  const prefillSerial = name ? "" : (searchParams.get("serial") || "").trim();
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
    isEdit
      ? null
      : {
          doctype: DOCTYPE,
          docstatus: 0,
          offcuts: [],
          ...(prefillSerial ? { source_serial_no: prefillSerial } : {}),
        },
  );
  const [rows, setRows] = useState(() =>
    isEdit ? [] : [{ _rid: nextRid(), length_mm: "", width_mm: "", pieces: 1 }],
  );
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  // Attach step, shown after the Submit confirmation and before the submit
  // itself. The draft is saved by then -- Submit only appears once `isEdit` --
  // so the files have a document to hang from.
  const [showAttach, setShowAttach] = useState(false);

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
          setDoc({
            doctype: DOCTYPE,
            docstatus: 0,
            offcuts: [],
            ...(prefillSerial ? { source_serial_no: prefillSerial } : {}),
          });
          setRows([]);
          // One blank row, so a prefilled plate opens onto something to type
          // sizes into rather than an empty table with an Add button.
          if (prefillSerial) {
            setRows([{ _rid: nextRid(), length_mm: "", width_mm: "", pieces: 1 }]);
            setDirty(true);
          }
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
  // The plate's real size, from the estimate. Declared here rather than in the
  // derived block below because `fits` needs it, and a row must not be judged
  // against a plate whose size is not known yet.
  const geometry = estimate?.geometry;

  // PER ROW, keyed by `_rid` rather than by position: a single shared message
  // reported only the FIRST bad row, so two wrong rows produced one complaint
  // about the earlier one. `_rid` also survives expansion and reordering, which
  // an index would not.
  //
  // Live issues are only `tooBig` / `tooSmall`, and only on a COMPLETE row. A
  // half-typed row is incomplete, not invalid -- otherwise passing through
  // 25000 on the way to 2500 would flash an error on a correct entry. Gaps are
  // reported by `validate()` when the operator actually tries to save.
  const liveIssues = useMemo(() => {
    const map = new Map();
    if (!geometry || !geometry.length_mm) return map;
    for (const row of rows) {
      if (!isComplete(row)) continue;
      const issues = rowIssues(row, geometry, minOffcut(estimate));
      if (issues.length) map.set(row._rid, issues);
    }
    return map;
  }, [rows, geometry, estimate]);

  // What the operator is told, in their language. Kept beside the predicates so
  // adding an issue code is one place, not two.
  const issueText = useCallback(
    (row, code) => {
      const l = num(row?.length_mm);
      const w = num(row?.width_mm);
      const plate = geometry
        ? `${num(geometry.length_mm)} x ${num(geometry.width_mm)} mm`
        : "";
      switch (code) {
        case "missing":
          return t("store.plateOffcut.errRowSize");
        case "tooBig":
          return t("store.plateOffcut.errRowTooBig", {
            length: l,
            width: w,
            plate,
          });
        case "tooSmall":
          return t("store.plateOffcut.errRowTooSmall", {
            length: l,
            width: w,
          });
        default:
          return "";
      }
    },
    [geometry, t],
  );

  const validate = useCallback(() => {
    const errors = {};
    if (!doc?.source_serial_no) errors.source_serial_no = t("store.plateOffcut.errNoSerial");
    if (!rows.length) errors.offcuts = t("store.plateOffcut.errNoOffcuts");
    // Save is where incompleteness is judged: before that, an empty row is
    // simply a row being filled in.
    rows.forEach((row) => {
      if (!isComplete(row)) {
        errors.rows = errors.rows || {};
        errors.rows[row._rid] = ["missing"];
        return;
      }
      // Already flagged live -- carry it into the save so the summary agrees
      // with what the rows are showing rather than contradicting them.
      const live = liveIssues.get(row._rid);
      if (live?.length) {
        errors.rows = errors.rows || {};
        errors.rows[row._rid] = live;
      }
    });
    return errors;
  }, [doc, rows, liveIssues, t]);

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
  const submitNow = useCallback(async () => {
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

  const handleSubmit = useCallback(async () => {
    setConfirmSubmit(false);
    if (isEdit && !docRef.current?.docstatus) {
      setShowAttach(true);
      return;
    }
    submitNow();
  }, [isEdit, submitNow]);



  /* --------------------------------------------------------------- derived */
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

  // Plate weight for the confirmation line. The estimate is authoritative while
  // the form is live; the saved document carries it otherwise.
  const sourceWeightKg =
    num(estimate?.source_weight_kg) || num(doc?.source_weight_kg);

  // Confirmation of the chosen plate, in the order an operator checks it before
  // the saw. Empty while the plate is unset, and briefly empty after a choice
  // but before the estimate answers -- which is why the container is only
  // rendered when there is something in it, rather than reserving a row of
  // dead space.
  const plateSummary = doc?.source_serial_no
    ? [
        geometry?.length_mm
          ? `${geometry.length_mm} x ${geometry.width_mm} x ${geometry.thickness_mm} mm`
          : "",
        sourceWeightKg > 0 ? `${sourceWeightKg.toFixed(3)} Kg` : "",
        doc.heat_number,
        doc.warehouse,
        doc.source_item,
        doc.source_batch,
      ].filter(Boolean)
    : [];

  const submitted = Boolean(doc?.docstatus);
  const pieces = pieceTotal(rows);

  /*
   * Save and Submit have OPPOSITE conditions, which is why they must not share
   * one `if`.
   *
   *   - Save needs something to save: the form is dirty, OR nothing has been
   *     stored yet (a brand-new form, where Save is what creates the draft).
   *   - Submit acts on the STORED document, so unsaved changes must hide it
   *     (invariant 6).
   *
   * Both used to be wrapped in a single `if (dirty)`, which made them mutually
   * exclusive and inverted the invariant: Submit appeared exactly when there
   * were unsaved changes, and vanished the instant a save succeeded. Since
   * `dirty` starts false, a freshly-opened saved draft showed NO buttons at all
   * -- so saving the document removed the only remaining action.
   *
   * Derived once here because the header and the in-form buttons are two entry
   * points and their logic must not be able to drift.
   */
  const canSave = !submitted && (dirty || !isEdit);
  const canSubmit = !submitted && !dirty;
  const over = num(estimate?.over_by_kg);

  /* --------------------------------------------------------------- header */
  useEffect(() => {
    const actions = [];
    if (!submitted) {
      if (canSave) {
        actions.push({
          label: t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
        });
      }
      if (canSubmit) {
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
            (PlateOffcut.set_source) and is shown only to confirm what is about
            to be cut. It was six labelled fields in a three-column grid -- three
            full rows to restate the plate -- which pushed the offcut rows and
            the diagram below the fold. This form exists to cut a plate, so the
            confirmation is one line, ordered by what the operator checks before
            the saw: size, then the weight that becomes the scrap budget, then
            the heat for traceability. */}
        {plateSummary.length ? (
          <div
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-muted-foreground md:col-span-2"
            data-testid="plate-summary"
          >
            {plateSummary.map((part, i) => (
              <span key={part} className="flex items-baseline gap-2">
                {i > 0 && <span aria-hidden="true">&middot;</span>}
                <span className="truncate">{part}</span>
              </span>
            ))}
          </div>
        ) : null}
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
                    // Live issues plus anything a save just flagged. Both are
                    // keyed by `_rid`, so a message cannot drift onto the row
                    // above it when one is inserted or removed.
                    const issues =
                      liveIssues.get(row._rid) || fieldErrors.rows?.[row._rid] || [];
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
                      <Fragment key={row._rid}>
                      <TableRow
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
                            aria-invalid={issues.length > 0}
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
                            aria-invalid={issues.length > 0}
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

                        {/* The message lives in the row's own span, directly
                            under it, rather than in one shared line above the
                            table -- which reported only the FIRST bad row and
                            so never named the one being looked at. */}
                        {issues.length ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell
                              colSpan={7}
                              className="border-t-0 px-2 pb-2 pt-0 text-xs text-destructive"
                            >
                              <span role="alert">
                                {issues
                                  .map((code) => issueText(row, code))
                                  .join(" ")}
                              </span>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
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

          {canSave || canSubmit ? (
            <div className="flex flex-wrap gap-2">
              {canSave && (
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="size-4" />
                  {t("common.save")}
                </Button>
              )}
              {canSubmit && (
                <Button
                  variant="btn-primary"
                  onClick={() => setConfirmSubmit(true)}
                  disabled={saving}
                >
                  <Send className="size-4" />
                  {t("common.submit")}
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Submitting POSTS STOCK: it creates Items, a Batch and a reserved Serial
          No per offcut, then submits a Repack Stock Entry. It must not read as an
          ordinary save. */}
      {/* Attach step. `onSkip` is the escape hatch that keeps a device with no
          camera from being trapped: it closes AND submits. */}
      <AttachDialog
        show={showAttach}
        doctype="Plate Offcut"
        docname={name}
        onClose={() => setShowAttach(false)}
        onSkip={() => {
          setShowAttach(false);
          submitNow();
        }}
      />

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

function Total({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-2 py-1.5">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
