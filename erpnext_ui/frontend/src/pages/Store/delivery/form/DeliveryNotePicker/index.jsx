import { useState } from "react";
import { useTranslation } from "react-i18next";
import AppModal from "../../../../../components/AppModal";
import FormSelect from "../../../../../components/FormSelect";
import { get } from "../../../../../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SOURCE_TYPES = [
  { value: "Sales Order", labelKey: "store.source.salesOrder" },
  { value: "Pick List", labelKey: "store.source.pickList" },
];

export default function DeliveryNotePicker({ show, onClose, onLoad }) {
  const { t } = useTranslation();
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [documents, setDocuments] = useState([]);

  /* ================= RESET ================= */
  const resetData = () => {
    setSourceType("");
    setSourceId("");
    setDocuments([]);
  };

  /* ================= SEARCH ================= */
  const handleSearch = async (text) => {
    setSourceId(text);

    if (!sourceType) return;

    try {
      const res = await get(`resource/${sourceType}`, {
        fields: JSON.stringify(["name", "customer"]),
        filters: JSON.stringify([
          ["docstatus", "=", 1],
          ["status", "!=", "Closed"],
        ]),
        or_filters: JSON.stringify([
          ["name", "like", `%${text}%`],
          ["customer", "like", `%${text}%`],
        ]),
        limit_page_length: 10,
      });

      const formatted = (res.data || []).map((doc) => ({
        value: doc.name,
        description: doc.customer,
      }));

      setDocuments(formatted);
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= LOAD ================= */
  const handleLoad = async () => {
    try {
      if (!sourceType || !sourceId) return;

      /* ===== SALES ORDER ===== */
      if (sourceType === "Sales Order") {
        const res = await get(`resource/Sales Order/${sourceId}`);
        const so = res.data;

        const items = (so.items || []).map((i) => ({
          item_code: i.item_code,
          qty: i.qty - (i.delivered_qty || 0),
          uom: i.uom,
          warehouse: i.warehouse,
          against_sales_order: so.name,
          so_detail: i.name,
        }));

        const filtered = items.filter((i) => i.qty > 0);

        onLoad({
          customer: so.customer,
          items: filtered,
        });
      }

      /* ===== PICK LIST (future ready) ===== */
      if (sourceType === "Pick List") {
        const res = await get(`resource/Pick List/${sourceId}`);
        const pl = res.data;

        const items = (pl.locations || []).map((i) => ({
          item_code: i.item_code,
          qty: i.qty,
          uom: i.uom,
          warehouse: i.warehouse,
        }));

        onLoad({
          items,
        });
      }

      onClose();
      resetData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <AppModal
      show={show}
      onClose={() => {
        onClose();
        resetData();
      }}
      title={t("store.source.loadItems")}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onClose();
              resetData();
            }}
          >
            {t("common.cancel")}
          </Button>

          <Button
            disabled={!sourceType || !sourceId}
            onClick={handleLoad}
          >
            {t("store.source.load")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {/* TYPE */}
        <div>
          <FormSelect
            aria-label={t("store.source.sourceType")}
            value={sourceType}
            onChange={(v) => {
              setSourceType(v);
              setSourceId("");
              setDocuments([]);
            }}
            placeholder={t("store.source.selectSourceType")}
            options={SOURCE_TYPES.map((sourceTypeOption) => ({
              value: sourceTypeOption.value,
              label: t(sourceTypeOption.labelKey),
            }))}
          />
        </div>

        {/* DOCUMENT SEARCH */}
        <div className="relative">
          <Input
            type="text"
            value={sourceId}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={
              sourceType
                ? t("store.source.searchDocument")
                : t("store.source.selectTypeFirst")
            }
            disabled={!sourceType}
            onBlur={() => setTimeout(() => setDocuments([]), 200)}
            onFocus={() => handleSearch(sourceId)}
          />

          {documents.length > 0 && (
            <div className="absolute start-0 end-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
              {documents.map((doc) => (
                <button
                  key={doc.value}
                  type="button"
                  className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-start transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setSourceId(doc.value);
                    setDocuments([]);
                  }}
                >
                  <div className="text-sm font-semibold">{doc.value}</div>
                  <div className="text-xs text-muted-foreground">
                    {doc.description || t("store.source.noCustomer")}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppModal>
  );
}
