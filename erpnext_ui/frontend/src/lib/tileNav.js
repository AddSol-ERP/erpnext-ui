import { getDoctypeConfig } from "../config/doctypes";

/**
 * Shared ActionTile navigation for hub pages.
 * - Normal click → navigate(route)
 * - Create click → ERPNext native form in new tab when configured, else createRoute
 */
export function createTileNav(navigate) {
  return function handleTileClick(tile, isCreate) {
    if (isCreate && tile.createRoute) {
      const doctype = tile.route.split("/").filter(Boolean).pop();
      const config = getDoctypeConfig(doctype);
      if (config.nativeForm) {
        const doctypeUrl = doctype.toLowerCase().replace(/\s+/g, "-");
        window.open(`/app/${doctypeUrl}/new-${doctypeUrl}`, "_blank");
        return;
      }
      navigate(tile.createRoute);
      return;
    }
    navigate(tile.route);
  };
}

export default createTileNav;
