import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "../FormField";
import FormSelect from "../FormSelect";
import LinkField from "../LinkField";

export default function OperationApprovals({ operation, operations, rules, onChange, disabled, embedded = false }) {
  const { t } = useTranslation();
  const matches = rules.map((rule, index) => ({ rule, index })).filter(({ rule }) =>
    operation.name && rule.operation_row ? rule.operation_row === operation.name :
      !rule.operation_row && rule.operation === operation.operation,
  );
  const ambiguous = !operation.name && operations.filter((row) => row.operation === operation.operation).length > 1;
  const patch = (index, changes) => onChange(rules.map((rule, i) => i === index ? { ...rule, ...changes } : rule));
  const add = () => onChange([...rules, { operation: operation.operation, operation_row: operation.name || "", approval_point: "", perspective: "", instruction: "", approval_role: "", note: "", attachment_required: 0 }]);
  return <section className={embedded ? "space-y-3" : "mt-4 space-y-3 border-t border-border pt-4"}>
    <div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">{t("production.operationApprovals")}</h3><p className="text-xs text-muted-foreground">{t("production.operationApprovalsHelp")}</p></div>
      {!disabled && <Button type="button" size="sm" variant="outline" disabled={!operation.operation || ambiguous} onClick={add}><Plus />{t("production.addApprovalRule")}</Button>}</div>
    {ambiguous && <p role="alert" className="text-xs text-muted-foreground">{t("production.saveRepeatedOperations")}</p>}
    {operation.custom_approval_stage && <div role="note" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs"><strong>{t("production.existingLegacyApproval")}</strong>: {operation.custom_approval_stage} · {operation.custom_approval_role} · {operation.custom_approval_reason}</div>}
    {!matches.length && <p className="text-xs text-muted-foreground">{t("production.noApprovalRules")}</p>}
    {matches.map(({ rule, index }, position) => <div key={rule.name || index} className="space-y-2 rounded-md border border-border p-3">
      <div className="flex justify-between text-xs font-medium"><span>{t("production.approvalRuleNumber", { number: position + 1 })}</span>{!disabled && <Button type="button" size="icon" variant="ghost" aria-label={t("production.removeApprovalRule")} onClick={() => onChange(rules.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("production.approvalPoint")} required><FormSelect value={rule.approval_point || ""} disabled={disabled} options={["Before Start", "After Work"]} onChange={(value) => patch(index, { approval_point: value, instruction: "", instruction_snapshot: "" })} /></FormField>
        <FormField label={t("production.approvalPerspective")} required><LinkField doctype="UI Operation Approval Perspective" filters={{ enabled: 1 }} value={rule.perspective || ""} disabled={disabled} onChange={(value) => patch(index, { perspective: value, instruction: "", instruction_snapshot: "" })} /></FormField>
        <FormField label={t("production.approvalInstruction")} required><LinkField doctype="UI Operation Approval Instruction" filters={{ enabled: 1, ...(rule.perspective ? { perspective: rule.perspective } : {}), ...(rule.approval_point ? { approval_point: rule.approval_point } : {}) }} value={rule.instruction || ""} disabled={disabled} onChange={(value) => patch(index, { instruction: value })} /></FormField>
        <FormField label={t("production.approvalRole")} required><LinkField doctype="Role" value={rule.approval_role || ""} disabled={disabled} onChange={(value) => patch(index, { approval_role: value })} /></FormField>
        <FormField label={t("production.approvalNote")}><Input value={rule.note || ""} disabled={disabled} onChange={(event) => patch(index, { note: event.target.value })} /></FormField>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Number(rule.attachment_required) === 1} disabled={disabled} onChange={(event) => patch(index, { attachment_required: event.target.checked ? 1 : 0 })} />{t("production.approvalAttachmentRequired")}</label>
      </div>
    </div>)}
  </section>;
}
