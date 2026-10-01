import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import AppModal from "../../AppModal";
import { get } from "../../../services/api";
import FormSelect from "../../FormSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export default function SourceModal({ show, onClose, loadSource }) {
  const { t } = useTranslation();
  const [sourceType, setSourceType] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [qcDone, setQcDone] = useState(false);
  const [documents, setDocuments] = useState([]);

  const searchTimeout = useRef(null);

  const SOURCE_TYPES = [
    { label: t("store.source.materialRequest"), value: "Material Request" },
    { label: t("store.source.purchaseReceipt"), value: "Purchase Receipt" },
    { label: t("store.source.bom"), value: "BOM" },
    { label: t("store.source.purchaseInvoice"), value: "Purchase Invoice" },
    { label: t("store.source.itemMaster"), value: "Item" },
  ];

  const resetData = () => {
    setSourceType("");
    setSourceId("");
    setQcDone(false);
    setDocuments([]);
  };

  const getSourceDocuments = async (doctype) => {
    const res = await get(`resource/${doctype}`, {
      fields: JSON.stringify(["name"]),
      limit_page_length: 20,
    });

    return res.data || [];
  };

  const fetchSourceItems = async (doctype, name) => {
    const res = await get(`resource/${doctype}/${name}`);
    return res.data;
  };

  const mapItems = (doctype, doc, qcFilter) => {
    let items = [];

    if (doctype === "Material Request") {
      items = doc.items;
    }

    if (doctype === "Purchase Receipt") {
      items = doc.items.filter((i) =>
        qcFilter ? i.quality_inspection : true,
      );
    }

    if (doctype === "BOM") {
      items = doc.items;
    }

    if (doctype === "Item") {
      items = [
        {
          item_code: doc.name,
          qty: 1,
          uom: doc.stock_uom,
          item_name: doc.item_name,
        },
      ];
    }

    return items.map((i) => ({
      code: i.item_code,
      name: i.item_name,

      qty: i.qty,
      uom: i.uom,
      stockUOM: i.stock_uom,

      conversionFactor: i.conversion_factor,

      // default (will expand later)
      uomOptions: [i.uom],
    }));
  };

  const enrichWithUOM = async (items) => {
    return Promise.all(
      items.map(async (item) => {
        const res = await get(`resource/Item/${item.code}`);
        const doc = res.data;

        const uomOptions = (doc.uoms || []).map((u) => u.uom);

        return {
          ...item,
          uomOptions: uomOptions.length > 0 ? uomOptions : [item.uom],
        };
      }),
    );
  };

  const handleLoad = async () => {
    const doc = await fetchSourceItems(sourceType, sourceId);

    let items = mapItems(sourceType, doc);

    // enrich UOM options
    items = await enrichWithUOM(items);

    loadSource(items, sourceType);
    resetData();
    onClose();
  };

  const handleSearch = (value) => {
    setSourceId(value);

    if (!value || value.length < 2) {
      setDocuments([]);
      return;
    }

    clearTimeout(searchTimeout.current);

    searchTimeout.current = setTimeout(async () => {
      const args = {
        doctype: sourceType,
        txt: value,
        page_length: 10,
      };

      if (
        sourceType === "Purchase Receipt" ||
        sourceType === "Purchase Invoice"
      ) {
        args.filters = JSON.stringify([["docstatus", "=", 1]]);
      }

      if (sourceType === "Material Request") {
        args.filters = JSON.stringify([
          ["docstatus", "=", 1],
          ["material_request_type", "!=", "Purchase"],
        ]);
      }

      if (sourceType === "BOM") {
        args.filters = JSON.stringify([["is_active", "=", 1]]);
      }
      if (sourceType === "Item") {
        const res = await get("resource/Item", {
          filters: JSON.stringify([
            ["disabled", "=", 0],
            ["has_variants", "=", 0],
            ["item_name", "like", `%${value}%`],
          ]),
          fields: JSON.stringify(["name", "item_name"]),
          limit_page_length: 10,
        });

        setDocuments(
          res.data.map((d) => ({
            value: d.name,
            description: d.item_name,
          })),
        );

        return;
      }

      const res = await get("method/frappe.desk.search.search_link", args);

      setDocuments(res.message || []);
    }, 300);
  };

  const handleFocus = async () => {
    if (!sourceType) return;

    const args = {
      doctype: sourceType,
      txt: "",
      page_length: 10,
    };

    if (sourceType === "Material Request") {
      args.filters = JSON.stringify([
        ["docstatus", "=", 1],
        ["material_request_type", "!=", "Purchase"],
      ]);
    }

    if (
      sourceType === "Purchase Receipt" ||
      sourceType === "Purchase Invoice"
    ) {
      args.filters = JSON.stringify([["docstatus", "=", 1]]);
    }

    if (sourceType === "BOM") {
      args.filters = JSON.stringify([["is_active", "=", 1]]);
    }

    const res = await get("method/frappe.desk.search.search_link", args);

    setDocuments(res.message || []);
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
          <Button disabled={!sourceType || !sourceId} onClick={handleLoad}>
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
            onChange={async (type) => {
              setSourceType(type);
              setSourceId("");

              if (type) {
                const docs = await getSourceDocuments(type);
                setDocuments(docs);
              }
            }}
            placeholder={t("store.source.selectSourceType")}
            options={SOURCE_TYPES.map((sourceTypeOption) => ({
              value: sourceTypeOption.value,
              label: sourceTypeOption.label,
            }))}
          />
        </div>

        {/* DOCUMENT */}
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
            onFocus={handleFocus}
          />

          {documents.length > 0 && (
            <div className="absolute start-0 end-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
              {documents.map((doc) => (
                <button
                  key={doc.value}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-start transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setSourceId(doc.value);
                    setDocuments([]);
                  }}
                >
                  {/* ICON */}
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

                  {/* CONTENT */}
                  <div className="min-w-0 flex-grow">
                    <div className="truncate text-sm font-semibold">
                      {doc.value}
                    </div>

                    <div
                      className="line-clamp-2 text-xs text-muted-foreground"
                      title={doc.description}
                    >
                      {doc.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* QC */}
        <div className="flex items-center gap-2">
          <Checkbox
            id="qcDone"
            checked={qcDone}
            onCheckedChange={(checked) => setQcDone(checked === true)}
          />
          <label
            htmlFor="qcDone"
            className="text-sm font-medium text-foreground"
          >
            {t("store.source.onlyQcPassed")}
          </label>
        </div>
      </div>
    </AppModal>
  );
}
