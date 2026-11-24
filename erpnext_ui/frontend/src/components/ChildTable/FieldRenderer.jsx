import LinkField from "../LinkField";
import FormSelect from "../FormSelect";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { uploadFile } from "../../services/api";
import { useTranslation } from "react-i18next";

function FieldRenderer({ type, value, options, onChange, id, disabled = false, attachmentDoctype, attachmentDocname, attachmentField }) {
  const [uploading, setUploading] = useState(false);
  const { t } = useTranslation();
  switch (type) {
    case "attach":
      return <div className="space-y-2">
        {/^\/(?:private\/)?files\//.test(value || "") && <a href={value} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-primary underline">{value.split("/").pop()}</a>}
        {!disabled && <Input type="file" disabled={uploading} aria-label={attachmentField} onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          setUploading(true);
          try {
            const body = new FormData();
            body.append("file", file);
            body.append("is_private", "1");
            if (attachmentDoctype && attachmentDocname) {
              body.append("doctype", attachmentDoctype);
              body.append("docname", attachmentDocname);
              body.append("fieldname", attachmentField);
            }
            const response = await uploadFile("method/upload_file", body);
            if (!response.message?.file_url) throw new Error(t("common.error"));
            onChange(response.message.file_url);
          } catch (error) {
            toast.error(error.message);
          } finally {
            setUploading(false);
            event.target.value = "";
          }
        }} />}
        {!disabled && value && <button type="button" className="text-xs text-destructive underline" onClick={() => onChange("")}>{t("common.remove", { defaultValue: "Remove" })}</button>}
      </div>;
    case "number":
      return (
        <Input
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );

    case "select": {
      const opts = typeof options === "string" ? options.split("\n") : [];
      return (
        <FormSelect
          value={value ?? ""}
          onChange={onChange}
          placeholder="—"
          options={opts.map((o) => ({ value: o, label: o }))}
          disabled={disabled}
        />
      );
    }

    case "checkbox":
      return (
        <div className="flex items-center">
          <input
            type="checkbox"
            id={id}
            className="size-4 shrink-0 accent-[var(--brand-primary)]"
            checked={Number(value) === 1}
            onChange={(e) => onChange(e.target.checked ? 1 : 0)}
            disabled={disabled}
          />
        </div>
      );

    case "link":
      return (
        <LinkField
          doctype={options}
          value={value}
          onChange={onChange}
          placeholder="…"
          disabled={disabled}
        />
      );

    default:
      return (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );
  }
}

export default FieldRenderer;
