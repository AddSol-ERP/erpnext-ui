import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useHeader } from "../../../context/HeaderContext";
import { get } from "../../../services/api";
import LinkField from "../../../components/LinkField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import DashboardHero from "../../../components/dashboard/DashboardHero";
import StatRow from "../../../components/dashboard/StatRow";
import ChartPanel from "../../../components/dashboard/ChartPanel";
import ChartGrid from "../../../components/dashboard/ChartGrid";
import StatCard from "../../../components/StatCard";
import {
  ShieldCheck,
  CircleCheck,
  CircleX,
  Percent,
  ClipboardCheck,
} from "lucide-react";

const CHART_CONFIG = {
  pass: { label: "Pass", color: "var(--chart-2)" },
  fail: { label: "Fail", color: "var(--destructive)" },
  count: { label: "Count", color: "var(--chart-1)" },
};

const PIE_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)", "var(--chart-5)"];

export default function QualityInspectionReport() {
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    from_date: "",
    to_date: "",
    item_code: "",
    inspection_type: "",
  });

  const getTypeLabel = (type) => {
    if (type === "Incoming") return t("quality.typeIncoming");
    if (type === "In Process") return t("quality.typeInProcess");
    if (type === "Outgoing") return t("quality.typeOutgoing");
    return type;
  };

  /* ================= LOAD ================= */
  const loadData = async () => {
    setLoading(true);
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
        order_by: "creation desc",
      });

      setData(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /* ================= HEADER ================= */
  useEffect(() => {
    setHeader({
      title: t("quality.dashboardTitle"),
      subtitle: t("quality.dashboardSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality"), path: "/quality" },
        { label: t("common.dashboard") },
      ],
      actions: [
        {
          label: t("common.refresh"),
          variant: "btn-outline-primary",
          onClick: () => loadData(),
        },
      ],
    });

    // loadData only setStates after an awaited API response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================= DERIVED ================= */
  const summary = useMemo(() => {
    const pass = data.filter((d) => d.status === "Accepted").length;
    const fail = data.filter((d) => d.status === "Rejected").length;
    const total = data.length;
    return {
      total,
      pass,
      fail,
      passRate: total ? ((pass / total) * 100).toFixed(1) : "0",
    };
  }, [data]);

  const trendSeries = useMemo(() => {
    const trend = {};
    data.forEach((d) => {
      const date = (d.creation || "").split(" ")[0];
      if (!date) return;
      if (!trend[date]) trend[date] = { date, pass: 0, fail: 0 };
      if (d.status === "Accepted") trend[date].pass++;
      if (d.status === "Rejected") trend[date].fail++;
    });
    return Object.values(trend).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  const topFailures = useMemo(() => {
    const failByItem = {};
    data.forEach((d) => {
      if (d.status === "Rejected") {
        failByItem[d.item_code] = (failByItem[d.item_code] || 0) + 1;
      }
    });
    return Object.entries(failByItem)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([item, count]) => ({ item, count }));
  }, [data]);

  const typeSeries = useMemo(() => {
    const typeDist = {};
    data.forEach((d) => {
      const key = d.inspection_type || "—";
      typeDist[key] = (typeDist[key] || 0) + 1;
    });
    return Object.entries(typeDist).map(([type, count]) => ({
      type,
      name: getTypeLabel(type),
      count,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, t]);

  const recentFailures = useMemo(
    () => data.filter((d) => d.status === "Rejected").slice(0, 5),
    [data],
  );

  const hasChartData =
    trendSeries.length > 0 || topFailures.length > 0 || typeSeries.length > 0;

  /* ================= UI ================= */
  return (
    <DashboardShell>
      <DashboardHero
        icon={ShieldCheck}
        description={t("quality.dashboardSubtitle")}
      />

      {/* ================= FILTERS ================= */}
      <div className="rounded-none bg-card p-4 ring-1 ring-foreground/10">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <Input
            type="date"
            aria-label={t("quality.fromDate")}
            value={filters.from_date}
            onChange={(e) =>
              setFilters({ ...filters, from_date: e.target.value })
            }
          />

          <Input
            type="date"
            aria-label={t("quality.toDate")}
            value={filters.to_date}
            onChange={(e) =>
              setFilters({ ...filters, to_date: e.target.value })
            }
          />

          <LinkField
            doctype="Item"
            value={filters.item_code}
            onChange={(v) => setFilters({ ...filters, item_code: v })}
          />

          <Select
            value={filters.inspection_type || "all"}
            onValueChange={(v) =>
              setFilters({
                ...filters,
                inspection_type: v === "all" ? "" : v,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("quality.allTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("quality.allTypes")}</SelectItem>
              <SelectItem value="Incoming">
                {t("quality.typeIncoming")}
              </SelectItem>
              <SelectItem value="In Process">
                {t("quality.typeInProcess")}
              </SelectItem>
              <SelectItem value="Outgoing">
                {t("quality.typeOutgoing")}
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="md:col-span-4">
            <Button onClick={loadData}>{t("quality.applyFilters")}</Button>
          </div>
        </div>
      </div>

      {/* ================= KPI ================= */}
      <StatRow>
        <StatCard
          value={summary.total}
          label={t("common.total")}
          icon={ClipboardCheck}
        />
        <StatCard
          value={summary.pass}
          label={t("quality.statusAccepted")}
          icon={CircleCheck}
          color="var(--chart-2)"
        />
        <StatCard
          value={summary.fail}
          label={t("quality.statusRejected")}
          icon={CircleX}
          color="var(--chart-5)"
        />
        <StatCard
          value={`${summary.passRate}%`}
          label={t("quality.passRate")}
          icon={Percent}
          color="var(--chart-4)"
        />
      </StatRow>

      {/* ================= CHARTS + LIST ================= */}
      <ChartGrid>
        {/* Daily trend — line */}
        <ChartPanel title={t("quality.dailyTrend")}>
          {trendSeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("quality.chartNoData")}
            </p>
          ) : (
            <ChartContainer
              config={{
                ...CHART_CONFIG,
                pass: { ...CHART_CONFIG.pass, label: t("quality.chartPass") },
                fail: { ...CHART_CONFIG.fail, label: t("quality.chartFail") },
              }}
              className="aspect-auto h-[220px] w-full"
            >
              <LineChart data={trendSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) => String(v).slice(5)}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <ChartTooltipContent />
                <ChartLegend />
                <Line
                  dataKey="pass"
                  type="monotone"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  dataKey="fail"
                  type="monotone"
                  stroke="var(--destructive)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </ChartPanel>

        {/* Top failing items — horizontal bar */}
        <ChartPanel title={t("quality.topFailingItems")}>
          {topFailures.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("quality.chartNoData")}
            </p>
          ) : (
            <ChartContainer
              config={{
                count: { ...CHART_CONFIG.count, label: t("quality.chartCount") },
              }}
              className="aspect-auto h-[220px] w-full"
            >
              <BarChart
                data={topFailures}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="item"
                  tickLine={false}
                  axisLine={false}
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <ChartTooltipContent />
                <Bar dataKey="count" fill="var(--destructive)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </ChartPanel>

        {/* Inspection types — donut */}
        <ChartPanel title={t("quality.inspectionTypes")}>
          {typeSeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("quality.chartNoData")}
            </p>
          ) : (
            <ChartContainer
              config={Object.fromEntries(
                typeSeries.map((d, i) => [
                  d.type,
                  { label: d.name, color: PIE_COLORS[i % PIE_COLORS.length] },
                ]),
              )}
              className="aspect-auto h-[220px] w-full"
            >
              <PieChart>
                <ChartTooltipContent />
                <Pie
                  data={typeSeries}
                  dataKey="count"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {typeSeries.map((_, i) => (
                    <Cell
                      key={i}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          )}
        </ChartPanel>

        {/* Recent failures — list */}
        <ChartPanel title={t("quality.recentFailures")}>
          {recentFailures.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("quality.chartNoData")}
            </p>
          ) : (
            <div className="flex flex-col">
              {recentFailures.map((r) => (
                <div
                  key={r.name}
                  className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {r.item_code}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.reference_name}
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 bg-destructive/15 text-destructive ring-destructive/30"
                  >
                    {t("quality.fail")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ChartPanel>
      </ChartGrid>

      {!hasChartData && loading ? (
        <p className="text-center text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : null}
    </DashboardShell>
  );
}
