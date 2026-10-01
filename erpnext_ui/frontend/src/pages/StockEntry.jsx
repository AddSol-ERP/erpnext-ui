import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import { useHeader } from "../context/HeaderContext";
import { FormField } from "../components/FormField";
import FormSelect from "../components/FormSelect";
import ChildTable from "../components/ChildTable";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export default function DemoForm() {
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    name: "",
    age: "",
    salary: "",
    description: "",
    date: "",
    datetime: "",
    time: "",
    status: "Open",
    active: false,
    department: "",
    attachment: null,
  });
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    setHeader({
      title: t("store.demo.title"),
      subtitle: t("store.demo.subtitle"),
      actions: [
        {
          label: t("common.save"),
          onClick: () => console.log(form),
        },
      ],
    });

    return () => setHeader({ title: "", subtitle: "", actions: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const getResouse = async () => {
    console.log("asdhajkshdj");
    // let res = await get(`resource/Work Order`);
    // console.log(res, "res");
  };

  useEffect(() => {
    getResouse();
  }, []);

  return (
    <div className="card-stack mx-auto flex w-full max-w-[1600px] flex-col gap-4 pt-4">
      {/* BASIC */}
      <div className="rounded-none bg-card p-4 ring-1 ring-foreground/10">
        <div className="mb-3 text-sm font-semibold">
          {t("store.demo.sections.basic")}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField label={t("common.name")} required>
            <Input
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
            />
          </FormField>

          <FormField label={t("store.demo.age")}>
            <Input
              type="number"
              value={form.age}
              onChange={(e) => handleChange("age", e.target.value)}
            />
          </FormField>

          <FormField label={t("store.demo.salary")}>
            <Input
              type="number"
              value={form.salary}
              onChange={(e) => handleChange("salary", e.target.value)}
            />
          </FormField>
        </div>
      </div>

      {/* TEXT */}
      <div className="rounded-none bg-card p-4 ring-1 ring-foreground/10">
        <div className="mb-3 text-sm font-semibold">
          {t("store.demo.sections.text")}
        </div>

        <FormField label={t("store.demo.description")}>
          <Textarea
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
          />
        </FormField>
      </div>

      {/* DATE */}
      <div className="rounded-none bg-card p-4 ring-1 ring-foreground/10">
        <div className="mb-3 text-sm font-semibold">
          {t("store.demo.sections.dateTime")}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField label={t("common.date")}>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />
          </FormField>

          <FormField label={t("store.demo.datetime")}>
            <Input
              type="datetime-local"
              value={form.datetime}
              onChange={(e) => handleChange("datetime", e.target.value)}
            />
          </FormField>

          <FormField label={t("store.demo.time")}>
            <Input
              type="time"
              value={form.time}
              onChange={(e) => handleChange("time", e.target.value)}
            />
          </FormField>
        </div>
      </div>

      {/* SELECT */}
      <div className="rounded-none bg-card p-4 ring-1 ring-foreground/10">
        <div className="mb-3 text-sm font-semibold">
          {t("store.demo.sections.selection")}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField label={t("common.status")}>
            <FormSelect
              value={form.status}
              onChange={(v) => handleChange("status", v)}
              options={[
                ["Open", t("common.open")],
                ["Pending", t("store.demo.pending")],
                ["Closed", t("store.demo.closed")],
              ]}
            />
          </FormField>

          <FormField label={t("store.demo.department")}>
            <Input
              placeholder={t("store.demo.searchDepartment")}
              onChange={(e) => handleChange("department", e.target.value)}
            />
          </FormField>

          <FormField label={t("store.demo.active")}>
            <div className="flex h-8 items-center">
              <Checkbox
                checked={form.active}
                onCheckedChange={(checked) =>
                  handleChange("active", checked === true)
                }
              />
            </div>
          </FormField>
        </div>
      </div>

      {/* FILE */}
      <div className="rounded-none bg-card p-4 ring-1 ring-foreground/10">
        <div className="mb-3 text-sm font-semibold">
          {t("store.demo.sections.attachments")}
        </div>

        <FormField label={t("store.demo.uploadFile")}>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted">
              <input
                type="file"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files[0];
                  setFileName(file?.name || "");
                  handleChange("attachment", file);
                }}
              />

              <Upload className="size-4" />
              {t("store.demo.chooseFile")}
            </label>

            <div className="text-sm text-muted-foreground">
              {fileName || t("store.demo.noFileSelected")}
            </div>
          </div>
        </FormField>
      </div>

      {/* TABLE (SIMPLIFIED DEMO) */}
      <ChildTable
        columns={[
          {
            label: t("store.demo.itemCode"),
            field: "item_code",
            type: "text",
          },
          { label: t("store.form.qty"), field: "qty", type: "number" },
          { label: t("store.demo.rate"), field: "rate", type: "number" },
        ]}
        value={[{ item_code: "ITEM-001", qty: 10, rate: 100 }]}
        onChange={(data) => console.log(data)}
      />
    </div>
  );
}
