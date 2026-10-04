import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../../context/HeaderContext";
import { get } from "../../../../services/api";
import { saveDocument } from "../../../../lib/docTransition";
import { FormField } from "../../../../components/FormField";
import FormSection from "../../../../components/FormSection";
import { ClipboardList } from "lucide-react";
import LinkField from "../../../../components/LinkField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { gridCorners } from "../../../../lib/gridCorners";

const PARAM_BP = [{ cols: 1 }, { min: "md", cols: 2 }, { min: "lg", cols: 3 }];

export default function InspectionForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const isEdit = !!name;

  const [doc, setDoc] = useState({
    template: "",
    item_code: "",
  });

  // Always points at the newest document. The Save button is registered into
  // the page toolbar by an effect that deliberately does not depend on `doc`
  // (re-running it per keystroke would thrash the toolbar), so the registered
  // handler closes over the document as of an early render -- validation and
  // the saved payload then used stale data. Handlers read through this ref.
  const docRef = useRef(doc);

  // Synced in an effect, not during render: the React Compiler lint rule
  // forbids mutating a ref while rendering. Handlers run after a commit.
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);


  const [parameters, setParameters] = useState([]);

  /* ================= CALC ================= */
  const updateReading = (pi, vi, value) => {
    const updated = [...parameters];
    const p = updated[pi];

    p.values[vi] = value;

    const nums = p.values.map((v) => parseFloat(v)).filter((v) => !isNaN(v));

    if (nums.length === 0) {
      p.status = "Pending";
      setParameters(updated);
      return;
    }

    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const target = (p.min_value + p.max_value) / 2;
    const deviation = Math.abs((avg - target) / target) * 100;

    p.avg = avg.toFixed(2);
    p.deviation = deviation.toFixed(2);

    if (deviation <= p.tolerance) {
      p.status = "PASS";
    } else {
      p.status = "FAIL";
    }

    setParameters(updated);
  };

  /* ================= RESULT ================= */
  const overallStatus = (() => {
    if (!parameters.length) return "";

    if (parameters.some((p) => p.status === "Pending")) return "Pending";

    if (parameters.some((p) => p.status === "FAIL")) return "Rejected";

    return "Accepted";
  })();

  /* ================= LOAD ================= */
  const loadDoc = async () => {
    const res = await get(`resource/Quality Inspection/${name}`);
    const d = res.data;

    setDoc({
      template: d.quality_inspection_template,
      item_code: d.item_code,
    });

    const templateRes = await get(
      `resource/Quality Inspection Template/${d.quality_inspection_template}`,
    );

    const templateParams =
      templateRes.data.item_quality_inspection_parameter || [];

    const readingsMap = {};
    (d.readings || []).forEach((r) => {
      readingsMap[r.specification] = r;
    });

    const merged = templateParams.map((t) => {
      const existing = readingsMap[t.specification];

      return {
        parameter: t.specification,
        numeric: t.numeric,
        min_value: t.min_value,
        max_value: t.max_value,
        tolerance: 5, // default %
        values: [
          existing?.reading_1,
          existing?.reading_2,
          existing?.reading_3,
        ].filter((v) => v) || [""],
        status: existing?.status || "Pending",
        avg: 0,
        deviation: 0,
      };
    });

    setParameters(merged);
  };

  /* ================= TEMPLATE LOAD ================= */
  const handleTemplateChange = async (template) => {
    setDoc({ ...doc, template });

    const res = await get(`resource/Quality Inspection Template/${template}`);

    const rows = res.data.item_quality_inspection_parameter || [];

    const mapped = rows.map((r) => ({
      parameter: r.specification,
      numeric: r.numeric,
      min_value: r.min_value,
      max_value: r.max_value,
      tolerance: 5,
      values: [""],
      status: "Pending",
      avg: 0,
      deviation: 0,
    }));

    setParameters(mapped);
  };

  /* ================= SAVE ================= */

  // The Save payload also depends on the computed overall status and the
  // reading rows, which are not part of `doc` -- same staleness problem, so they
  // are read through refs too. Declared here, after `overallStatus` exists, and
  // initialised with no value: reading it in useRef's argument list would
  // evaluate it during render and hit the temporal dead zone.
  const overallStatusRef = useRef(null);
  const parametersRef = useRef([]);

  useEffect(() => {
    overallStatusRef.current = overallStatus;
    parametersRef.current = parameters;
  });

  const handleSave = async () => {
    const current = docRef.current;
    const payload = {
      item_code: current.item_code,
      quality_inspection_template: current.template,
      status: overallStatusRef.current,
      readings: parametersRef.current.map((p) => ({
        specification: p.parameter,
        reading_1: p.values[0] || "",
        reading_2: p.values[1] || "",
        reading_3: p.values[2] || "",
        status: p.status,
      })),
    };

    await saveDocument({
      doctype: "Quality Inspection",
      name: isEdit ? name : undefined,
      doc: payload,
    });

    navigate("/quality/inspection");
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: isEdit
        ? t("quality.inspectionTitle", { name: doc.name || "" })
        : t("quality.newInspection"),

      subtitle: isEdit
        ? t("quality.inspectionEditSubtitle")
        : t("quality.inspectionNewSubtitle"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("quality.inspections"), path: "/quality/inspection" },
        {
          label: isEdit ? doc.name || t("common.edit") : t("common.new"),
        },
      ],

      actions: [
        {
          label: t("common.save"),
          variant: "btn-success",
          onClick: handleSave,
        },

        isEdit &&
          !doc.docstatus && {
            label: t("common.submit"),
            variant: "btn-primary",
            onClick: handleSave,
          },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, doc]);

  /* ================= LOAD EFFECT ================= */
  useEffect(() => {
    if (isEdit) {
      // loadDoc only setStates after awaited API responses.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadDoc();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  /* ================= UI ================= */
  return (
    <div className="mx-auto w-full max-w-[1100px]">
      {/* BASIC */}
      <FormSection
        className="mb-3"
        title={t("quality.basicInfo")}
        icon={ClipboardList}
        contentClassName="grid grid-cols-1 gap-3 md:grid-cols-2"
      >
          <FormField label={t("quality.template")}>
            <LinkField
              doctype="Quality Inspection Template"
              value={doc.template}
              onChange={handleTemplateChange}
              disabled={isEdit}
            />
          </FormField>

          <FormField label={t("quality.item")}>
            <LinkField
              doctype="Item"
              value={doc.item_code}
              onChange={(v) => setDoc({ ...doc, item_code: v })}
            />
          </FormField>
      </FormSection>

      {/* PARAMETERS */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {parameters.map((p, i) => (
          <Card
            key={i}
            className={gridCorners({
              breakpoints: PARAM_BP,
              index: i,
              count: parameters.length,
            })}
          >
            <CardContent className="p-4">
              <div className="text-center font-bold">{p.parameter}</div>

              <div className="mb-2 text-center text-sm text-muted-foreground">
                {t("quality.rangeTolerance", {
                  min: p.min_value,
                  max: p.max_value,
                  tol: p.tolerance,
                })}
              </div>

              {/* INPUTS */}
              {p.values.map((val, vi) => (
                <Input
                  key={vi}
                  className="mb-2 text-center"
                  type="number"
                  value={val}
                  placeholder={t("quality.reading", { n: vi + 1 })}
                  onChange={(e) => updateReading(i, vi, e.target.value)}
                />
              ))}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const updated = [...parameters];
                  updated[i].values.push("");
                  setParameters(updated);
                }}
              >
                + {t("quality.addReading")}
              </Button>

              {/* METRICS */}
              {p.avg > 0 && (
                <div className="mt-3 text-center text-sm">
                  <div>
                    {t("quality.avg")}: <b>{p.avg}</b>
                  </div>
                  <div>
                    {t("quality.dev")}:{" "}
                    <b
                      className={
                        p.deviation > p.tolerance
                          ? "text-destructive"
                          : "text-emerald-600"
                      }
                    >
                      {p.deviation}%
                    </b>
                  </div>
                </div>
              )}

              {/* STATUS */}
              <div className="mt-2 text-center">
                <Badge
                  variant="outline"
                  className={
                    p.status === "PASS"
                      ? "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30"
                      : p.status === "FAIL"
                        ? "bg-destructive/15 text-destructive ring-destructive/30"
                        : "bg-muted text-muted-foreground ring-border"
                  }
                >
                  {p.status === "PASS"
                    ? t("quality.statusPass")
                    : p.status === "FAIL"
                      ? t("quality.statusFail")
                      : t("quality.statusPending")}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* FINAL RESULT */}
      <Card className="mt-3">
        <CardContent className="p-4 text-center">
          <div className="text-sm text-muted-foreground">
            {t("quality.finalResult")}
          </div>
          <div
            className={`text-2xl font-bold ${
              overallStatus === "Accepted"
                ? "text-emerald-600"
                : overallStatus === "Rejected"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {overallStatus === "Accepted"
              ? t("quality.statusAccepted")
              : overallStatus === "Rejected"
                ? t("quality.statusRejected")
                : t("quality.statusPending")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
