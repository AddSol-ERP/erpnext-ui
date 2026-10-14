import { useTranslation } from "react-i18next";
import AppModal from "../../../../components/AppModal";
import { Button } from "@/components/ui/button";
import ReceiptLineForm from "./ReceiptLineForm";

/**
 * Edit a line the receipt TRAY has already accepted.
 *
 * This is the only remaining dialog for a receipt line, and it is not stacked on
 * anything: adding a line used to open this on top of the picker's dialog, so the
 * user had to dismiss two overlays to get back to the receipt, and on a phone the
 * picker underneath stayed fully rendered behind it. Picking now happens inline in
 * `ReceiptItemWorkbench` -- list and form as two sections of one surface -- and
 * this is reached only by editing a row that is already on the receipt, which has
 * no picker to sit behind.
 *
 * The fields live in `ReceiptLineForm`, shared with the workbench so the two
 * entry points cannot drift.
 */
export default function ReceiptLineDialog({
  show,
  onClose,
  onSave,
  row,
  info,
  uomError,
  rateEditable,
  onItemChange,
}) {
  const { t } = useTranslation();

  return (
    <AppModal
      show={show}
      onClose={onClose}
      width="md"
      title={row?.item_code || ""}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onClose}>{t("common.done")}</Button>
        </>
      }
    >
      <div className="px-5 py-4">
        <ReceiptLineForm
          row={row}
          info={info}
          uomError={uomError}
          rateEditable={rateEditable}
          onItemChange={onItemChange}
          onSave={onSave}
        />
      </div>
    </AppModal>
  );
}