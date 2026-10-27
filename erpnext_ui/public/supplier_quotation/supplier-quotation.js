/*
 * Supplier quotation response page.
 *
 * The access token rides in the URL fragment, never the query string, so the
 * server never sees it in access logs. Nothing is rendered from the invitation
 * until the OTP has been verified; until then the only data on the page is the
 * masked recipient email and the brand name.
 */
(function () {
  "use strict";

  const API_BASE = "/api/method/erpnext_ui.supplier_quotation.";
  const CSRF =
    document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ||
    (window.frappe && frappe.csrf_token) ||
    window.__SUPPLIER_QUOTATION_CSRF__ ||
    "";

  const $ = (id) => document.getElementById(id);

  const els = {
    loading: $("loading-card"),
    gate: $("gate-card"),
    form: $("form-card"),
    review: $("review-card"),
    success: $("success-card"),
    brandName: $("brand-name"),
    customerName: $("customer-name"),
    gateTitle: $("gate-title"),
    gateMessage: $("gate-message"),
    gateHint: $("gate-hint"),
    gateAlert: $("gate-alert"),
    gateActions: $("gate-actions"),
    gateNote: $("gate-note"),
    otpForm: $("otp-form"),
    otpInput: $("otp-input"),
    verifyButton: $("verify-button"),
    requestTitle: $("request-title"),
    requestMeta: $("request-meta"),
    documentSection: $("document-section"),
    documentFields: $("document-fields"),
    itemsList: $("items-list"),
    formAlert: $("form-alert"),
    reviewSummary: $("review-summary"),
    reviewBody: $("review-body"),
    reviewAlert: $("review-alert"),
    successMeta: $("success-meta"),
  };

  const state = {
    token: "",
    session: "",
    invitation: null,
    form: null,
    values: { document: {}, items: {} },
    submitting: false,
  };

  /* ------------------------------------------------------------------ */
  /* HTTP                                                               */
  /* ------------------------------------------------------------------ */

  function serverMessage(json, status) {
    const raw = json?._server_messages;
    if (raw) {
      try {
        const entries = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(entries) && entries.length) {
          let entry = entries[0];
          if (typeof entry === "string") {
            try {
              entry = JSON.parse(entry);
            } catch (_) {
              return entry;
            }
          }
          if (entry && typeof entry === "object" && entry.message) {
            return stripTags(entry.message);
          }
        }
      } catch (_) {
        // Fall through to the exception/HTTP label below.
      }
    }
    return json?.message || json?.exc || `Request failed (${status})`;
  }

  function stripTags(value) {
    try {
      const doc = new DOMParser().parseFromString(String(value), "text/html");
      return doc.body.textContent || "";
    } catch (_) {
      return String(value).replace(/<[^>]*>/g, "");
    }
  }

  async function api(method, args) {
    const headers = { "Content-Type": "application/json" };
    if (CSRF) headers["X-Frappe-CSRF-Token"] = CSRF;

    let response;
    try {
      response = await fetch(API_BASE + method, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify(args || {}),
      });
    } catch (_) {
      throw new Error("Could not reach the server. Check your connection and try again.");
    }

    let json = null;
    try {
      json = await response.json();
    } catch (_) {
      // Keep going: status and a generic message are still useful.
    }

    if (!response.ok) {
      throw new Error(serverMessage(json, response.status));
    }
    return json?.message;
  }

  /* ------------------------------------------------------------------ */
  /* UI helpers                                                         */
  /* ------------------------------------------------------------------ */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function show(node) {
    node.classList.remove("hidden");
  }

  function hide(node) {
    node.classList.add("hidden");
  }

  function hideAllCards() {
    [els.loading, els.gate, els.form, els.review, els.success].forEach(hide);
  }

  function setAlert(node, message) {
    if (!message) {
      node.textContent = "";
      hide(node);
      return;
    }
    node.textContent = message;
    show(node);
  }

  function clearAlert(node) {
    setAlert(node, "");
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toDateInput(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function toDateTimeInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
      date.getHours(),
    )}:${pad(date.getMinutes())}`;
  }

  function displayValue(field, value) {
    if (value === null || value === undefined || value === "") return "—";
    if (field.fieldtype === "Check") return value ? "Yes" : "No";
    if (field.fieldtype === "Date") return formatDate(value);
    if (field.fieldtype === "Datetime") return formatDateTime(value);
    if (field.fieldtype === "Text Editor") return stripTags(String(value));
    return String(value);
  }

  function setBrand(invitation) {
    const brand =
      invitation?.brand_name ||
      window.supplierQuotationBrand ||
      els.brandName?.textContent ||
      "Supplier Quotation";
    if (els.brandName) els.brandName.textContent = brand;
    if (els.customerName) {
      els.customerName.textContent = invitation?.customer_name || brand;
    }
    if (!invitation?.brand_name) document.title = `${brand} — Supplier response`;
    if (invitation?.brand_name) document.title = `${invitation.brand_name} — Supplier response`;
    const colour = invitation?.brand_color || "";
    if (/^#[0-9a-fA-F]{3,8}$/.test(colour)) {
      document.documentElement.style.setProperty("--brand", colour);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Gate / OTP                                                         */
  /* ------------------------------------------------------------------ */

  function gateButton(label, handler, primary) {
    const button = el("button", primary ? "btn btn-primary" : "btn btn-quiet", label);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }

  function setGate(title, message, options) {
    options = options || {};
    hideAllCards();
    show(els.gate);
    els.gateTitle.textContent = title;
    els.gateMessage.textContent = message || "";
    clearAlert(els.gateAlert);

    if (options.hint) {
      els.gateHint.textContent = options.hint;
      show(els.gateHint);
    } else {
      hide(els.gateHint);
    }

    els.gateActions.replaceChildren();
    (options.actions || []).forEach((action) => {
      els.gateActions.appendChild(gateButton(action.label, action.onClick, action.primary));
    });

    els.otpForm.classList.toggle("hidden", !options.showOtp);
    els.gateNote.textContent = options.note || "";
    if (!options.note) hide(els.gateNote);
    else show(els.gateNote);
  }

  function showSendCodeGate(invitation, message) {
    // An OTP only exists while the invitation is `Sent`. After verification it
    // is cleared and the state becomes `OTP Verified`, so a lost browser
    // session must start with a fresh code rather than showing an input whose
    // code no longer exists.
    const sent = invitation.state === "Sent" && Boolean(invitation.otp_sent_on);
    const previousSessionEnded = invitation.state === "OTP Verified";
    setGate(
      "Confirm your email",
      previousSessionEnded
        ? "Your previous response session ended before submission. Request a new code to continue."
        : message,
      {
        hint: `A 6-digit verification code will be sent to ${invitation.email_hint}.`,
        actions: [
          {
            label: sent ? "Send a new code" : "Send verification code",
            primary: true,
            onClick: (event) => sendOtp(event.currentTarget),
          },
        ],
        showOtp: sent,
        note: sent ? "Enter the most recent code we emailed you." : "",
      },
    );
    if (sent) els.otpInput.focus();
  }

  async function sendOtp(button) {
    clearAlert(els.gateAlert);
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      const result = await api("request_supplier_quotation_otp", { token: state.token });
      show(els.otpForm);
      els.gateNote.textContent = `Code sent to ${result.email_hint}. It expires in ${
        result.expires_in_minutes
      } minutes.`;
      show(els.gateNote);
      els.gateActions.replaceChildren();
      els.gateActions.appendChild(
        gateButton("Send a new code", (event) => sendOtp(event.currentTarget), false),
      );
      els.otpInput.value = "";
      els.otpInput.focus();
    } catch (error) {
      setAlert(els.gateAlert, error.message);
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    clearAlert(els.gateAlert);
    const otp = (els.otpInput.value || "").trim();
    if (!/^[0-9]{6}$/.test(otp)) {
      setAlert(els.gateAlert, "Enter the 6-digit code from the email.");
      els.otpInput.focus();
      return;
    }

    els.verifyButton.disabled = true;
    els.verifyButton.textContent = "Verifying…";
    try {
      const result = await api("verify_supplier_quotation_otp", {
        token: state.token,
        otp,
      });
      state.session = result.session;
      sessionStorage.setItem(sessionKey(), result.session);
      renderForm(result.form);
    } catch (error) {
      setAlert(els.gateAlert, error.message);
    } finally {
      els.verifyButton.disabled = false;
      els.verifyButton.textContent = "Verify and continue";
    }
  }

  function sessionKey() {
    return `supplier-quotation-session:${state.token}`;
  }

  /* ------------------------------------------------------------------ */
  /* Response form                                                      */
  /* ------------------------------------------------------------------ */

  function renderForm(form) {
    state.form = form;
    state.values = { document: {}, items: {} };
    hideAllCards();
    show(els.form);
    clearAlert(els.formAlert);

    els.requestTitle.textContent = form.material_request;
    const meta = [];
    if (form.supplier_name || form.supplier) meta.push(form.supplier_name || form.supplier);
    if (form.required_by) meta.push(`Required by ${formatDate(form.required_by)}`);
    if (form.currency) meta.push(form.currency);
    els.requestMeta.textContent = meta.join(" · ");

    renderDocumentSection(form);
    renderItems(form);
    showCommonStep();

    els.reviewSummary.replaceChildren();
    els.reviewBody.replaceChildren();
    const first = $("common-step").querySelector("input, select, textarea, [contenteditable]");
    if (first) {
      if (first.matches("[contenteditable]")) {
        first.focus({ preventScroll: true });
      } else {
        first.focus();
      }
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showCommonStep() {
    show($("common-step"));
    hide($("items-step"));
    $("step-one-indicator")?.classList.add("active");
    $("step-two-indicator")?.classList.remove("active");
  }

  function showItemsStep() {
    hide($("common-step"));
    show($("items-step"));
    $("step-one-indicator")?.classList.remove("active");
    $("step-two-indicator")?.classList.add("active");
    const first = $("items-list")?.querySelector("input, select, textarea, [contenteditable]");
    first?.focus();
  }

  function renderDocumentSection(form) {
    const context = [
      { label: "Material Request", value: form.material_request },
      { label: "Supplier", value: form.supplier_name || form.supplier },
      { label: "Company", value: form.company },
      { label: "Required by", value: form.required_by, fieldtype: "Date" },
      { label: "Currency", value: form.currency },
      ...(form.document?.context || []),
    ].filter((field) => field.value !== null && field.value !== undefined && field.value !== "");
    const fields = form.document?.fields || [];
    show(els.documentSection);
    els.documentFields.replaceChildren();

    if (context.length) {
      els.documentFields.appendChild(contextGrid(context));
    }
    fields.forEach((field) => {
      state.values.document[field.fieldname] = initialValue(field);
      els.documentFields.appendChild(buildField(field, "document", null));
    });
  }

  function renderItems(form) {
    els.itemsList.replaceChildren();
    const items = form.items || [];
    if (!items.length) return;

    const firstItem = items[0];
    const contextFields = firstItem.context || [];
    const inputFields = firstItem.fields || [];
    const identityNames = ["item_name", "description"];
    const identityFields = contextFields.filter((field) => identityNames.includes(field.fieldname));
    const remainingContextFields = contextFields.filter(
      (field) => !identityNames.includes(field.fieldname) && !["qty", "uom"].includes(field.fieldname),
    );
    const hasFullIdentity = identityNames.every((fieldname) =>
      identityFields.some((field) => field.fieldname === fieldname),
    );
    const desktopIdentityFields = hasFullIdentity ? identityFields : [];
    const table = el("table", "items-table");
    table.setAttribute("aria-label", "Requested items and supplier quotation fields");

    const columns = [
      { label: "Item", className: "item-column" },
      ...inputFields.map((field) => {
        let label = field.mandatory ? `${field.label} *` : field.label;
        if (field.fieldname === "rate" && firstItem && firstItem.uom) {
          label = field.mandatory ? `${field.label} (${firstItem.uom}) *` : `${field.label} (${firstItem.uom})`;
        }
        return {
          label,
          help: field.help_text,
        };
      }),
      { label: "Requested Qty" },
      ...remainingContextFields.map((field) => ({ label: field.label, help: field.help_text })),
    ];

    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    columns.forEach((column) => {
      const cell = el("th", column.className || "", column.label);
      cell.scope = "col";
      if (column.help) cell.title = column.help;
      headerRow.appendChild(cell);
    });
    head.appendChild(headerRow);
    table.appendChild(head);

    const body = document.createElement("tbody");
    items.forEach((item) => {
      state.values.items[item.item] = {};
      const row = document.createElement("tr");
      row.dataset.item = item.item;
      const itemCell = el("th", "item-column mobile-item-summary");
      itemCell.scope = "row";
      itemCell.appendChild(el("strong", "item-title", item.item_name || item.item_code || "Item"));
      if (item.description) itemCell.appendChild(el("p", "item-desc", item.description));
      row.appendChild(itemCell);

      inputFields.forEach((field) => {
        const itemField = (item.fields || []).find((candidate) => candidate.fieldname === field.fieldname) || field;
        state.values.items[item.item][itemField.fieldname] = initialValue(itemField);
        const cell = document.createElement("td");
        let label = itemField.mandatory ? `${itemField.label} *` : itemField.label;
        if (itemField.fieldname === "rate" && item.uom) {
          label = itemField.mandatory ? `${itemField.label} (${item.uom}) *` : `${itemField.label} (${item.uom})`;
        }
        cell.dataset.label = label;
        cell.appendChild(buildField(itemField, "item", item.item, true));
        row.appendChild(cell);
      });

      const quantity = el("td", "quantity-cell");
      quantity.dataset.label = "Requested Qty";
      quantity.appendChild(el("span", "quantity-value", formatQuantity(item.qty)));
      quantity.appendChild(el("span", "quantity-uom", item.uom || ""));
      row.appendChild(quantity);

      remainingContextFields.forEach((field) => {
        const itemField = (item.context || []).find((candidate) => candidate.fieldname === field.fieldname) || field;
        const cell = el("td", "context-value", displayValue(itemField, itemField.value));
        cell.dataset.label = itemField.label;
        row.appendChild(cell);
      });

      body.appendChild(row);
    });
    table.appendChild(body);
    els.itemsList.appendChild(table);
  }

  function formatQuantity(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return value == null ? "" : String(value);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(number);
  }

  function contextGrid(fields) {
    const list = el("dl", "context-grid");
    fields.forEach((field) => {
      const row = el("div");
      row.appendChild(el("dt", null, field.label));
      row.appendChild(el("dd", null, displayValue(field, field.value)));
      list.appendChild(row);
    });
    return list;
  }

  function initialValue(field) {
    if (field.fieldtype === "Check") return field.value ? 1 : 0;
    if (field.fieldtype === "Text Editor") {
      return field.value === null || field.value === undefined ? "" : String(field.value);
    }
    return field.value === null || field.value === undefined ? "" : field.value;
  }

  function fieldId(scope, itemName, fieldname) {
    const suffix = itemName ? String(itemName) : "document";
    return `field-${scope}-${suffix}-${fieldname}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  }

  function buildField(field, scope, itemName, compact = false) {
    const id = fieldId(scope, itemName, field.fieldname);
    const wrapClass = field.fieldtype === "Check" ? "field checkbox-row" : "field";
    const wrap = el("div", compact ? `${wrapClass} table-input-field` : wrapClass);

    const control =
      field.fieldtype === "Select" || field.link_options
        ? buildSelect(field, id)
        : field.fieldtype === "Check"
          ? buildCheckbox(field, id)
          : field.fieldtype === "Text Editor"
            ? buildRichTextEditor(field, id)
            : buildInput(field, id);

    control.dataset.scope = scope;
    control.dataset.field = field.fieldname;
    if (itemName) control.dataset.item = itemName;
    control.id = id;

    const write = () => {
      let value;
      if (field.fieldtype === "Check") {
        value = control.checked ? 1 : 0;
      } else if (field.fieldtype === "Text Editor" && control._getValue) {
        value = control._getValue();
      } else {
        value = control.value;
      }
      if (scope === "document") {
        state.values.document[field.fieldname] = value;
      } else {
        state.values.items[itemName][field.fieldname] = value;
      }
    };
    if (field.fieldtype === "Text Editor") {
      // events handled by editor
    } else {
      control.addEventListener("input", write);
      control.addEventListener("change", write);
    }
    if (field.fieldtype === "Text Editor" && control._attachWrite) {
      control._attachWrite(write);
    } else if (field.fieldtype === "Text Editor") {
      const editorEl = control.querySelector(".rich-editor") || control;
      editorEl.addEventListener("input", write);
      editorEl.addEventListener("blur", write);
    }

    if (compact) {
    if (field.fieldtype === "Text Editor") {
      wrap.appendChild(control);
    } else {
      control.setAttribute("aria-label", `${field.label}${field.mandatory ? " (required)" : ""}`);
      if (field.help_text) control.title = field.help_text;
      wrap.appendChild(control);
    }
  } else if (field.fieldtype === "Check") {
    const label = el("label", null, field.label);
    label.htmlFor = id;
    wrap.appendChild(control);
    wrap.appendChild(label);
  } else {
    const label = el("label", null, field.mandatory ? `${field.label} *` : field.label);
    label.htmlFor = id;
    wrap.appendChild(label);
    wrap.appendChild(control);
  }

    if (field.help_text && !compact) {
      wrap.appendChild(el("span", "help", field.help_text));
    }
    return wrap;
  }

  function buildInput(field, id) {
    let tag = "input";
    let type = "text";
    if (["Small Text", "Text", "Long Text"].includes(field.fieldtype)) {
      tag = "textarea";
    } else if (field.fieldtype === "Date") {
      type = "date";
    } else if (field.fieldtype === "Datetime") {
      type = "datetime-local";
    } else if (["Int", "Float", "Currency", "Percent"].includes(field.fieldtype)) {
      type = "number";
    } else if (field.fieldtype === "Email") {
      type = "email";
    } else if (field.fieldtype === "Phone") {
      type = "tel";
    } else if (field.fieldtype === "Data" && field.options === "Email") {
      type = "email";
    } else if (field.fieldtype === "Data" && field.options === "Phone") {
      type = "tel";
    }

    const control = document.createElement(tag);
    if (tag === "textarea") control.rows = field.fieldtype === "Long Text" ? 6 : 3;
    else control.type = type;

    if (field.fieldtype === "Int") control.step = "1";
    if (["Float", "Currency", "Percent"].includes(field.fieldtype)) control.step = "any";
    if (field.fieldtype === "Date" && field.value) control.value = toDateInput(field.value);
    if (field.fieldtype === "Datetime" && field.value) control.value = toDateTimeInput(field.value);
    if (!control.value && field.value !== null && field.value !== undefined) {
      control.value = String(field.value);
    }
    if (field.fieldtype === "Link") {
      control.placeholder = field.options ? `Enter ${field.options}` : "Enter a value";
    }
    if (field.mandatory) control.required = true;

    // Required is enforced on review (a browser bubble on a hidden review step
    // would name a field the user can no longer see). Keep native validation
    // off for the whole form for the same reason.
    if (tag !== "textarea") control.autocomplete = "off";
    return control;
  }

  function buildSelect(field, id) {
    const control = document.createElement("select");
    if (Array.isArray(field.link_options) && field.link_options.length) {
      control.appendChild(new Option("Select…", ""));
      const current = field.value === null || field.value === undefined ? "" : String(field.value);
      let hasCurrent = false;
      field.link_options.forEach((opt) => {
        const value = opt.value !== undefined ? String(opt.value) : "";
        const label = opt.label !== undefined ? String(opt.label) : value;
        if (value === current) hasCurrent = true;
        control.appendChild(new Option(label, value));
      });
      if (current && !hasCurrent) {
        control.appendChild(new Option(current, current));
      }
      control.value = current;
    } else {
      const options = String(field.options || "")
        .split("\n")
        .map((option) => option.trim())
        .filter(Boolean);
      control.appendChild(new Option("Select…", ""));
      const current = field.value === null || field.value === undefined ? "" : String(field.value);
      if (current && !options.includes(current)) options.unshift(current);
      options.forEach((option) => control.appendChild(new Option(option, option)));
      control.value = current;
    }
    control.id = id;
    return control;
  }

  function buildCheckbox(field, id) {
    const control = document.createElement("input");
    control.type = "checkbox";
    control.checked = Boolean(field.value);
    control.id = id;
    return control;
  }

  function buildRichTextEditor(field, id) {
    const wrapper = document.createElement("div");
    wrapper.className = "rich-editor-wrap";
    wrapper.id = id;

    const toolbar = document.createElement("div");
    toolbar.className = "rich-toolbar";

    function cmd(name) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rich-btn";
      button.innerHTML = name === "ul" ? "•" : name === "ol" ? "1." : name === "bold" ? "<b>B</b>" : name === "italic" ? "<i>I</i>" : name === "underline" ? "<u>U</u>" : name;
      button.addEventListener("click", (e) => {
        e.preventDefault();
        editor.focus();
        if (name === "ul") document.execCommand("insertUnorderedList");
        else if (name === "ol") document.execCommand("insertOrderedList");
        else document.execCommand(name);
      });
      return button;
    }

    toolbar.appendChild(cmd("bold"));
    toolbar.appendChild(cmd("italic"));
    toolbar.appendChild(cmd("underline"));
    toolbar.appendChild(cmd("ul"));
    toolbar.appendChild(cmd("ol"));
    wrapper.appendChild(toolbar);

    const editor = document.createElement("div");
    editor.className = "rich-editor";
    editor.contentEditable = "true";
    editor.innerHTML = field.value === null || field.value === undefined ? "" : String(field.value);
    wrapper.appendChild(editor);

    wrapper._getValue = () => editor.innerHTML;
    let writeHandler = null;
    wrapper._attachWrite = (fn) => {
      writeHandler = fn;
    };
    editor.addEventListener("input", () => {
      if (writeHandler) writeHandler();
    });
    editor.addEventListener("blur", () => {
      if (writeHandler) writeHandler();
    });
    editor.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, text);
    });

    return wrapper;
  }

  /* ------------------------------------------------------------------ */
  /* Review / submit                                                    */
  /* ------------------------------------------------------------------ */

  function isEmpty(value, field) {
    if (field.fieldtype === "Check") return !value;
    if (value === null || value === undefined) return true;
    if (field.fieldtype === "Text Editor") {
      const text = stripTags(String(value)).trim();
      return text === "" || text === "0";
    }
    const text = String(value).trim();
    return text === "" || text === "0";
  }

  function findMissingDocumentFields(form) {
    return (form.document?.fields || [])
      .filter((field) => field.mandatory && isEmpty(state.values.document[field.fieldname], field))
      .map((field) => ({ field, scope: "document", item: null }));
  }

  function findMissingItemFields(form) {
    const missing = [];
    (form.items || []).forEach((item) => {
      (item.fields || []).forEach((field) => {
        if (field.mandatory && isEmpty(state.values.items[item.item]?.[field.fieldname], field)) {
          missing.push({ field, scope: "item", item: item.item });
        }
      });
    });
    return missing;
  }

  function continueToItems() {
    const missing = findMissingDocumentFields(state.form);
    if (missing.length) {
      showMissingFields(missing);
      return;
    }
    showItemsStep();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showReview() {
    clearAlert(els.formAlert);
    const missing = findMissingItemFields(state.form);
    if (missing.length) {
      showMissingFields(missing);
      return;
    }

    hideAllCards();
    show(els.review);
    clearAlert(els.reviewAlert);
    renderReviewSummary();
    els.reviewBody.replaceChildren();

    const currency = state.form.currency;
    const documentFields = state.form.document?.fields || [];
    if (documentFields.length) {
      els.reviewBody.appendChild(reviewDocumentSection(documentFields, currency));
    }

    const items = state.form.items || [];
    if (items.length) {
      els.reviewBody.appendChild(reviewItemsSection(items, currency));
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showMissingFields(missing) {
    els.formAlert.replaceChildren();
    els.formAlert.appendChild(
      el("p", "alert-title", "Complete the required fields before reviewing:"),
    );

    const list = el("ul", "alert-list");
    missing.forEach((entry) => {
      const item = state.form.items?.find((candidate) => candidate.item === entry.item);
      const suffix = item ? ` — ${item.item_name || item.item_code || "Item"}` : "";
      const button = el("button", "link-button", `${entry.field.label}${suffix}`);
      button.type = "button";
      button.addEventListener("click", () => {
        focusFormField(entry.scope, entry.item, entry.field.fieldname);
      });
      const row = document.createElement("li");
      row.appendChild(button);
      list.appendChild(row);
    });
    els.formAlert.appendChild(list);
    show(els.formAlert);

    const first = missing[0];
    focusFormField(first.scope, first.item, first.field.fieldname);
  }

  function renderReviewSummary() {
    els.reviewSummary.replaceChildren();
    const items = state.form.items || [];
    const summary = [
      ["Supplier", state.form.supplier_name || state.form.supplier],
      ["Required by", state.form.required_by ? formatDate(state.form.required_by) : ""],
      ["Currency", state.form.currency],
      ["Items", `${items.length} ${items.length === 1 ? "item" : "items"}`],
    ];

    summary.forEach(([label, value]) => {
      if (!value) return;
      const tile = el("div", "review-summary-item");
      tile.appendChild(el("span", "review-summary-label", label));
      tile.appendChild(el("strong", "review-summary-value", value));
      els.reviewSummary.appendChild(tile);
    });
  }

  function reviewDocumentSection(fields, currency) {
    const section = el("section", "review-section");
    section.appendChild(
      reviewSectionHead(
        "Quotation details",
        "The values you entered for this quotation.",
        "Edit details",
        () => returnToField("document"),
      ),
    );

    const list = el("dl", "review-fields");
    fields.forEach((field) => {
      list.appendChild(reviewField(field, state.values.document[field.fieldname], currency));
    });
    section.appendChild(list);
    return section;
  }

  function reviewItemsSection(items, currency) {
    const section = el("section", "review-section");
    section.appendChild(
      reviewSectionHead(
        "Quotation items",
        `${items.length} ${items.length === 1 ? "item is" : "items are"} included in this response.`,
      ),
    );

    const list = el("div", "review-items");
    items.forEach((item, index) => {
      list.appendChild(reviewItem(item, index, currency));
    });
    section.appendChild(list);
    return section;
  }

  function reviewSectionHead(title, subtitle, editLabel, onEdit) {
    const head = el("div", "review-section-head");
    const copy = el("div");
    copy.appendChild(el("h3", null, title));
    if (subtitle) copy.appendChild(el("p", "muted small", subtitle));
    head.appendChild(copy);

    if (editLabel) {
      const button = el("button", "review-edit-link", editLabel);
      button.type = "button";
      button.addEventListener("click", onEdit);
      head.appendChild(button);
    }
    return head;
  }

  function reviewItem(item, index, currency) {
    const card = el("article", "review-item");
    const head = el("div", "review-item-head");
    const identity = el("div", "review-item-identity");
    identity.appendChild(el("span", "review-item-index", index + 1));

    const copy = el("div", "review-item-copy");
    copy.appendChild(el("h4", "review-item-name", item.item_name || item.item_code || "Item"));
    const meta = [];
    if (item.item_code && item.item_name) meta.push(item.item_code);
    meta.push(`${formatQuantity(item.qty)} ${item.uom || ""}`.trim());
    copy.appendChild(el("p", "review-item-meta", meta.join(" · ")));

    identity.appendChild(copy);
    head.appendChild(identity);

    const edit = el("button", "review-edit-link", "Edit item");
    edit.type = "button";
    edit.addEventListener("click", () => returnToItem(item));
    head.appendChild(edit);
    card.appendChild(head);

    const fields = item.fields || [];
    if (fields.length) {
      const list = el("dl", "review-fields review-fields-item");
      fields.forEach((field) => {
        list.appendChild(
          reviewField(field, state.values.items[item.item]?.[field.fieldname], currency),
        );
      });
      card.appendChild(list);
    }
    return card;
  }

  function reviewField(field, value, currency) {
    const row = el("div", "review-field");
    row.appendChild(el("dt", null, field.label));
    const display = reviewValue(field, value, currency);
    const dd = el("dd", display.empty ? "review-value review-empty" : "review-value");
    if (display.node) {
      dd.appendChild(display.node);
    } else {
      dd.textContent = display.text;
    }
    row.appendChild(dd);
    return row;
  }

  function reviewValue(field, value, currency) {
    if (value === null || value === undefined || value === "") {
      return { text: "Not provided", empty: true };
    }
    if (field.fieldtype === "Check") return { text: value ? "Yes" : "No" };
    if (field.fieldtype === "Date") return { text: formatDate(value) };
    if (field.fieldtype === "Datetime") return { text: formatDateTime(value) };
    if (field.fieldtype === "Text Editor") {
      const text = stripTags(String(value)).trim();
      if (!text) return { text: "Not provided", empty: true };
      const dd = document.createElement("div");
      dd.className = "review-rich";
      dd.innerHTML = String(value);
      return { node: dd, empty: false };
    }
    if (field.fieldtype === "Int") {
      return { text: formatNumber(value, { maximumFractionDigits: 0 }) };
    }
    if (field.fieldtype === "Float") {
      return { text: formatNumber(value, { maximumFractionDigits: 4 }) };
    }
    if (field.fieldtype === "Percent") {
      return { text: `${formatNumber(value, { maximumFractionDigits: 2 })}%` };
    }
    if (field.fieldtype === "Currency") {
      return { text: formatCurrency(value, currency) };
    }
    return { text: String(value) };
  }

  function formatNumber(value, options) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return new Intl.NumberFormat(undefined, options || {}).format(number);
  }

  function formatCurrency(value, currency) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    if (currency && /^[A-Z]{3}$/.test(currency)) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(number);
      } catch (_) {
        // Fall through to a plain number when the currency code is unknown.
      }
    }
    const formatted = formatNumber(number, { maximumFractionDigits: 2 });
    return currency ? `${formatted} ${currency}` : formatted;
  }

  function returnToField(scope, itemName, fieldname) {
    hideAllCards();
    show(els.form);
    if (scope === "item") showItemsStep();
    else showCommonStep();
    clearAlert(els.formAlert);
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => focusFormField(scope, itemName, fieldname));
  }

  function returnToItem(item) {
    const first = (item.fields || [])[0];
    returnToField("item", item.item, first ? first.fieldname : null);
  }

  function focusFormField(scope, itemName, fieldname) {
    let target = fieldname
      ? document.getElementById(fieldId(scope, itemName, fieldname))
      : scope === "document"
        ? els.documentSection
        : findItemRow(itemName);

    if (!target) return;
    if (!target.matches("input, select, textarea, [contenteditable]")) {
      const control = target.querySelector("input, select, textarea, [contenteditable]");
      target = control || els.form.querySelector("input, select, textarea, [contenteditable]") || target;
    }

    if (target.matches("[contenteditable]")) {
      target.focus({ preventScroll: true });
      try {
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (_) {}
    } else {
      target.focus({ preventScroll: true });
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    flash(target.closest(".field, .table-input-field, .rich-editor-wrap, tr") || target);
  }

  function findItemRow(itemName) {
    return (
      Array.from(els.itemsList.querySelectorAll("[data-item]")).find(
        (row) => row.dataset.item === itemName,
      ) || els.itemsList
    );
  }

  function flash(node) {
    if (!node) return;
    node.classList.remove("is-highlighted");
    // Force a reflow so clicking Edit repeatedly re-runs the animation.
    void node.offsetWidth;
    node.classList.add("is-highlighted");
    window.setTimeout(() => node.classList.remove("is-highlighted"), 1600);
  }

  function buildRowsPayload() {
    return (state.form.items || []).map((item) => {
      const values = {};
      (item.fields || []).forEach((field) => {
        values[field.fieldname] = state.values.items[item.item]?.[field.fieldname];
      });
      return { item: item.item, values };
    });
  }

  function buildDocumentPayload() {
    const values = {};
    (state.form.document?.fields || []).forEach((field) => {
      values[field.fieldname] = state.values.document[field.fieldname];
    });
    return values;
  }

  async function submitResponse() {
    if (state.submitting) return;
    state.submitting = true;
    const button = $("submit-button");
    button.disabled = true;
    button.textContent = "Submitting…";
    clearAlert(els.reviewAlert);

    try {
      const result = await api("submit_supplier_quotation_response", {
        session: state.session,
        rows: JSON.stringify(buildRowsPayload()),
        document: JSON.stringify(buildDocumentPayload()),
      });
      sessionStorage.removeItem(sessionKey());
      hideAllCards();
      show(els.success);
      els.successMeta.replaceChildren();
      const rows = [
        ["Material Request", result.material_request],
        ["Supplier Quotation", result.supplier_quotation],
      ];
      rows.forEach(([label, value]) => {
        if (!value) return;
        const row = el("div");
        row.appendChild(el("dt", null, label));
        row.appendChild(el("dd", null, value));
        els.successMeta.appendChild(row);
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setAlert(els.reviewAlert, error.message);
      button.disabled = false;
      button.textContent = "Submit response";
    } finally {
      state.submitting = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  function readToken() {
    const raw = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(raw);
    return params.get("token") || "";
  }

  async function restoreSession() {
    const saved = sessionStorage.getItem(sessionKey());
    if (!saved) return false;
    try {
      const result = await api("get_supplier_quotation_response_form", { session: saved });
      state.session = saved;
      renderForm(result.form);
      return true;
    } catch (_) {
      sessionStorage.removeItem(sessionKey());
      return false;
    }
  }

  async function boot() {
    state.token = readToken();
    if (!state.token) {
      hideAllCards();
      setGate(
        "This link is not valid",
        "Open the link from your invitation email. If the problem continues, ask the buying team for a new link.",
      );
      return;
    }

    try {
      const invitation = await api("get_supplier_quotation_invitation_state", {
        token: state.token,
      });
      state.invitation = invitation;
      setBrand(invitation);

      if (invitation.revoked) {
        hideAllCards();
        setGate(
          "This link has been revoked",
          "The buying team has withdrawn this request. Please contact them if you were expecting it.",
        );
        return;
      }
      if (invitation.expired) {
        hideAllCards();
        setGate(
          "This link has expired",
          "The request is no longer accepting responses. Ask the buying team to send a new link.",
        );
        return;
      }
      if (invitation.already_responded) {
        hideAllCards();
        setGate(
          "Response already received",
          "This request has already been answered. Contact the buying team if you need to make a change.",
        );
        return;
      }

      if (await restoreSession()) return;

      hideAllCards();
      showSendCodeGate(invitation, "Verify the email address that received this invitation.");
    } catch (error) {
      hideAllCards();
      setGate("This link is not valid", error.message);
    }
  }

  els.otpForm.addEventListener("submit", verifyOtp);
  $("review-button").addEventListener("click", showReview);
  $("continue-button")?.addEventListener("click", continueToItems);
  $("back-to-common-button")?.addEventListener("click", () => {
    showCommonStep();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("review-edit-button")?.addEventListener("click", () => returnToField("document"));
  $("back-button").addEventListener("click", () => {
    hideAllCards();
    show(els.form);
    showItemsStep();
    const first = $("items-step").querySelector("input, select, textarea, [contenteditable]");
    if (first) {
      if (first.matches("[contenteditable]")) {
        first.focus({ preventScroll: true });
      } else {
        first.focus();
      }
    }
  });
  $("submit-button").addEventListener("click", submitResponse);

  boot();
})();
