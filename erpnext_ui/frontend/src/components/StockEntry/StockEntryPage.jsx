import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, PackageOpen } from "lucide-react";
import ItemList from "./components/ItemList";
import { useStockEntry } from "./hooks/useStockEntry";
import WarehouseSelector from "./components/WarehouseSelector";
import { useHeader } from "../../context/HeaderContext";
import StockEntryTypeSelector from "./components/StockEntryTypeSelector";
import SourceModal from "./components/SourceModal";
import SubmitModal from "./components/SubmitModal";
import StockFixModal from "./components/StockFixModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ENTRY_TYPE_LABEL_KEYS = {
  "Material Issue": "store.entryTypes.materialIssue",
  "Material Receipt": "store.entryTypes.materialReceipt",
  "Material Transfer": "store.entryTypes.materialTransfer",
  Manufacture: "store.entryTypes.manufacture",
  Repack: "store.entryTypes.repack",
  Disassemble: "store.entryTypes.disassemble",
  "Send to Subcontractor": "store.entryTypes.sendToSubcontractor",
  "Material Transfer for Manufacture":
    "store.entryTypes.materialTransferForMfg",
  "Material Consumption for Manufacture":
    "store.entryTypes.materialConsumptionForMfg",
};

export default function StockEntryPage() {
  const stock = useStockEntry();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  useEffect(() => {
    let subtitle = t("store.entry.subtitleDefault");

    const type = stock.selectedType;
    const from = stock.fromWarehouse;
    const to = stock.toWarehouse;

    const selectWarehouse = t("store.entry.selectWarehouse");

    if (type === "Material Receipt") {
      subtitle = t("store.entry.subtitleReceipt", {
        warehouse: to || selectWarehouse,
      });
    }

    if (type === "Material Issue") {
      subtitle = t("store.entry.subtitleIssue", {
        warehouse: from || selectWarehouse,
      });
    }

    if (type === "Material Transfer") {
      subtitle = t("store.entry.subtitleTransfer", {
        from: from || t("store.entry.from"),
        to: to || t("store.entry.to"),
      });
    }

    if (type === "Material Transfer for Manufacture") {
      subtitle = t("store.entry.subtitleTransferMfg", {
        from: from || t("store.entry.from"),
        to: to || t("store.entry.to"),
      });
    }

    if (type === "Manufacture") {
      subtitle = t("store.entry.subtitleManufacture", {
        warehouse: to || selectWarehouse,
      });
    }

    if (type === "Repack") {
      subtitle = t("store.entry.subtitleRepack", {
        warehouse: to || selectWarehouse,
      });
    }

    if (type === "Material Consumption for Manufacture") {
      subtitle = t("store.entry.subtitleConsume", {
        warehouse: from || selectWarehouse,
      });
    }

    setHeader({
      title: t("store.entry.title"),
      subtitle: subtitle || t("store.tiles.stockEntry.description"),

      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.entry.title") },
      ],

      actions: [
        {
          label: t("store.entry.actions.getItems"),
          variant: "btn-outline-primary",
          onClick: () => stock.setShowSource(true),
          disabled: !stock.canAddItems,
        },
        {
          label: t("store.entry.actions.clear"),
          variant: "btn-outline-primary",
          onClick: () => stock.setItems([]),
        },
        {
          label: t("common.submit"),
          variant: "btn-primary",
          onClick: stock.openSubmitModal,
        },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stock.selectedType,
    stock.fromWarehouse,
    stock.toWarehouse,
    stock.items.length,
  ]);

  const selectedTypeLabel = stock.selectedType
    ? t(
        ENTRY_TYPE_LABEL_KEYS[stock.selectedType] ||
          "store.entry.selectEntryType",
      )
    : "";

  return (
    <div className="mx-auto w-full max-w-[1600px] pt-4">
      <StockFixModal
        show={stock.showFixModal}
        onClose={() => stock.setShowFixModal(false)}
        invalidItems={stock.invalidItems}
        onRemove={stock.removeInvalidItems}
        onAdjust={stock.adjustToAvailable}
      />
      <SubmitModal
        show={stock.showSubmit}
        onClose={stock.closeSubmitModal}
        onSubmit={stock.submit}
        project={stock.project}
        setProject={stock.setProject}
        workOrder={stock.workOrder}
        setWorkOrder={stock.setWorkOrder}
      />
      <SourceModal
        show={stock.showSource}
        onClose={stock.closeSource}
        loadSource={stock.loadSource}
      />

      {/* SETUP */}
      {stock.showSetup ? (
        <div className="mb-2 rounded-none bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="text-xs font-semibold text-muted-foreground">
              {t("store.entry.basicConfig")}
            </div>
            {/* Show Compact only if items exist */}
            {stock.items.length > 0 && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={stock.compactSetup}
                title={t("store.entry.collapse")}
                aria-label={t("store.entry.collapse")}
              >
                <ChevronUp />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 pt-3 md:grid-cols-2">
            <StockEntryTypeSelector
              types={stock.entryTypes}
              selectedType={stock.selectedType}
              setSelectedType={stock.setSelectedType}
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="stock-entry-date"
                  className="text-xs font-medium text-foreground"
                >
                  {t("store.entry.entryDate")}
                </label>
                <Input
                  id="stock-entry-date"
                  type="date"
                  value={stock.postingDate}
                  onChange={(e) => stock.setPostingDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="stock-entry-time"
                  className="text-xs font-medium text-foreground"
                >
                  {t("store.entry.entryTime")}
                </label>
                <Input
                  id="stock-entry-time"
                  type="time"
                  value={stock.postingTime}
                  onChange={(e) => stock.setPostingTime(e.target.value)}
                />
              </div>
            </div>

            <WarehouseSelector {...stock} />
          </div>
        </div>
      ) : (
        /* COMPACT BAR */
        <div className="mb-2 flex items-center justify-between gap-2 rounded-none bg-card px-4 py-3 ring-1 ring-foreground/10">
          <div className="truncate text-sm">
            <strong>{selectedTypeLabel}</strong>
            <span className="mx-1 opacity-60">→</span>
            {stock.fromWarehouse || "-"}
            <span className="mx-1 opacity-60">→</span>
            {stock.toWarehouse || "-"}
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={stock.expandSetup}
            title={t("store.entry.expand")}
            aria-label={t("store.entry.expand")}
          >
            <ChevronDown />
          </Button>
        </div>
      )}

      {/* ITEMS */}
      <div className="rounded-none bg-card p-4 ring-1 ring-foreground/10">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          {/* LEFT */}
          <div className="text-xs font-semibold text-muted-foreground">
            {t("store.entry.items")}
          </div>

          {/* RIGHT ACTIONS */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => stock.setShowSource(true)}
            disabled={!stock.canAddItems}
          >
            <PackageOpen />
            {t("store.entry.get")}
          </Button>
        </div>

        <ItemList
          items={stock.items}
          updateQty={stock.updateQty}
          removeItem={stock.removeItem}
          updateUOM={stock.updateUOM}
        />
      </div>
    </div>
  );
}
