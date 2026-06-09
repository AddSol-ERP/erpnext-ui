/**
 * Adds a "Custom UI" button to the Frappe desk navbar for easy navigation
 * back to the tile-based SPA. The button appears just before the user avatar
 * dropdown in the top-right navbar area.
 *
 * This file is injected into every desk page via the `app_include_js` hook.
 */

frappe.ready(function () {
	// Short delay to ensure the desk navbar is fully rendered
	setTimeout(addCustomUIButton, 300);
});

function addCustomUIButton() {
	// Avoid duplicates
	if (document.getElementById("addsol-custom-ui-btn")) return;

	// Find the user dropdown — the anchor point for insertion
	const selectors = [
		".navbar-user-dropdown",
		'li.nav-item.dropdown[data-target="#navbar-user-popover"]',
		".navbar-nav .nav-item:last-child",
		"#navbar-user-popover",
	];
	let userDropdown = null;
	for (const sel of selectors) {
		userDropdown = document.querySelector(sel);
		if (userDropdown) break;
	}

	// If no anchor found, bail out
	if (!userDropdown) return;

	// Decide target: insert before the user dropdown's parent <li> or the element itself
	const target =
		userDropdown.closest?.("li.nav-item") ||
		userDropdown.closest?.(".nav-item") ||
		userDropdown;

	// Create the button list item
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

	// SVG grid icon matching the app tile
	link.innerHTML = `
		<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
			stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<rect x="3" y="3" width="7" height="7"></rect>
			<rect x="14" y="3" width="7" height="7"></rect>
			<rect x="3" y="14" width="7" height="7"></rect>
			<rect x="14" y="14" width="7" height="7"></rect>
		</svg>
		Custom UI
	`;

	li.appendChild(link);
	target.parentNode.insertBefore(li, target);
}
