import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  FileCheck,
  NotebookText,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardHero from "../../components/dashboard/DashboardHero";
import ModuleGrid from "../../components/dashboard/ModuleGrid";

export default function QualityDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  useEffect(() => {
    setHeader({
      title: t("nav.quality"),
      subtitle: t("quality.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.quality") },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const modules = [
    {
      key: "parameters",
      title: t("quality.inspectionParameters"),
      icon: SlidersHorizontal,
      route: "/quality/parameters",
      description: t("quality.inspectionParametersDesc"),
    },
    {
      key: "templates",
      title: t("quality.qualityTemplates"),
      icon: ClipboardList,
      route: "/quality/templates",
      description: t("quality.qualityTemplatesDesc"),
    },
    {
      key: "inspection",
      title: t("quality.qualityInspection"),
      icon: FileCheck,
      route: "/quality/inspection",
      description: t("quality.qualityInspectionDesc"),
    },
    {
      key: "nc",
      title: t("quality.nonConformance"),
      icon: AlertTriangle,
      route: "/quality/Non Conformance",
      description: t("quality.nonConformanceDesc"),
    },
    {
      key: "capa",
      title: t("quality.correctiveAction"),
      icon: Wrench,
      route: "/quality/Corrective Action",
      description: t("quality.correctiveActionDesc"),
    },
    {
      key: "procedure",
      title: t("quality.qualityProcedure"),
      icon: NotebookText,
      route: "/quality/Quality Procedure",
      description: t("quality.qualityProcedureDesc"),
    },
    {
      key: "reports",
      title: t("nav.reports"),
      icon: BarChart3,
      route: "/quality/reports",
      description: t("quality.reportsDesc"),
    },
  ];

  return (
    <DashboardShell>
      <DashboardHero icon={ShieldCheck} description={t("quality.subtitle")} />
      <ModuleGrid items={modules} onClick={(tile) => navigate(tile.route)} />
    </DashboardShell>
  );
}
