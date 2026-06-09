/**
 * Load the Vite manifest to resolve hashed filenames for cache busting.
 * Falls back to unhashed names (main.js / erp-ui.css) if manifest is unavailable.
 */
async function loadErpUIBuild(containerId) {
	const MANIFEST_URL = "/assets/erpnext_ui/erp_ui/.vite/manifest.json";
	const ASSETS_BASE = "/assets/erpnext_ui/erp_ui";

	try {
		const res = await fetch(MANIFEST_URL);
		const manifest = await res.json();
		const entry = manifest["src/main.jsx"] || {};
		const jsFile = entry.file || "main.js";
		const cssFiles = entry.css || [];
		const cssFile = cssFiles[0] || "erp-ui.css";

		if (!document.getElementById("erp-ui-css")) {
			const link = document.createElement("link");
			link.id = "erp-ui-css";
			link.rel = "stylesheet";
			link.href = `${ASSETS_BASE}/${cssFile}`;
			document.head.appendChild(link);
		}

		const script = document.createElement("script");
		script.src = `${ASSETS_BASE}/${jsFile}`;
		script.onload = function () {
			if (window.mountErpUI) {
				window.mountErpUI(containerId);
			}
		};
		document.body.appendChild(script);
	} catch (e) {
		console.warn("Failed to load Vite manifest, falling back to unhashed names.", e);
		// Fallback to unhashed filenames
		if (!document.getElementById("erp-ui-css")) {
			const link = document.createElement("link");
			link.id = "erp-ui-css";
			link.rel = "stylesheet";
			link.href = `${ASSETS_BASE}/erp-ui.css`;
			document.head.appendChild(link);
		}

		const script = document.createElement("script");
		script.src = `${ASSETS_BASE}/main.js`;
		script.onload = function () {
			if (window.mountErpUI) {
				window.mountErpUI(containerId);
			}
		};
		document.body.appendChild(script);
	}
}

frappe.pages["addsol-ui"].on_page_load = function (wrapper) {
	let page = frappe.ui.make_app_page({
		parent: wrapper,
		title: "",
		single_column: true,
	});

	$(".navbar").hide();
	$(".layout-side-section").hide();
	$(".sidebar-menu").hide();
	$(wrapper).find(".page-head").hide();
	$(".sticky-top").hide();

	// Clear default frappe styling
	$(wrapper).css({
		padding: "0",
		margin: "0",
		width: "100%",
		height: "100%",
		background: "transparent",
	});

	// Remove the 'container' class to drop Frappe's fixed-width constraints
	$(wrapper).find(".container").removeClass("container").addClass("container-fluid");

	// Force-apply full-width styles
	$(wrapper).find(".page-body").css({
		"max-width": "100%",
		padding: "0",
		margin: "0",
	});

	// Full-size wrapper
	$(page.body)
		.css({
			padding: "0",
			margin: "0",
			width: "100%",
			height: "100%",
			background: "transparent",
		})
		.html(`<div id="erp-ui-wrapper"><div id="react-root"></div></div>`);

	// Load the built JS/CSS via manifest resolution
	loadErpUIBuild("react-root");
};
