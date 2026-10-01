/**
 * Top bar composition flags.
 * Toggle global tools on/off here without touching AppShell/PageHeader markup.
 */
export const TOP_BAR = {
  showSidebarTrigger: true,
  showBack: true,
  showHome: true,
  /** Desk launcher lives in the user menu; keep the standalone icon off. */
  showDesk: false,
  showLanguage: true,
  showTheme: true,
  showUser: true,
  /**
   * true → page actions + status chips render in a fixed glass
   * bottom bar (actions aligned to the end / right in LTR).
   */
  pageToolbar: true,
};

export default TOP_BAR;
