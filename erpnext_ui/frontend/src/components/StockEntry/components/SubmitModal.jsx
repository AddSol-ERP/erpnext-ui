import { useTranslation } from "react-i18next";
import AppModal from "../../AppModal";
import LinkField from "../../LinkField";
import { Button } from "@/components/ui/button";
import { FormField } from "../../FormField";

export default function SubmitModal({
  show,
  onClose,
  onSubmit,
  project,
  setProject,
  workOrder,
  setWorkOrder,
}) {
  const { t } = useTranslation();

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("store.submitModal.title")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSubmit}>{t("common.submit")}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormField label={t("store.submitModal.project")}>
          <LinkField
            doctype="Project"
            value={project}
            onChange={setProject}
            placeholder={t("store.submitModal.searchProject")}
          />
        </FormField>

        <FormField label={t("store.submitModal.workOrder")}>
          <LinkField
            doctype="Work Order"
            value={workOrder}
            onChange={setWorkOrder}
            placeholder={t("store.submitModal.searchWorkOrder")}
          />
        </FormField>
      </div>
    </AppModal>
  );
}
