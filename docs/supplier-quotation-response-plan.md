# Supplier quotation response flow

## Goal

Let Purchase request rates from one or more suppliers against a Material Request. A supplier should be able to respond from an email link without creating an ERPNext account. Each response must be securely tied to the correct supplier and create or update that supplier's own draft Supplier Quotation in ERPNext.

The feature belongs in `erpnext_ui` and must work across customers with different Supplier Quotation Item fields and pricing practices. Do not hardcode NL-specific fields or email addresses.

## Agreed workflow

1. A permitted buyer opens **Request Supplier Quotes** from a Material Request, selects multiple suppliers, chooses a Material Request print format, and reviews the email subject and wording.
2. The server validates the request and suppliers. For each supplier, it resolves an active supplier contact and email, then creates a separate draft Supplier Quotation linked to that supplier and Material Request. The requested items and quantities are prefilled from the Material Request.
3. The server creates an invitation record for each Supplier Quotation, sends a unique link to the selected supplier email, and attaches the selected Material Request print format when requested.
4. The supplier opens the link. The server validates the invitation token and sends an OTP to the registered recipient email. The supplier must verify the OTP before seeing item details or entering values.
5. The supplier sees requested item, description, quantity, and UOM as read-only context. They can fill only the Supplier Quotation Item fields enabled for supplier input in settings. Required fields are validated before acceptance.
6. On submission, the server writes the allowed values onto the corresponding item rows of that supplier's draft Supplier Quotation and marks the invitation as responded. The Supplier Quotation remains draft for internal review; the supplier does not submit or otherwise control ERPNext document status.
7. The server emails the configured internal recipients after each accepted response, including the Material Request, supplier, and Supplier Quotation references.

Each invited supplier has a distinct Supplier Quotation and response link. Responses must never update the Material Request or another supplier's quotation.

## Settings and metadata-driven supplier fields

Add an `erpnext_ui` settings screen backed by app-owned configuration DocTypes. On installation, seed defaults so the feature can be used without first configuring every field. Administrators can then adapt it to their site.

### Supplier Quotation Item field configuration

Store a configuration row per eligible Supplier Quotation Item field, with:

- fieldname and metadata-derived label/type/options;
- enabled for supplier form;
- supplier editable or read-only context;
- mandatory for supplier response;
- display order and optional supplier-facing help text.

The settings UI should discover fields from live Supplier Quotation Item metadata, including custom fields installed by customer apps. A supplier must never receive arbitrary fields simply because they exist in metadata. Exclude system, hidden, read-only, permission-controlled, and server-derived fields by default; let an administrator explicitly enable supported fields. The server must independently enforce the configured allowlist and required-field rules.

### Default field behavior

- Show item code/name or description, requested quantity, and UOM as read-only context.
- Require the supplier's quoted rate by default.
- Keep other commercial inputs, such as delivery date, supplier item code, validity, and remarks, configurable.
- Keep customer-specific fields disabled unless an administrator enables them. For example, an NL site can enable its per-Kg fields while another customer uses standard ERPNext UOM/rate fields.
- Derive field type, choices, and labels from live metadata; support only safe input types the form and backend can validate consistently.

ERPNext field `reqd` metadata is not sufficient to decide supplier requirements. A field can be required by ERPNext but should be supplied by the server or kept internal. Settings distinguish read-only context, server-populated fields, and supplier-entered fields.

### Notification and email settings

Configure internal response recipients in `erpnext_ui`, with one or more addresses per site. Also make invitation wording, subject defaults, print-format behavior, OTP expiry/attempt limits, and invitation expiry configurable where practical. Do not place customer addresses or wording in code.

## Data and state model

Use a separate invitation record for each supplier and Material Request. It should link:

- Material Request;
- Supplier and the exact contact email invited;
- Supplier Quotation and the response's target rows;
- token hash, OTP hash, expiry timestamps, failed-attempt counters;
- state, invitation/response timestamps, and resend/revocation audit details.

Suggested states: `Draft`, `Sent`, `OTP Verified`, `Responded`, `Expired`, `Revoked`, and `Failed`. Tokens and OTPs must be stored as hashes, be single-use where applicable, and never appear in logs or normal API responses. Resending should rotate/revoke the previous token and preserve an audit trail. A second response must not silently overwrite an accepted response; require an explicit buyer-driven reopen or resend behavior.

## API and security requirements

