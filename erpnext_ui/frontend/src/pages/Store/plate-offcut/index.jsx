import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useHeader } from "../../../context/HeaderContext";
import AvailablePlates from "./available-plates";
import OffcutStock from "./offcut-stock";
import CuttingJobs from "./cutting-jobs";

/**
 * The cutting module, as three questions rather than one list.
 *
 *   Available to cut -> click a plate, it is chosen for you
 *   Offcut stock     -> click a piece, see the plate it came from
 *   Cutting jobs     -> the Plate Offcut documents, with scrap and totals
 *
 * The strip matches material-request's scope pills rather than the shadcn line
 * tabs: it is a LIST-page control, and PageToolbar's status pills are the same
 * treatment everywhere else, so a line tab here would read as a different
 * control from the status filters beside it.
 *
 * Each panel renders its own ListLayout, so the strip is handed DOWN to whichever
 * one is mounted -- ListLayout draws `tabs` as a strip inside its own card, and
 * putting a second card around the panels would give two nested elevated cards.
 * Only the active panel is rendered: each carries its own fetch, and keeping the
 * other two alive would fire two needless requests on every visit.
 */
const TABS = ["available", "stock", "jobs"];

export default function PlateOffcut() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setHeader } = useHeader();
  const { t } = useTranslation();

  // Validated, because this comes from the URL: an unrecognised value must fall
  // back rather than render a panel that does not exist.
  const raw = searchParams.get("tab");
  const tab = TABS.includes(raw) ? raw : "available";

  const setTab = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams);
      params.set("tab", next);
      // `replace`: switching tabs is not navigation. Pushing would make the
      // back button walk back through tab clicks instead of leaving the module.
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    setHeader({
      title: t("store.plateOffcut.title"),
      subtitle: t("store.plateOffcut.hubSubtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store"), path: "/store" },
        { label: t("store.plateOffcut.title") },
      ],
      actions: [
        {
          label: t("store.plateOffcut.newTitle"),
          variant: "btn-primary",
          icon: Plus,
          onClick: () => navigate("/store/plate-offcut/new"),
        },
      ],
    });
    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabsNode = useMemo(
    () => (
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 pb-2">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              tab === id
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : "text-chrome-muted hover:bg-muted hover:text-chrome-foreground"
            }`}
          >
            {t(`store.plateOffcut.tab.${id}`)}
          </button>
        ))}
      </div>
    ),
    [tab, setTab, t],
  );

  const Panel =
    tab === "available" ? AvailablePlates : tab === "stock" ? OffcutStock : CuttingJobs;

  // NOT DashboardShell. ListLayout's scroll container is bounded by an `h-full`
  // root, which only resolves if its parent has a real height -- AppShell's
  // <main> is `min-h-0 flex-1 overflow-y-auto`, so ListLayout has to be a direct
  // child of it. DashboardShell is `mx-auto w-full max-w-[1600px] space-y-4 pt-4`
  // with no height at all, so `h-full` fell back to auto, the card grew to fit
  // its content, and the `overflow-auto` body had nothing left to scroll. No
  // other list page in the app wraps ListLayout in it either.
  return <Panel tabs={tabsNode} />;
}