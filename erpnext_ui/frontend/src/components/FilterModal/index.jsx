import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AppModal from "../AppModal";
import { Button } from "@/components/ui/button";
import FilterFields from "./FilterFields";

/**
 * Full-screen/modal filter dialog (reports + non-toolbar surfaces).
 * List pages use ActionBar-owned Popover/Sheet instead.
 */
export default function FilterModal({
  show,
  onClose,
  config,
  onApply,
  initialFilters = {},
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState(initialFilters || {});

  // Sync local values when the modal reopens or callers change filters
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(initialFilters || {});
  }, [initialFilters, show]);

  const clearAll = () => {
    setValues({});
  };

  return (
    <AppModal
      show={show}
      onClose={onClose}
      title={t("common.filters")}
      width="lg"
      footer={
        <>
          <Button variant="outline" onClick={clearAll}>
            {t("common.clear")}
          </Button>

          <Button
            onClick={() => {
              onApply(values);
              onClose();
            }}
          >
            {t("common.apply")}
          </Button>
        </>
      }
    >
      <FilterFields
        config={config}
        values={values}
        onValuesChange={setValues}
        className="md:grid-cols-2"
      />
    </AppModal>
  );
}
