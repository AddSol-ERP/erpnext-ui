import HeaderBar from "./components/HeaderBar";
import SourceSelector from "./components/SourceSelector";
import ItemList from "./components/ItemList";
import FooterBar from "./components/FooterBar";
import { useStockEntry } from "./hooks/useStockEntry";
import WarehouseSelector from "./components/WarehouseSelector";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import StockEntryTypeSelector from "./components/StockEntryTypeSelector";
import SourceModal from "./components/SourceModal";
import { get } from "../../services/api";
import SubmitModal from "./components/SubmitModal";
import StockFixModal from "./components/StockFixModal";

export default function StockEntryPage() {
  const stock = useStockEntry();

  const { setHeader } = useHeader();

  useEffect(() => {
    let subtitle = "Fast inventory operations";

    const type = stock.selectedType;
    const from = stock.fromWarehouse;
    const to = stock.toWarehouse;

    if (type === "Material Receipt") {
      subtitle = `Incoming → ${to || "Select warehouse"}`;
    }

    if (type === "Material Issue") {
      subtitle = `Outgoing ← ${from || "Select warehouse"}`;
    }

    if (type === "Material Transfer") {
      subtitle = `${from || "From"} → ${to || "To"}`;
    }

    if (type === "Material Transfer for Manufacture") {
      subtitle = `${from || "From"} → ${to || "To"} (MFG)`;
    }

    if (type === "Manufacture") {
      subtitle = `Manufacture @ ${to || "Select warehouse"}`;
    }

    if (type === "Repack") {
      subtitle = `Repack @ ${to || "Select warehouse"}`;
    }

    if (type === "Material Consumption for Manufacture") {
      subtitle = `Consume ← ${from || "Select warehouse"}`;
    }

    setHeader({
      title: "Stock Entry",
      subtitle: subtitle || "Manage stock movement",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Store", path: "/store" },
        { label: "Stock Entry" },
      ],

      actions: [
        {
          label: "Get Items",
          variant: "btn-outline-primary",
          icon: "bi bi-box-arrow-in-down",
          onClick: () => stock.setShowSource(true),
          disabled: !stock.canAddItems,
        },
        {
          label: "Clear",
          variant: "btn-outline-primary",
          icon: "bi bi-x-circle",
          onClick: () => stock.setItems([]),
        },
        {
          label: "Submit",
          variant: "btn-primary",
          icon: "bi bi-check-circle",
          onClick: stock.openSubmitModal,
        },
      ],
    });

    return () => setHeader({});
  }, [
    stock.selectedType,
    stock.fromWarehouse,
    stock.toWarehouse,
    stock.items.length,
  ]);

  return (
    <div className="container-fluid p-0">
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
        <>
          <div className="row mb-2">
            <div className="col-12">
              <div className="action-bar">
                <div className="row">
                  <div className="col-12 d-flex justify-content-between border-bottom pb-2 align-items-center">
                    <div className="fw-semibold text-muted small">
                      Basic Configuration
                    </div>
                    {/* 👉 Show Compact only if items exist */}
                    {stock.items.length > 0 && (
                      <button
                        className="btn btn-sm btn-icon bg-transparent border-0"
                        onClick={stock.compactSetup}
                        title="Collapse"
                      >
                        <i className="bi bi-chevron-up"></i>
                      </button>
                    )}
                  </div>
                  <div className="col-12 col-md-6">
                    <StockEntryTypeSelector
                      types={stock.entryTypes}
                      selectedType={stock.selectedType}
                      setSelectedType={stock.setSelectedType}
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="row">
                      <div className="col-6">
                        <label className="form-label">Entry Date</label>
                        <input
                          type="date"
                          className="form-control"
                          value={stock.postingDate}
                          onChange={(e) => stock.setPostingDate(e.target.value)}
                        />
                      </div>

                      <div className="col-6">
                        <label className="form-label">Entry Time</label>
                        <input
                          type="time"
                          className="form-control"
                          value={stock.postingTime}
                          onChange={(e) => stock.setPostingTime(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <WarehouseSelector {...stock} />
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* COMPACT BAR */}
          <div className="action-bar d-flex justify-content-between align-items-center mb-2">
            <div>
              <strong>{stock.selectedType}</strong> →{" "}
              {stock.fromWarehouse || "-"} → {stock.toWarehouse || "-"}
            </div>

            <button
              className="btn btn-sm btn-icon"
              onClick={stock.expandSetup}
              title="Expand"
            >
              <i className="bi bi-chevron-down"></i>
            </button>
          </div>
        </>
      )}

      {/* ITEMS */}
      <div className="row">
        <div className="col-12">
          <div className="action-bar">
            <div className="row">
              <div className="col-12 d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
                {/* LEFT */}
                <div className="fw-semibold text-muted small">Items</div>

                {/* RIGHT ACTIONS */}
                <div className="d-flex gap-2">
                  {/* GET ITEMS */}
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={() => stock.setShowSource(true)}
                    disabled={!stock.canAddItems}
                  >
                    <i className="bi bi-box-seam me-1"></i>
                    Get
                  </button>
                </div>
              </div>
              <div className="col-12">
                <ItemList
                  items={stock.items}
                  updateQty={stock.updateQty}
                  removeItem={stock.removeItem}
                  updateUOM={stock.updateUOM}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