- Internal endpoints require the appropriate ERPNext permission to read the Material Request, contact suppliers, create Supplier Quotations, and send email.
- Public endpoints are narrowly scoped to token validation, OTP request/verification, loading the permitted response form, and submitting the configured fields. They must not accept arbitrary doctype, supplier, quotation, item, or field names from the browser as authority.
- Bind every invitation to one supplier, one recipient email, one Material Request, one Supplier Quotation, and the exact mapped item rows. Validate all links again on the server at submission time.
- Use cryptographically random tokens and OTPs; enforce configurable expiry, attempt limits, resend throttling, and invalidation after response, expiry, or revocation.
- Return no Material Request or item details until the OTP is verified. Avoid exposing document names or supplier details in public URLs beyond an opaque token.
- Sanitize text inputs, validate field types and lengths from metadata, and reject fields outside the settings allowlist.
- Log invitation creation, delivery outcome, verification, response, revoke, and resend events without logging secrets.
- Send notifications only after the Supplier Quotation update succeeds. Email failure must be visible/retriable and must not roll back an already accepted response.

## Purchase and pricing behavior

The supplier response form collects a quoted rate in the configured rate field and unit basis. The standard `rate` remains the default. Customers with a weight-based purchasing extension can enable their Supplier Quotation Item custom fields and corresponding behavior without adding NL-specific logic to `erpnext_ui`.

At implementation time, inspect each configured field's metadata and the installed ERPNext version. Do not assume every custom rate field has standard `rate` semantics. If a customer's extension requires calculation or mapping between fields, provide a generic server-side integration contract or a documented app hook rather than embedding that customer's fieldnames in shared code.

The Supplier Quotation is the system-of-record response. ERPNext buying users review its rates, taxes, terms, and configured fields, then submit it through normal ERPNext workflow. The invitation subsystem must not make pricing, tax, or accounting decisions on the supplier's behalf.

## UI scope

### Internal Material Request flow

- Keep supplier selection, print-format selection, email subject/body, and preview together in the existing dialog.
- Show each supplier's resolved contact email and clearly report missing/invalid emails before sending.
- Show per-supplier sent/failed results and the created Supplier Quotation/invitation references.
- Provide a way for authorized users to view response state, resend, revoke, and open the resulting Supplier Quotation.

### Supplier response page

- Mobile-first, branded page with the Material Request reference, required-by date, requested item details, and configured input fields.
- OTP entry before protected request details are displayed.
- Clear expired, revoked, already-responded, invalid-code, and delivery-error states.
- Review screen before final submission; confirmation that the response was received.

## Delivery phases

1. **Schema and settings:** invitation records, supplier-field configuration, notification recipients, defaults, and install/migration seeding.
2. **Internal invitation flow:** supplier email validation, per-supplier draft Supplier Quotation creation, unique invitations, send results, and print-format email integration.
3. **OTP and public page:** token/OTP APIs, rate limiting, dynamic metadata-driven form, and secure submission into the exact draft quotation.
4. **Notifications and tracking:** configurable internal recipient email, response status on Material Request, resend/revoke, audit history, and failure handling.
5. **Verification:** permission tests, multi-supplier isolation, token/OTP expiry and abuse cases, field allowlist/required validation, custom field support, duplicate submission, and Supplier Quotation-to-Purchase Order flow.

## Acceptance criteria

- One Material Request sent to multiple suppliers creates one separate draft Supplier Quotation and invitation per supplier.
- Each supplier can access only their own response using their unique link and OTP sent to the invited supplier email.
- A valid response updates only its associated draft Supplier Quotation item rows and cannot change ERPNext document status.
- Configured fields render with the correct metadata, visibility, ordering, and required validation; unconfigured fields cannot be submitted through a forged request.
- Standard defaults work on a clean ERPNext install; custom Supplier Quotation Item fields can be enabled through settings without editing shared source code.
- Each accepted response emails configured internal recipients and records a response state/audit trail.
- Expired, revoked, reused, throttled, or incorrect tokens/OTPs cannot read or change quotation data.
- Existing Material Request email/print preview behavior remains available and is connected to the new response invitation flow.

## Decisions recorded

- Suppliers do not need ERPNext accounts.
- A unique link is paired with OTP verification to the supplier email selected for that invitation.
- One draft Supplier Quotation is created per supplier when invitations are sent.
- Supplier response fields are configurable from live Supplier Quotation Item metadata.
- Internal recipients are configurable; send one notification email per accepted supplier response.
- A supplier response populates its draft Supplier Quotation; internal users retain review and submission control.
