/**
 * Enhances the Frappe desk with navigation to the custom tile-based SPA:
 *   1. Navbar button — indigo "Addsol UI" pill next to the user avatar.
 *   2. Home page tile — injected into the workspace/module grid on /app.
 *
 * Supports Frappe v14 (module-grid) and v15 (workspace-grid).
 * This file is injected via the `app_include_js` hook.
 */

// Use jQuery document ready (safer than frappe.ready across versions)
$(document).ready(function () {
	init();
});

function init() {
	debug("addsol_desk_button.js loaded");
	addCustomUIButton();
	addHomePageTile();
}

/* ------------------------------------------------------------------ */
/*  1. Navbar button                                                   */
/* ------------------------------------------------------------------ */

function addCustomUIButton() {
	if (document.getElementById("addsol-custom-ui-btn")) return;

	var userDropdown = findAnchor([
		".navbar-user-dropdown",
		'li.nav-item.dropdown[data-target="#navbar-user-popover"]',
		"#navbar-user-popover",
		".navbar-nav .nav-item:last-child",
	]);
	if (!userDropdown) {
		debug("Navbar: no user dropdown anchor found — will retry");
		return setTimeout(addCustomUIButton, 1000);
	}

	var target =
		userDropdown.closest("li.nav-item") ||
		userDropdown.closest(".nav-item") ||
		userDropdown;

	var li = document.createElement("li");
	li.className = "nav-item";
	li.id = "addsol-custom-ui-btn";
	li.style.cssText =
		"display:flex;align-items:center;margin:0 2px;list-style:none;";

	var link = document.createElement("a");
	link.className = "nav-link";
	link.href = "/addsol_ui";
	link.title = "Open Addsol UI";
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

	link.innerHTML =
		'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<rect x="3" y="3" width="7" height="7"></rect>' +
		'<rect x="14" y="3" width="7" height="7"></rect>' +
		'<rect x="3" y="14" width="7" height="7"></rect>' +
		'<rect x="14" y="14" width="7" height="7"></rect>' +
		"</svg>" +
		" Addsol UI";

	li.appendChild(link);
	target.parentNode.insertBefore(li, target);
	debug("Navbar button added");
}

/* ------------------------------------------------------------------ */
/*  2. Home-page tile  (workspace / module grid)                       */
/* ------------------------------------------------------------------ */

function addHomePageTile() {
	var path = window.location.pathname;
	var isHome = path === "/app" || path === "/app/" || /^\/app\/[^\/]+$/.test(path);
	if (!isHome) {
		debug("Not a workspace page (" + path + ") — skipping tile");
		return;
	}
	debug("Workspace page detected — looking for grid");

	// Try immediately
	tryInjectTile();

	// Watch DOM for dynamically-rendered grid (Frappe v14/v15 both)  @every 800ms × 15
	var retries = 0;
	var maxRetries = 15;
	var iv = setInterval(function () {
		retries++;
		tryInjectTile();
		if (document.getElementById("addsol-home-tile") || retries >= maxRetries) {
			clearInterval(iv);
			debug(retries >= maxRetries ? "Tile injection stopped (max retries)" : "Tile injected, observer stopped");
		}
	}, 800);

	// MutationObserver as secondary catch
	var observer = new MutationObserver(function () {
		tryInjectTile();
	});
	observer.observe(document.body, { childList: true, subtree: true });

	// Auto-disconnect observer after 15 s
	setTimeout(function () {
		observer.disconnect();
		document.getElementById("addsol-home-tile") && debug("Observer disconnected (tile found)");
	}, 15000);
}

function tryInjectTile() {
	if (document.getElementById("addsol-home-tile")) return;

	// Try all known grid containers from Frappe v14 and v15
	var grid = findAnchor([
		".workspace-grid",        // Frappe v15
		".module-grid",           // Frappe v14 common
		".modules-list",          // Frappe v14 alternative
		".desk-sidebar .modules-list", // older Frappe
	]);

	if (!grid) return;

	debug("Grid container found — injecting tile");

	var tile = document.createElement("a");
	tile.id = "addsol-home-tile";
	tile.href = "/addsol_ui";
	tile.className = "workspace-card";
	tile.title = "Open Addsol UI";

	// Let the grid's own layout apply (flex/grid), just set visual style
	tile.style.cssText = [
		"display:flex",
		"flex-direction:column",
		"align-items:center",
		"justify-content:center",
		"gap:10px",
		"padding:24px 16px",
		"border-radius:12px",
		"background:linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)",
		"color:#fff !important",
		"text-decoration:none",
		"cursor:pointer",
		"border:none",
		"transition:transform .15s, box-shadow .15s",
		"min-height:120px",
	].join(";");

	tile.innerHTML =
		'<div style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;">' +
		'<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<rect x="3" y="3" width="7" height="7"></rect>' +
		'<rect x="14" y="3" width="7" height="7"></rect>' +
		'<rect x="3" y="14" width="7" height="7"></rect>' +
		'<rect x="14" y="14" width="7" height="7"></rect>' +
		"</svg>" +
		"</div>" +
		'<div style="font-size:14px;font-weight:600;text-align:center;color:#fff;">Addsol UI</div>' +
		'<div style="font-size:11px;opacity:0.8;text-align:center;color:#fff;">Tile-based interface</div>';

	// Hover effect
	tile.addEventListener("mouseenter", function () {
		this.style.transform = "translateY(-3px) scale(1.02)";
		this.style.boxShadow = "0 8px 25px rgba(79,70,229,0.35)";
	});
	tile.addEventListener("mouseleave", function () {
		this.style.transform = "";
		this.style.boxShadow = "";
	});

	grid.appendChild(tile);
	debug("Tile injected successfully");
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function findAnchor(selectors) {
	for (var i = 0; i < selectors.length; i++) {
		var el = document.querySelector(selectors[i]);
		if (el) return el;
	}
	return null;
}

function debug(msg) {
	if (window.console) console.log("[AddsolUI] " + msg);
}
