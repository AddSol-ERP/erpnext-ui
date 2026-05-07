function applyTheme(config = {}) {
  const root = document.documentElement;

  // =============================
  // HELPERS
  // =============================
  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((x) => x + x)
        .join("");
    }
    const bigint = parseInt(hex, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  function setVar(name, value) {
    if (value !== undefined && value !== null) {
      root.style.setProperty(name, value);
    }
  }

  function rgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // =============================
  // INPUT CONFIG
  // =============================
  const primary = config.primary || "#00d1ff";
  const secondary = config.secondary || "#7b61ff";
  const mode = config.mode || "dark"; // dark | light

  // =============================
  // BASE BRAND
  // =============================
  setVar("--brand-primary", primary);
  setVar("--brand-primary-hover", secondary);

  setVar("--brand-accent", primary);
  setVar("--brand-accent-2", secondary);

  setVar("--bs-primary", primary);

  // =============================
  // HEADER (SAFE BLEND)
  // =============================
  const headerBg =
    mode === "dark"
      ? `linear-gradient(180deg, ${rgba(primary, 0.08)}, #151d2f)`
      : `linear-gradient(180deg, ${rgba(primary, 0.06)}, #ffffff)`;

  setVar("--header-bg", headerBg);

  // =============================
  // BUTTONS
  // =============================
  setVar("--btn-primary-bg", primary);
  setVar("--btn-primary-hover", secondary);
  setVar("--btn-primary-shadow", `0 4px 14px ${rgba(primary, 0.25)}`);

  setVar("--btn-outline-hover-bg", rgba(primary, 0.08));
  setVar("--btn-soft-bg", rgba(primary, 0.08));
  setVar("--btn-soft-hover-bg", rgba(primary, 0.16));

  // =============================
  // GLOWS / EFFECTS
  // =============================
  setVar("--glow-accent", `0 0 20px ${rgba(primary, 0.25)}`);
  setVar("--card-hover-glow-brand", `0 0 12px ${rgba(primary, 0.15)}`);

  // =============================
  // SEARCH / INPUT FOCUS
  // =============================
  setVar("--action-search-hover-border", rgba(primary, 0.3));

  setVar(
    "--action-search-focus-shadow",
    `0 0 0 2px ${rgba(primary, 0.15)}, 0 4px 20px ${rgba(primary, 0.15)}`,
  );

  setVar(
    "--input-focus-shadow",
    `0 0 0 2px ${rgba(primary, 0.15)}, 0 4px 18px ${rgba(primary, 0.15)}`,
  );

  // =============================
  // BODY BACKGROUND (SAFE)
  // =============================
  setVar("--body-radial-brand", rgba(primary, mode === "dark" ? 0.08 : 0.04));

  // =============================
  // FILTER / ACTIVE STATES
  // =============================
  setVar("--btn-filter-active-shadow", `0 4px 12px ${rgba(primary, 0.25)}`);

  // =============================
  // THEME MODE SWITCH
  // =============================
  root.setAttribute("data-theme", mode);
}

export default applyTheme;
