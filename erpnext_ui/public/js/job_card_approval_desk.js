/* Approve a specific Job Card rule, including private evidence when required. */
frappe.ui.form.on("Job Card", {
  refresh(frm) {
    if (!frm.is_new()) frm.add_custom_button(__("Approval history"), async () => {
      const response = await frappe.call({ method: "erpnext_ui.api.get_job_card_approval_history", args: { name: frm.doc.name } });
      const dialog = new frappe.ui.Dialog({ title: __("Approval history"), fields: [{ fieldname: "history", fieldtype: "HTML" }] });
      const wrapper = dialog.fields_dict.history.$wrapper.empty();
      if (!(response.message || []).length) $("<p></p>").text(__("No approval transactions recorded yet. Earlier approvals, if any, appear on their rules.")).appendTo(wrapper);
      for (const event of response.message || []) {
        const entry = $("<div class='border rounded p-3 mb-2'></div>").appendTo(wrapper);
        $("<strong></strong>").text([event.instruction, event.approval_point, event.perspective].filter(Boolean).join(" · ")).appendTo(entry);
        $("<p class='mb-1'></p>").text([event.approved_by, event.approved_at, event.approval_role].filter(Boolean).join(" · ")).appendTo(entry);
        if (event.remark) $("<p class='mb-1'></p>").text(event.remark).appendTo(entry);
        if (event.attachment) $("<p class='mb-1'></p>").text(__("Attachment: {0}", [event.attachment])).appendTo(entry);
      }
      dialog.show();
    });
    const pending = (frm.doc.custom_approval_rules || []).filter((rule) => !rule.approved_by);
    if (!pending.length || frm.doc.docstatus === 2) return;
    frm.add_custom_button(__("Approve operation rule"), () => {
      const choices = pending.map((rule, index) => ({ rule, label: `${index + 1}. ${rule.instruction_snapshot || rule.instruction || __("Approval")}` }));
      const dialog = new frappe.ui.Dialog({
        title: __("Approve operation rule"),
        fields: [
          { fieldname: "rule", fieldtype: "Select", label: __("Approval rule"), options: choices.map((choice) => choice.label).join("\n"), reqd: 1 },
          { fieldname: "remark", fieldtype: "Small Text", label: __("Approval note (optional)"), length: 1000 },
          { fieldname: "attachment", fieldtype: "HTML" },
        ],
        primary_action_label: __("Approve"),
        async primary_action(values) {
          const rule = choices.find((choice) => choice.label === values.rule)?.rule;
          if (!rule) return;
          const file = dialog.fields_dict.attachment.$wrapper.find("input[type=file]")[0]?.files?.[0];
          if (Number(rule.attachment_required) === 1 && !file) {
            frappe.msgprint(__("Attach a file before approving this rule."));
            return;
          }
          const form = new FormData();
          form.append("name", frm.doc.name);
          form.append("rule_name", rule.name);
          form.append("remark", values.remark || "");
          if (file) form.append("file", file);
          dialog.get_primary_btn().prop("disabled", true);
          try {
            const response = await fetch("/api/method/erpnext_ui.api.approve_operation_job_card", {
              method: "POST", body: form, credentials: "same-origin",
              headers: { "X-Frappe-CSRF-Token": frappe.csrf_token, Accept: "application/json" },
            });
            const result = await response.json();
            if (!response.ok || result.exc) {
              let message = __("Unable to approve the rule.");
              try {
                const messages = JSON.parse(result._server_messages || "[]");
                if (messages.length) message = JSON.parse(messages[0]).message || message;
              } catch { /* Use the generic message if the server did not provide one. */ }
              frappe.msgprint(message);
              return;
            }
            dialog.hide();
            await frm.reload_doc();
          } catch {
            frappe.msgprint(__("Unable to approve the rule. Please try again."));
          } finally { dialog.get_primary_btn().prop("disabled", false); }
        },
      });
      const wrapper = dialog.fields_dict.attachment.$wrapper;
      const render = () => {
        const rule = choices.find((choice) => choice.label === dialog.get_value("rule"))?.rule;
        wrapper.empty();
        if (Number(rule?.attachment_required) === 1) {
          $("<label></label>").text(__("Attachment required")).appendTo(wrapper);
          $("<input type='file' class='form-control'>").appendTo(wrapper);
        }
      };
      dialog.fields_dict.rule.df.onchange = render;
      dialog.show();
      render();
    });
  },
});
