import { useEffect, useState } from "react";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";
import LinkField from "../../../components/LinkField";

export default function QualityInspectionReport() {
  const { setHeader } = useHeader();

  const [data, setData] = useState([]);

  const [filters, setFilters] = useState({
    from_date: "",
    to_date: "",
    item_code: "",
    inspection_type: "",
  });

  const [summary, setSummary] = useState({
    total: 0,
    pass: 0,
    fail: 0,
    passRate: 0,
  });

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: "Quality Dashboard",
      subtitle: "Inspection analytics, trends and quality insights",

      breadcrumbs: [
        { label: "Home", path: "/" },
        { label: "Quality", path: "/quality" },
        { label: "Dashboard" },
      ],

      actions: [
        {
          label: "Refresh",
          variant: "btn-outline-primary",
          onClick: () => loadData(),
        },
      ],
    });

    loadData();

    return () => setHeader({});
  }, []);

  /* ================= LOAD ================= */
  const loadData = async () => {
    try {
      let f = [["docstatus", "=", 1]];

      if (filters.from_date && filters.to_date) {
        f.push(["creation", "between", [filters.from_date, filters.to_date]]);
      }

      if (filters.item_code) {
        f.push(["item_code", "=", filters.item_code]);
      }

      if (filters.inspection_type) {
        f.push(["inspection_type", "=", filters.inspection_type]);
      }

      const res = await get("resource/Quality Inspection", {
        fields: JSON.stringify([
          "name",
          "item_code",
          "inspection_type",
          "status",
          "reference_name",
          "creation",
        ]),
        filters: JSON.stringify(f),
        limit_page_length: 2000,
      });

      const list = res.data || [];
      setData(list);

      const pass = list.filter((d) => d.status === "Accepted").length;
      const fail = list.filter((d) => d.status === "Rejected").length;

      const total = list.length;

      setSummary({
        total,
        pass,
        fail,
        passRate: total ? ((pass / total) * 100).toFixed(1) : 0,
      });
    } catch (e) {
      console.error(e);
    }
  };

  /* ================= GROUPING ================= */

  // 📈 Trend
  const trend = {};
  data.forEach((d) => {
    const date = d.creation.split(" ")[0];

    if (!trend[date]) trend[date] = { pass: 0, fail: 0 };

    if (d.status === "Accepted") trend[date].pass++;
    if (d.status === "Rejected") trend[date].fail++;
  });

  // 🔴 Fail by Item
  const failByItem = {};
  data.forEach((d) => {
    if (d.status === "Rejected") {
      if (!failByItem[d.item_code]) failByItem[d.item_code] = 0;
      failByItem[d.item_code]++;
    }
  });

  const topFailures = Object.entries(failByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 📦 Type Distribution
  const typeDist = {};
  data.forEach((d) => {
    if (!typeDist[d.inspection_type]) typeDist[d.inspection_type] = 0;
    typeDist[d.inspection_type]++;
  });

  // ⚠️ Recent failures
  const recentFailures = data
    .filter((d) => d.status === "Rejected")
    .slice(0, 5);

  /* ================= UI ================= */
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%" }}>
      {/* ================= FILTERS ================= */}
      <div className="card mb-3">
        <div className="card-body row g-2">
          <div className="col-md-3">
            <input
              type="date"
              className="form-control"
              value={filters.from_date}
              onChange={(e) =>
                setFilters({ ...filters, from_date: e.target.value })
              }
            />
          </div>

          <div className="col-md-3">
            <input
              type="date"
              className="form-control"
              value={filters.to_date}
              onChange={(e) =>
                setFilters({ ...filters, to_date: e.target.value })
              }
            />
          </div>

          <div className="col-md-3">
            <LinkField
              doctype="Item"
              value={filters.item_code}
              onChange={(v) => setFilters({ ...filters, item_code: v })}
            />
          </div>

          <div className="col-md-3">
            <select
              className="form-select"
              value={filters.inspection_type}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  inspection_type: e.target.value,
                })
              }
            >
              <option value="">All Types</option>
              <option>Incoming</option>
              <option>In Process</option>
              <option>Outgoing</option>
            </select>
          </div>

          <div className="col-12">
            <button className="btn btn-primary" onClick={loadData}>
              Apply Filters
            </button>
          </div>
        </div>
      </div>

      {/* ================= KPI ================= */}
      <div className="row g-3 mb-3">
        <div className="col-md-3">
          <div className="card">
            <div className="stat-value">{summary.total}</div>
            <div className="stat-label">Total</div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card success">
            <div className="stat-value">{summary.pass}</div>
            <div className="stat-label">Accepted</div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card danger">
            <div className="stat-value">{summary.fail}</div>
            <div className="stat-label">Rejected</div>
          </div>
        </div>

        <div className="col-md-3">
          <div className="card info">
            <div className="stat-value">{summary.passRate}%</div>
            <div className="stat-label">Pass Rate</div>
          </div>
        </div>
      </div>

      {/* ================= MAIN GRID ================= */}
      <div className="row g-3">
        {/* 📈 TREND */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-body">
              <h6>Daily Trend</h6>

              {Object.keys(trend).map((d) => (
                <div
                  key={d}
                  className="d-flex justify-content-between border-bottom py-1"
                >
                  <div>{d}</div>
                  <div className="d-flex gap-2">
                    <span className="badge bg-success">P: {trend[d].pass}</span>
                    <span className="badge bg-danger">F: {trend[d].fail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 🔴 TOP FAIL ITEMS */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-body">
              <h6>Top Failing Items</h6>

              {topFailures.map(([item, count]) => (
                <div
                  key={item}
                  className="d-flex justify-content-between border-bottom py-1"
                >
                  <div>{item}</div>
                  <span className="badge bg-danger">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 📦 TYPE DISTRIBUTION */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-body">
              <h6>Inspection Types</h6>

              {Object.entries(typeDist).map(([t, c]) => (
                <div
                  key={t}
                  className="d-flex justify-content-between border-bottom py-1"
                >
                  <div>{t}</div>
                  <span className="badge bg-primary">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ⚠️ RECENT FAILURES */}
        <div className="col-md-6">
          <div className="card">
            <div className="card-body">
              <h6>Recent Failures</h6>

              {recentFailures.map((r) => (
                <div
                  key={r.name}
                  className="d-flex justify-content-between border-bottom py-1"
                >
                  <div>
                    {r.item_code}
                    <div className="text-muted small">{r.reference_name}</div>
                  </div>

                  <span className="badge bg-danger">Fail</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
