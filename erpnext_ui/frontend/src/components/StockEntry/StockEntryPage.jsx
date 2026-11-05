import DirectIssueItems from "./components/DirectIssueItems";
import ItemQrScanner from "../ItemQrScanner";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronUp, ChevronDown, PackageOpen } from "lucide-react";
import ItemList from "./components/ItemList";
import { useStockEntry } from "./hooks/useStockEntry";
import WarehouseSelector from "./components/WarehouseSelector";
import { useHeader } from "../../context/HeaderContext";
import { stockPurposeForType } from "../../config/storePurposes";
import StockEntryTypeSelector from "./components/StockEntryTypeSelector";
import GetItemsModal from "./components/GetItemsModal";
import { AttachDialog, RequiredAttachmentDialog } from "@/components/Attachments";
import SubmitModal from "./components/SubmitModal";
import StockFixModal from "./components/StockFixModal";
import { Button } from "@/components/ui/button";
import LinkField from "../LinkField";
import { FormField } from "../FormField";
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

export default function StockEntryPage({ directIssue = false }) {
  const stock = useStockEntry({ directIssue });
  const [initialAttachment, setInitialAttachment] = useState(null);
  const [showInitialAttachment, setShowInitialAttachment] = useState(false);
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  // The dialog offers different sources depending on what the entry is for.
  // Shared with the hook, so the dialog's source list and the saved payload can
  // never disagree about which purpose is selected.
  const purpose = useMemo(
    () => stockPurposeForType(stock.selectedType),
    [stock.selectedType],
  );

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
      title: t(directIssue ? "store.directIssue.title" : "store.entry.title"),
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
          disabled: !stock.canAddItems || !stock.selectedType,
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
          // `canSubmit` existed on the hook and was never read, so Submit used
          // to open a dialog on an empty entry.
          disabled: !stock.canSubmit || !stock.selectedType,
        },
        !stock.attachTarget && {
          label: t("attachments.open"),
          variant: "btn-outline-primary",
          onClick: () => setShowInitialAttachment(true),
        },
        // Re-open the attach dialog after a submit, while the submitted entry's
        // name is still held in `attachTarget`. Without this, dismissing the
        // post-submit dialog left no way back to the files -- the Stock Entry
        // page has no edit mode, so the dialog was the only surface.
        stock.attachTarget && {
          label: t("attachments.open"),
          variant: "btn-outline-primary",
          onClick: () => stock.setShowAttach(true),
        },
      ].filter(Boolean),
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    stock.selectedType,
    stock.fromWarehouse,
    stock.toWarehouse,
    stock.items.length,
    stock.canSubmit,
    stock.attachTarget,
    stock.requestedUser,
    directIssue,
  ]);

  const selectedTypeLabel = stock.selectedType
    ? t(
        ENTRY_TYPE_LABEL_KEYS[stock.selectedType] ||
          "store.entry.selectEntryType",
      )
    : "";

  return (
    <>
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
        onSubmit={() => stock.submit(initialAttachment)}
        project={stock.project}
        setProject={stock.setProject}
        workOrder={stock.workOrder}
        setWorkOrder={stock.setWorkOrder}
      />
      <RequiredAttachmentDialog
        show={showInitialAttachment}
        onClose={() => setShowInitialAttachment(false)}
        doctype="Stock Entry"
        value={initialAttachment}
        onChange={setInitialAttachment}
        events={["save", "submit"]}
      />
      {/* Keyed on show + purpose: remounts the dialog so it opens with the
          right source options and no leftover state from a previous attempt. */}
      <GetItemsModal
        key={`${stock.showSource}-${stock.selectedType}`}
        show={stock.showSource}
        onClose={stock.closeSource}
        purpose={purpose}
        loadMappedDocument={stock.loadMappedDocument}
        addItemByCode={stock.addItemByCode}
      />

      {directIssue && <p className="mb-3 text-sm text-muted-foreground">{t("store.directIssue.scanHint")}</p>}

      <div className={directIssue ? "grid grid-cols-1 items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]" : ""}>
      {/* SETUP */}
      {stock.showSetup ? (
        <div className="mb-2 rounded-none bg-card p-4 ring-1 ring-foreground/10">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="text-xs font-semibold text-muted-foreground">
              {t(directIssue ? "store.directIssue.globalDetails" : "store.entry.basicConfig")}
            </div>
            {/* Show Compact only if items exist */}
            {stock.items.length > 0 && !directIssue && (
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

          <div className={directIssue ? "grid grid-cols-1 gap-3 pt-3" : "grid grid-cols-1 gap-3 pt-3 md:grid-cols-2"}>
            {!directIssue && <StockEntryTypeSelector
              types={stock.entryTypes}
              selectedType={stock.selectedType}
              setSelectedType={stock.setSelectedType}
            />}

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

            {directIssue ? <FormField label={t("store.entry.fromWarehouse")} required>
              <LinkField doctype="Warehouse" value={stock.fromWarehouse} onChange={stock.setFromWarehouse} filters={{ is_group: 0 }} />
            </FormField> : <WarehouseSelector {...stock} />}
            {directIssue && <>
              <FormField label={t("store.labels.project")}>
                <LinkField doctype="Project" value={stock.project} onChange={stock.setProject} />
              </FormField>
              <FormField label={t("store.directIssue.requestedUser")}>
                <LinkField doctype="User" value={stock.requestedUser} onChange={stock.setRequestedUser} filters={{ enabled: 1 }} />
              </FormField>
            </>}
            <FormField label={t("store.labels.workOrder")}>
              <LinkField doctype="Work Order" value={stock.workOrder} onChange={stock.setWorkOrder} />
            </FormField>
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
          <div className="text-xs font-semibold text-muted-foreground">
            {t("store.entry.items")}
          </div>
          {purpose === "issue" && <div className="flex flex-wrap items-center gap-2">
            {!stock.fromWarehouse && <span className="text-xs text-muted-foreground">{t("qr.chooseWarehouse")}</span>}
            <ItemQrScanner disabled={!stock.fromWarehouse} onScan={stock.addScannedItem} />
          </div>}
        </div>

        {directIssue ? <DirectIssueItems stock={stock} /> : <ItemList
          items={stock.items}
          updateQty={stock.updateQty}
          removeItem={stock.removeItem}
          updateUOM={stock.updateUOM}
        />}
        <div className="sticky bottom-0 z-10 -mx-4 mt-3 flex justify-end gap-2 bg-card/95 px-4 py-2 backdrop-blur">
          {directIssue && <Button disabled={!stock.canSubmit} onClick={stock.openSubmitModal}>{t("store.directIssue.issue")}</Button>}
          <Button
            variant="outline"
            size="sm"
            onClick={() => stock.setShowSource(true)}
            disabled={!stock.canAddItems || !stock.selectedType}
          >
            <PackageOpen />
            {t("store.entry.actions.getItems")}
          </Button>
        </div>
      </div>
    </div>

      </div>

      {/* Attach step, opened after the entry has been saved AND submitted --
          this flow has no draft stage to hang a file from. Browse mode: the
          footer is a single Done and closing it only closes it -- the entry is
          already submitted. The header Attach action reopens this while
          `attachTarget` is held. */}
      <AttachDialog
        show={stock.showAttach}
        doctype="Stock Entry"
        docname={stock.attachTarget || ""}
        readOnly
        onClose={() => stock.setShowAttach(false)}
      />
    </>
  );
}
