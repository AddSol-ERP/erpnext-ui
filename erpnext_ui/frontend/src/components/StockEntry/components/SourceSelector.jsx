import { useState } from "react";
import { useTranslation } from "react-i18next";
import FormSelect from "../../FormSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export default function SourceSelector({ loadSource }) {
  const { t } = useTranslation();
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [qcDone, setQcDone] = useState(false);

  const options = {
    mr: ["MR-001", "MR-002"],
    bom: ["BOM-001"],
    pr: ["PR-001"],
  };

  return (
    <div className="rounded-none bg-card p-3 ring-1 ring-foreground/10">
      <div className="grid grid-cols-2 items-end gap-2 md:grid-cols-4">
        {/* SOURCE TYPE */}
        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
          <FormSelect
            aria-label={t("store.source.sourceType")}
            value={sourceType}
            onChange={(v) => {
              setSourceType(v);
              setSourceId("");
            }}
            placeholder={t("store.source.sourceType")}
            options={[
              ["mr", t("store.source.materialRequest")],
              ["bom", t("store.source.bomShort")],
              ["pr", t("store.source.purchaseReceipt")],
            ]}
          />
        </div>

        {/* DOCUMENT */}
        <div className="col-span-2 flex flex-col gap-1.5 md:col-span-1">
          <FormSelect
            aria-label={t("store.source.selectDocument")}
            value={sourceId}
            onChange={setSourceId}
            disabled={!sourceType}
            placeholder={
              sourceType
                ? t("store.source.selectDocument")
                : t("store.source.selectTypeFirst")
            }
            options={(options[sourceType] || []).map((id) => ({
              value: id,
              label: id,
            }))}
          />
        </div>

        {/* QC TOGGLE */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="qcDoneSelector"
            checked={qcDone}
            onCheckedChange={(checked) => setQcDone(checked === true)}
          />
          <label
            htmlFor="qcDoneSelector"
            className="text-sm font-medium text-foreground"
          >
            {t("store.source.qcDone")}
          </label>
        </div>

        {/* LOAD */}
        <div>
          <Button
            variant="outline"
            className="w-full"
            disabled={!sourceType || !sourceId}
            onClick={() =>
              loadSource(sourceType, sourceId, { qc_done: qcDone })
            }
          >
            {t("store.source.load")}
          </Button>
        </div>
      </div>
    </div>
  );
}
