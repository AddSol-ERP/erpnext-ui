import { useNavigate } from "react-router-dom";
import { useHeader } from "../../context/HeaderContext";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Factory,
  PackageCheck,
  PackageOpen,
  NotebookText,
  SlidersHorizontal,
  Settings2,
  Wrench,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import Section from "../../components/Section";
import { INSPECTION_TYPES } from "../../lib/inspectionTypes";

/**
 * One tile per inspection type.
 *
 * A single "Quality Inspection" tile made the inspector hunt the right list
 * before they could start, and the three types are genuinely different jobs:
 * material arriving, goods leaving, and work in progress. The tile is
 * therefore the TYPE, and it opens that type's list.
 *
 * The TILE NAMES are business language, not ERPNext's stored values. "Outgoing"
 * on a phone tells an inspector nothing about what to do; "Final Inspection"
 * does. The values behind them are ERPNext's, unchanged.
 */
const INSPECTION_TILE_STYLE = {
  Incoming: {
    icon: PackageOpen,
    color: "var(--chart-2)",
    titleKey: "quality.inspectionReceiving",
    descriptionKey: "quality.inspectionReceivingDesc",
  },
  Outgoing: {
    icon: PackageCheck,
    color: "var(--chart-5)",
    titleKey: "quality.inspectionFinal",
    descriptionKey: "quality.inspectionFinalDesc",
  },
  "In Process": {
    icon: Factory,
    color: "var(--chart-4)",
    titleKey: "quality.inspectionInProcess",
    descriptionKey: "quality.inspectionInProcessDesc",
  },
};

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

  const handleClick = (tile) => navigate(tile.route);

  // The hub is three things, not one list of ten: the numbers, the work, and
  // the setup the work is built on. A flat grid made the relationship
  // invisible -- a parameter template looks like a report until you know
  // what it is.
  //
  // The order is REPORTS, ACTIONS, MASTER CONFIGURATION: what is happening,
  // then what to do about it, then what everything is defined in.
  const sections = [
    {
      key: "reports",
      title: t("quality.sectionReports"),
      cols: 2,
      items: [
        {
          key: "inspection-pending",
          title: t("store.inspectionPending.title"),
          icon: ClipboardCheck,
          route: "/store/inspection-pending",
          description: t("store.inspectionPending.tileDescription"),
        },
        {
          key: "reports",
          title: t("nav.reports"),
          icon: BarChart3,
          route: "/quality/reports",
          description: t("quality.reportsDesc"),
        },
      ],
    },
    {
      key: "actions",
      title: t("quality.sectionActions"),
      cols: 4,
      items: [
        // ONE TILE PER INSPECTION TYPE. The type rides in the query string --
        // NOT as a path segment: `/quality/inspection/incoming` would be
        // swallowed by the existing `/quality/inspection/:name` route and read
        // as an inspection NAMED "incoming".
        ...INSPECTION_TYPES.map((it) => {
          const style = INSPECTION_TILE_STYLE[it.value] || {};
          return {
            key: `inspection-${it.value.toLowerCase().replace(/\s+/g, "-")}`,
            title: t(style.titleKey),
            description: t(style.descriptionKey),
            icon: style.icon,
            color: style.color,
            route: `/quality/inspection?type=${encodeURIComponent(it.value)}`,
          };
        }),
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
          // ERPNext's CAPA doctype. It used to be "Corrective Action" --
          // which is a FIELD on "Non Conformance", not a doctype -- so the
          // tile asked for a doctype that does not exist and was answered
          // "DocType Corrective Action not found".
          route: "/quality/Quality Action",
          description: t("quality.correctiveActionDesc"),
        },
      ],
    },
    {
      key: "master",
      title: t("quality.sectionMasterConfig"),
      cols: 4,
      items: [
        {
          key: "parameter-groups",
          title: t("quality.parameterGroups"),
          icon: PackageOpen,
          route: "/quality/parameter-groups",
          description: t("quality.parameterGroupsDesc"),
        },
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
          key: "procedure",
          title: t("quality.qualityProcedure"),
          icon: NotebookText,
          route: "/quality/Quality Procedure",
          description: t("quality.qualityProcedureDesc"),
        },
        {
          key: "additional-inspection-fields",
          title: t("quality.additionalFieldsSettings"),
          icon: Settings2,
          route: "/quality/inspection-settings",
          description: t("quality.additionalFieldsSettingsHint"),
        },
      ],
    },
  ];

  return (
    <DashboardShell>
      {sections.map((section) => (
        <Section key={section.key} title={section.title}>
          <ModuleGrid
            items={section.items}
            cols={section.cols}
            onClick={handleClick}
          />
        </Section>
      ))}
    </DashboardShell>
  );
}
