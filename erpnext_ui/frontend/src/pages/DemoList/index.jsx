import { useEffect, useState } from "react";
import { useHeader } from "../../context/HeaderContext";
import ActionBar from "../../components/ActionBar";
import Pagination from "../../components/Pagination";

/* ===============================
   LIST ROW
================================ */
function ListRow({ item }) {
  return (
    <div className="list-row">
      {/* LEFT */}
      <div className="list-col main">
        <div className="list-title">{item.title}</div>
        <div className="list-sub text-muted">{item.subtitle}</div>
      </div>

      {/* MIDDLE (DESKTOP) */}
      <div className="list-col meta d-none d-md-block">{item.meta}</div>

      {/* RIGHT */}
      <div className="list-col actions">
        <span className={`badge status-${item.status}`}>{item.status}</span>

        <button className="btn btn-icon">
          <i className="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}

/* ===============================
   MAIN COMPONENT
================================ */
const DemoList = () => {
  const { setHeader } = useHeader();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const totalPages = 3;

  /* 🔥 HEADER CONFIG */
  useEffect(() => {
    setHeader({
      title: "🏭 ERP Dashboard",
      subtitle: "Quick access to operations",
      actions: [
        { label: "Refresh", variant: "btn-outline-primary" },
        { label: "+ Quick Action" },
      ],
    });

    return () => setHeader({});
  }, []);

  /* DUMMY DATA */
  const data = [
    {
      title: "STE-0001",
      subtitle: "Material Issue",
      meta: "WH-A → Production",
      status: "open",
    },
    {
      title: "STE-0002",
      subtitle: "Material Receipt",
      meta: "Vendor → WH-B",
      status: "complete",
    },
    {
      title: "STE-0003",
      subtitle: "Transfer Entry",
      meta: "WH-A → WH-C",
      status: "pending",
    },
    {
      title: "STE-0004",
      subtitle: "Repack Entry",
      meta: "WH-B → WH-A",
      status: "open",
    },
  ];

  /* SEARCH FILTER */
  const filteredData = data.filter((item) =>
    item?.title?.toLowerCase().includes(search?.toLowerCase()),
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      <ActionBar
        onSearch={(q) => setSearch(q)}
        onFilter={() => console.log("open filter modal")}
        onPrint={() => window.print()}
        onExport={() => console.log("export CSV")}
      />
      <div className="list-container">
        {filteredData.length === 0 ? (
          <div className="list-empty">No data found</div>
        ) : (
          filteredData.map((item, idx) => <ListRow key={idx} item={item} />)
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
};

export default DemoList;
