import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ClipboardList,
  ShoppingCart,
  ArrowLeftRight,
  Factory,
  UserCheck,
  HandHelping,
  PackagePlus,
  Boxes,
  Warehouse,
  BarChart3,
  BookOpen,
  Truck,
  Package,
  Scissors,
} from "lucide-react";
import { useHeader } from "../../context/HeaderContext";
import { useRole } from "../../context/RoleContext";
import DashboardShell from "../../components/dashboard/DashboardShell";
import ModuleGrid from "../../components/dashboard/ModuleGrid";
import Section from "../../components/Section";
import { REQUEST_PURPOSE_KEYS, REQUEST_PURPOSES } from "../../config/storePurposes";
import { createTileNav } from "../../lib/tileNav";

/**
 * The Store module is organised by *what you came here to do*, not by ERPNext
 * doctype.
 *
 * The previous hub listed seven doctype-shaped tiles ("Material Request",
 * "Stock Entry"), which is exactly what made the module confusing: a person
 * asking the store for material does not know that they need a "Material
 * Request" of type "Material Issue". So the requester-facing tiles below are
 * named after the action, and the doctype behind each one is decided by
 * config/storePurposes.js -- never written inline here.
 *
 * Icons are resolved by name from the icon module rather than imported
 * statically, so the purpose list and its artwork stay in one place.
 */
const PURPOSE_ICONS = {
  ClipboardList,
  ShoppingCart,
  ArrowLeftRight,
  Factory,
  UserCheck,
};

/**
 * Tiles for "I need something" — one per request purpose, in config order.
 *
 * These open the **form directly**. The dashboard is where you act: picking
 * "Raise an Indent" should land you in a form, not on another page whose only
 * job is to offer you the same button one more time.
 *
 * Browsing existing requests is a separate, deliberate step — the "All requests"
 * header action — because it is a different intent from raising a new one, and
 * folding it into the card click would put a "read" action behind what reads as
 * a "create" action.
 */
function requestTiles() {
  return REQUEST_PURPOSE_KEYS.map((key) => ({
    key: `request-${key}`,
    icon: PURPOSE_ICONS[REQUEST_PURPOSES[key].icon] || Package,
    route: `/store/material-request/purpose/${key}/new`,
    titleKey: `store.purposes.${key}.title`,
    descriptionKey: `store.purposes.${key}.description`,
  }));
}

/**
 * Tiles for "I keep the stock".
 *
 * "Give Items" is the storekeeper's counterpart to "Raise an Indent": the queue
 * of indents waiting on material. The four stock movements route into the
 * existing Stock Entry screen.
 */
const STORE_TILES = [
  {
    // Above Give Items on purpose: a store day is mostly receiving and handing
    // over, and receiving is the more frequent of the two.
    key: "purchase-receipt",
    icon: PackagePlus,
    route: "/store/purchase-receipt",
    titleKey: "store.receipt.title",
    descriptionKey: "store.receipt.description",
  },
  {
    key: "give-items",
    icon: HandHelping,
    route: "/store/indents",
    titleKey: "store.giveItems.title",
    descriptionKey: "store.giveItems.description",
  },
  {
    key: "stock-entry",
    icon: Package,
    route: "/store/stock-entry",
    titleKey: "store.tiles.stockEntry.title",
    descriptionKey: "store.tiles.stockEntry.description",
  },
  {
    // NL only. Cutting a plate produces offcuts, so it is a stock movement and
    // belongs beside Stock Entry rather than under Lookups. `app` hides it on
    // every other site -- DOCTYPE_CONFIG is static, so without the gate this
    // tile would appear for all customers and open a doctype that is not there.
    // `createRoute` is deliberate: createTileNav opens the desk new form
    // directly for a nativeForm doctype, exactly as it does for Item/Warehouse.
    key: "plate-offcut",
    icon: Scissors,
    route: "/store/Plate Offcut",
    createRoute: "/store/Plate Offcut/new",
    app: "addsol_nl_custom",
    titleKey: "store.tiles.plateOffcut.title",
    descriptionKey: "store.tiles.plateOffcut.description",
  },
];

