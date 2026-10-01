import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

export default function ReadonlyField({ field, value }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <Input
        type="text"
        className="bg-muted/50"
        id={field.fieldname}
        value={value || ""}
        readOnly
        disabled
        tabIndex={-1}
      />
      <p className="text-xs text-muted-foreground">
        {field.fieldname === "name"
          ? t("common.systemGeneratedId")
          : t("common.readOnlyField")}
      </p>
    </div>
  );
}
