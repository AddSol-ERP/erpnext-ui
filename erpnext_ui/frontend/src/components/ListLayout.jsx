import React from "react";

export default function ListLayout({
  actionBar,
  children,
  pagination,
  emptyState,
  isEmpty,
}) {
  return (
    <div className="list-layout d-flex flex-column h-100">
      {/* 🔹 ACTION BAR */}
      {actionBar && <div className="list-layout-header">{actionBar}</div>}

      {/* 🔹 SCROLLABLE CONTENT */}
      <div className="list-layout-body">
        {isEmpty ? (
          <div className="list-empty">{emptyState || "No data found"}</div>
        ) : (
          children
        )}
      </div>

      {/* 🔹 PAGINATION */}
      {pagination && <div className="list-layout-footer">{pagination}</div>}
    </div>
  );
}