const LOOKUP_TILES = [
  {
    key: "stock-balance",
    icon: BarChart3,
    route: "/store/stock-balance",
    titleKey: "store.tiles.stockBalance.title",
    descriptionKey: "store.tiles.stockBalance.description",
  },
  {
    key: "item-master",
    icon: Boxes,
    route: "/store/Item",
    createRoute: "/store/Item/new",
    titleKey: "store.tiles.itemMaster.title",
    descriptionKey: "store.tiles.itemMaster.description",
  },
  {
    key: "warehouse",
    icon: Warehouse,
    route: "/store/Warehouse",
    createRoute: "/store/Warehouse/new",
    titleKey: "store.tiles.warehouse.title",
    descriptionKey: "store.tiles.warehouse.description",
  },
  {
    // Tagging a BOM with a Project is what makes project-scoped indents work at
    // all -- see api.get_project_items. It lives under Lookups rather than in
    // the requester flow because it is set up once per project, not per indent.
    key: "bom",
    icon: BookOpen,
    route: "/store/BOM",
    createRoute: "/store/BOM/new",
    titleKey: "store.tiles.bom.title",
    descriptionKey: "store.tiles.bom.description",
  },
  {
    key: "delivery",
    icon: Truck,
    route: "/store/delivery",
    titleKey: "store.tiles.delivery.title",
    descriptionKey: "store.tiles.delivery.description",
  },
];

export default function StoreDashboard() {
  const navigate = useNavigate();
  const { setHeader } = useHeader();
  const { t } = useTranslation();
  const { hasApp } = useRole();
  const handleTileClick = createTileNav(navigate);

  // Hide tiles that belong to an optional app this site does not have. Mirrors
  // how the sidebar filters children on `reportKey`.
  const visibleTiles = (tiles) =>
    tiles.filter((tile) => !tile.app || hasApp(tile.app));

  useEffect(() => {
    setHeader({
      title: t("nav.store"),
      subtitle: t("store.hub.subtitle"),
      breadcrumbs: [
        { label: t("common.home"), path: "/" },
        { label: t("nav.store") },
      ],
      // Browsing is a separate intent from acting, so it is a separate control
      // rather than the body of every purpose card.
      actions: [
        {
          label: t("store.mr.allTitle"),
          variant: "btn-outline-primary",
          onClick: () => navigate("/store/material-request"),
        },
      ],
    });

    return () => setHeader({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardShell>
      {/*
        No DashboardHero here. It repeated the page subtitle inside a card
        directly beneath a top bar that already shows the same subtitle, so the
        page opened with a full-width strip that said nothing the header had not
        already said — and pushed the purpose cards, the actual content, below
        the fold. The context still reads from setHeader's `subtitle`, which
        AppShell's TitleBlock renders in the top bar.
      */}
      <Section title={t("store.purposeGroupRequester")}>
        {/*
          Purpose cards navigate straight to their form, so they must NOT go
          through createTileNav: that handler interprets a `create` click by
          deriving a doctype from the route's last segment, which is now a URL
          like /store/material-request/purpose/indent/new rather than a doctype
          name. Plain navigation is what these tiles actually want.
        */}
        <ModuleGrid
          items={requestTiles()}
          onClick={(tile) => navigate(tile.route)}
        />
      </Section>

      <Section title={t("store.purposeGroupStore")}>
        <ModuleGrid items={visibleTiles(STORE_TILES)} onClick={handleTileClick} />
      </Section>

      <Section title={t("store.purposeGroupLookup")}>
        <ModuleGrid items={visibleTiles(LOOKUP_TILES)} onClick={handleTileClick} />
      </Section>
    </DashboardShell>
  );
}
