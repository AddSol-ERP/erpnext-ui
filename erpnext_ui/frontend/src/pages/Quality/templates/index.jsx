import { useEffect, useState } from "react";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import ListLayout from "../../../components/ListLayout"; // ✅ new
import { get } from "../../../services/api";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";

const PAGE_SIZE = 10;

/* ===============================
   LIST ROW
================================ */
function ListRow({ item, onClick }) {
  return (
    <div className="list-row" onClick={() => onClick(item.raw)}>
      <div className="list-col main">
        <div className="list-title">{item.title}</div>
        <div className="list-sub text-muted">{item.subtitle}</div>
      </div>

      <div className="list-col actions">
        <button className="btn btn-icon">
          <i className="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}

/* ===============================
   MAIN
================================ */
export default function QualityTemplateList() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  /* HEADER */
  useEffect(() => {
    setHeader({
      title: "Quality Templates",
      subtitle: "Define and manage inspection criteria",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Quality", path: "/quality" },
        { label: "Templates" },
      ],

      actions: [
        {
          label: "Create",
          variant: "btn-primary",
          onClick: () => navigate("new"),
        },
      ],
    });

    return () => setHeader({});
  }, []);

  /* SEARCH (debounce) */
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  /* LOAD */
  const loadData = async () => {
    try {
      const params = {
        fields: JSON.stringify([
          "name",
          "quality_inspection_template_name",
          "modified",
        ]),
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      if (debouncedSearch) {
        params.or_filters = JSON.stringify([
          ["quality_inspection_template_name", "like", `%${debouncedSearch}%`],
          ["name", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Quality Inspection Template", params),
        get("method/frappe.client.get_count", {
          doctype: "Quality Inspection Template",
        }),
      ]);

      setData(listRes.data || []);
      setTotalPages(Math.ceil((countRes.message || 0) / PAGE_SIZE));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, debouncedSearch]);

  /* MAP */
  const listData = data.map((row) => ({
    title: row.quality_inspection_template_name || row.name,
    subtitle: row.name,
    raw: row,
  }));

  return (
    <ListLayout
      actionBar={<ActionBar onSearch={setSearch} />}
      pagination={
        totalPages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        )
      }
      isEmpty={listData.length === 0}
      emptyState="No templates found"
    >
      <div className="list-container">
        {listData.map((item, i) => (
          <ListRow
            key={i}
            item={item}
            onClick={() => navigate(`${item.raw.name}`)}
          />
        ))}
      </div>
    </ListLayout>
  );
}
