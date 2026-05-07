import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHeader } from "../../../context/HeaderContext";
import ActionBar from "../../../components/ActionBar";
import Pagination from "../../../components/Pagination";
import ListLayout from "../../../components/ListLayout";
import { get } from "../../../services/api";

const PAGE_SIZE = 10;

/* ROW */
function ListRow({ item, onClick }) {
  return (
    <div className="list-row" onClick={() => onClick(item.raw)}>
      <div className="list-col main">
        <div className="list-title">{item.title}</div>
        <div className="list-sub text-muted">{item.subtitle}</div>
      </div>

      <div className="list-col meta">{item.meta}</div>

      <div className="list-col actions">
        <button className="btn btn-icon">
          <i className="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}

export default function InspectionParameterList() {
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
      title: "Inspection Parameters",
      subtitle: "Define measurable criteria for quality inspection",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Quality", path: "/quality" },
        { label: "Inspection Parameters" },
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

  /* SEARCH */
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
          "parameter",
          "parameter_group",
          "modified",
        ]),
        order_by: "modified desc",
        limit_start: (page - 1) * PAGE_SIZE,
        limit_page_length: PAGE_SIZE,
      };

      if (debouncedSearch) {
        params.or_filters = JSON.stringify([
          ["name", "like", `%${debouncedSearch}%`],
        ]);
      }

      const [listRes, countRes] = await Promise.all([
        get("resource/Quality Inspection Parameter", params),
        get("method/frappe.client.get_count", {
          doctype: "Quality Inspection Parameter",
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
    title: row.parameter,
    subtitle: row.parameter_group || "No Group",
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
      emptyState="No parameters found"
    >
      <div className="list-container">
        {listData.map((item, i) => (
          <ListRow
            key={i}
            item={item}
            onClick={() => navigate(item.raw.name)}
          />
        ))}
      </div>
    </ListLayout>
  );
}
