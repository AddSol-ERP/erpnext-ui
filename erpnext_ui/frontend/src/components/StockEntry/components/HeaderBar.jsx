import { useTranslation } from "react-i18next";
import FormSelect from "../../FormSelect";
import { Input } from "@/components/ui/input";

export default function HeaderBar({
  scan,
  setScan,
  handleScan,
  mode,
  setMode,
}) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2">
      <Input
        placeholder={t("store.entry.scanPlaceholder")}
        value={scan}
        onChange={(e) => setScan(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleScan(scan);
          }
        }}
        autoFocus
      />

      <FormSelect
        className="h-8 w-36 shrink-0"
        value={mode}
        onChange={setMode}
        options={[
          ["incoming", t("store.entry.modes.incoming")],
          ["outgoing", t("store.entry.modes.outgoing")],
          ["transfer", t("store.entry.modes.transfer")],
          ["adjustment", t("store.entry.modes.adjustment")],
        ]}
      />
    </div>
  );
}
