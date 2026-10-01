import { useTranslation } from "react-i18next";
import FormSelect from "../../FormSelect";
import { FormField } from "../../FormField";

const ENTRY_TYPE_LABEL_KEYS = {
  "Material Issue": "store.entryTypes.materialIssue",
  "Material Receipt": "store.entryTypes.materialReceipt",
  "Material Transfer": "store.entryTypes.materialTransfer",
  Manufacture: "store.entryTypes.manufacture",
  Repack: "store.entryTypes.repack",
  Disassemble: "store.entryTypes.disassemble",
  "Send to Subcontractor": "store.entryTypes.sendToSubcontractor",
  "Material Transfer for Manufacture":
    "store.entryTypes.materialTransferForMfg",
  "Material Consumption for Manufacture":
    "store.entryTypes.materialConsumptionForMfg",
};

export default function StockEntryTypeSelector({
  types,
  selectedType,
  setSelectedType,
}) {
  const { t } = useTranslation();

  if (!types?.length) return null;

  return (
    <FormField
      label={t("store.entry.entryType")}
      name="entry_type"
      htmlFor="stock-entry-type"
    >
      <FormSelect
        id="stock-entry-type"
        value={selectedType}
        onChange={setSelectedType}
        placeholder={t("store.entry.selectEntryType")}
        options={types.map((entryType) => ({
          value: entryType.name,
          label: ENTRY_TYPE_LABEL_KEYS[entryType.name]
            ? t(ENTRY_TYPE_LABEL_KEYS[entryType.name])
            : entryType.name,
        }))}
      />
    </FormField>
  );
}
