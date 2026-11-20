// The backend independently validates these endpoints before sending credentials.
frappe.ui.form.on("UI Quotation AI Settings", {
	provider(frm) {
		const endpoints = {
			OpenAI: "https://api.openai.com/v1/responses",
			"OpenCode Zen": "https://opencode.ai/zen/v1/responses",
			OpenRouter: "https://openrouter.ai/api/v1/chat/completions",
		};
		if (frm.doc.provider && endpoints[frm.doc.provider]) {
			frm.set_value("endpoint", endpoints[frm.doc.provider]);
			frappe.show_alert({ message: __("Use a model and API key for the selected provider."), indicator: "blue" });
		}
	},
});
