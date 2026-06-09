/**
 * Enhances the Frappe desk with navigation to the custom tile-based SPA:
 *   1. Navbar button — indigo "Custom UI" pill next to the user avatar.
 *   2. Home page tile — workspace-style card on the /app workspace grid.
 *
 * This file is injected into every desk page via the `app_include_js` hook.
 */

frappe.ready(function () {
	// Shorter initial delay; the observers will catch any late renders
	setTimeout(init, 200);
});

function init() {
	addCustomUIButton();
	addHomePageTile();
}

/* ------------------------------------------------------------------ */
/*  1. Navbar button                                                   */
/* ------------------------------------------------------------------ */

function addCustomUIButton() {
	if (document.getElementById("addsol-custom-ui-btn")) return;

	const userDropdown = findAnchor([
		".navbar-user-dropdown",
		'li.nav-item.dropdown[data-target="#navbar-user-popover"]',
		".navbar-nav .nav-item:last-child",
		"#navbar-user-popover",
	]);
	if (!userDropdown) return;

	const target =
		userDropdown.closest?.("li.nav-item") ||
		userDropdown.closest?.(".nav-item") ||
		userDropdown;

	const li = document.createElement("li");
	li.className = "nav-item";
	li.id = "addsol-custom-ui-btn";
	li.style.cssText =
		"display:flex;align-items:center;margin:0 2px;list-style:none;";

	const link = document.createElement("a");
	link.className = "nav-link";
	link.href = "/custom_ui";
	link.title = "Open Custom UI";
	link.style.cssText = [
		"display:flex",
		"align-items:center",
		"gap:5px",
		"padding:5px 10px",
		"border-radius:6px",
		"background:#4f46e5",
		"color:#fff !important",
		"font-size:12px",
		"font-weight:500",
		"text-decoration:none",
		"white-space:nowrap",
		"cursor:pointer",
	].join(";");

	link.innerHTML = [
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"',
		'  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
		'  <rect x="3" y="3" width="7" height="7"></rect>',
		'  <rect x="14" y="3" width="7" height="7"></rect>',
		'  <rect x="3" y="14" width="7" height="7"></rect>',
		'  <rect x="14" y="14" width="7" height="7"></rect>',
		"</svg>",
		"Custom UI",
	].join("");

	li.appendChild(link);
	target.parentNode.insertBefore(li, target);
}

/* ------------------------------------------------------------------ */
/*  2. Home-page tile  (workspace grid)                                */
/* ------------------------------------------------------------------ */

function addHomePageTile() {
	if (!isWorkspacePage()) return;

	// Use a MutationObserver to catch the dynamically-rendered grid
	const observer = new MutationObserver(function () {
		const grid = document.querySelector(".workspace-grid");
		if (grid && !document.getElementById("addsol-home-tile")) {
			injectWorkspaceTile(grid);
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });

	// Also try immediately in case the DOM is already ready
	const grid = document.querySelector(".workspace-grid");
	if (grid) injectWorkspaceTile(grid);
}

function injectWorkspaceTile(grid) {
	if (document.getElementById("addsol-home-tile")) return;

	const tile = document.createElement("a");
	tile.id = "addsol-home-tile";
	tile.href = "/custom_ui";
	tile.className = "workspace-card";
	tile.title = "Open Custom UI";
	tile.style.cssText = [
		"display:flex",
		"flex-direction:column",
		"align-items:center",
		"justify-content:center",
		"gap:10px",
		"padding:24px 16px",
		"border-radius:12px",
		"background:linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
		"color:#fff",
		"text-decoration:none",
		"cursor:pointer",
		"border:none",
		"transition:transform .15s, box-shadow .15s",
		"min-height:140px",
		"min-width:180px",
	].join(";");

	tile.innerHTML = [
		'<div style="',
		"  width:40px;height:40px;border-radius:10px;",
		"  background:rgba(255,255,255,.2);",
		"  display:flex;align-items:center;justify-content:center;",
		'">',
		'  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"',
		'    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
		'    <rect x="3" y="3" width="7" height="7"></rect>',
		'    <rect x="14" y="3" width="7" height="7"></rect>',
		'    <rect x="3" y="14" width="7" height="7"></rect>',
		'    <rect x="14" y="14" width="7" height="7"></rect>',
		"  </svg>",
		"</div>",
		'<div style="font-size:14px;font-weight:600;text-align:center;color:#fff;">Custom UI</div>',
		'<div style="font-size:11px;opacity:.8;text-align:center;color:#fff;">Tile-based interface</div>',
	].join("");

	// Hover effect via vanilla JS
	tile.addEventListener("mouseenter", function () {
		this.style.transform = "translateY(-3px) scale(1.02)";
		this.style.boxShadow = "0 8px 25px rgba(79,70,229,.35)";
	});
	tile.addEventListener("mouseleave", function () {
		this.style.transform = "";
		this.style.boxShadow = "";
	});

	grid.appendChild(tile);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isWorkspacePage() {
	var path = window.location.pathname;
	return path === "/app" || path === "/app/" || /^\/app\/[^\/]+$/.test(path);
}

function findAnchor(selectors) {
	for (var i = 0; i < selectors.length; i++) {
		var el = document.querySelector(selectors[i]);
		if (el) return el;
	}
	return null;
}
