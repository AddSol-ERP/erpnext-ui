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

	if (!document.getElementById("erp-ui-css")) {
		const link = document.createElement("link");
		link.id = "erp-ui-css";
		link.rel = "stylesheet";
		link.href = "/assets/erpnext_ui/erp_ui/erp-ui.css";
		document.head.appendChild(link);
	}

	const script = document.createElement("script");
	script.src = "/assets/erpnext_ui/erp_ui/main.js";
	script.onload = function () {
		if (window.mountErpUI) {
			window.mountErpUI("react-root");
		}
	};
	document.body.appendChild(script);
};
