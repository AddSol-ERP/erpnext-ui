import { useEffect, useState } from "react";
import { useHeader } from "../../context/HeaderContext";
import { useNavigate } from "react-router-dom";
import { get } from "../../services/api";

function getStatusClass(pending) {
  if (pending > 10) return "danger";
  if (pending > 0) return "warning";
  return "success";
}

function ApprovalTile({ tile, onClick }) {
  const status = getStatusClass(tile.pending);

  return (
    <div
      className={`card approval-tile ${status}`}
      onClick={() => onClick(tile.doctype)}
      style={{ cursor: "pointer" }}
    >
      {/* TOP */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="d-flex align-items-center gap-2">
          <div className="icon-box">
            <i className={`bi ${tile.icon}`} />
          </div>

          <div className="fw-semibold">{tile.label}</div>
        </div>

        {tile.pending > 0 && (
          <span
            className={`badge ${
              status === "danger"
                ? "bg-danger"
                : status === "warning"
                  ? "bg-warning text-dark"
                  : "bg-success"
            }`}
          >
            {tile.pending}
          </span>
        )}
      </div>

      {/* STATS */}
      <div className="d-flex justify-content-between mt-2">
        <div>
          <div className="stat-value text-warning">{tile.pending}</div>
          <div className="stat-label">Pending</div>
        </div>

        <div className="text-end">
          <div className="stat-value text-success">{tile.approved}</div>
          <div className="stat-label">Approved</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- MAIN PAGE ---------------- */

export default function Approval() {
  const { setHeader } = useHeader();
  const navigate = useNavigate();
  const [tiles, setTiles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHeader({
      title: "Approvals",
      subtitle: "Review and approve requests",
      breadcrumbs: [{ label: "Home", path: "/" }, { label: "Approvals" }],
    });

    fetchApprovalData();

    return () => setHeader({});
  }, []);

  const fetchApprovalData = async () => {
    setLoading(true);
    try {
      const approvalDoctypes = [
        {
          doctype: "Purchase Order",
          label: "Purchase Orders",
          icon: "bi-bag-check",
        },
        { doctype: "Expense Claim", label: "Expenses", icon: "bi-receipt" },
        {
          doctype: "Leave Application",
          label: "Leaves",
          icon: "bi-calendar-check",
        },
        { doctype: "Quotation", label: "Quotations", icon: "bi-file-text" },
      ];

      const fetchedTiles = await Promise.all(
        approvalDoctypes.map(async (item) => {
          try {
            // Fetch pending count
            const pendingRes = await get("method/frappe.client.get_count", {
              doctype: item.doctype,
              filters: JSON.stringify({ status: "Pending" }),
            });

            // Fetch approved count
            const approvedRes = await get("method/frappe.client.get_count", {
              doctype: item.doctype,
              filters: JSON.stringify({ status: "Approved" }),
            });

            return {
              doctype: item.doctype,
              label: item.label,
              icon: item.icon,
              pending: pendingRes.message || 0,
              approved: approvedRes.message || 0,
            };
          } catch (error) {
            console.error(`Failed to fetch ${item.doctype}:`, error);
            return {
              doctype: item.doctype,
              label: item.label,
              icon: item.icon,
              pending: 0,
              approved: 0,
            };
          }
        }),
      );

      // Sort by urgency (pending count)
      fetchedTiles.sort((a, b) => b.pending - a.pending);
      setTiles(fetchedTiles);
    } catch (error) {
      console.error("Failed to fetch approval data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid px-2 px-md-3">
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : (
        <>
          {/* 🔥 GRID */}
          <div className="row g-3">
            {tiles.map((tile) => (
              <div key={tile.doctype} className="col-12 col-md-6 col-lg-4 col-xl-3">
                <ApprovalTile
                  tile={tile}
                  onClick={(doctype) =>
                    navigate(`/approvals/${encodeURIComponent(doctype)}`)
                  }
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
