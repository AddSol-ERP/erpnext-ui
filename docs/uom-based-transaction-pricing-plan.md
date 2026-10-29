# UOM Based Transaction Pricing Plan

## Goal

Make purchase and sales pricing by measured quantity optional and configurable. A site can
enable it for an Item Group or Item, select any UOM in ERPNext, define how the
chargeable quantity is calculated, and enter a rate per that UOM. Items without
this configuration continue to use standard ERPNext quantity and rate behavior.

Examples:

- Plates: calculate kilograms from thickness, length, width, and a material
  factor; price at a rate per kg.
- Pipe: calculate metres from length per piece; price at a rate per metre.
- Cable: enter or derive feet per reel; price at a rate per foot.
- Ordinary stock: leave the feature disabled and use the standard ERPNext UOM,
  quantity, and rate.

The selected UOM alone cannot determine how to measure an item. The user must
configure a formula and the parameters it needs. The system validates that the
formula result is a quantity in the selected UOM.

## Agreed decisions

- Configuration is opt-in. Unconfigured Items behave exactly as standard
  ERPNext Items.
- Pricing UOM is selected from ERPNext's UOM records; do not hardcode kg, m, or
  ft in the shared pricing engine.
- Each pricing UOM has its own rule, formula, and required parameters. Never
  reuse a kg formula for metres or assume another UOM's formula is a converted
  version of it.
- Item Group configuration supplies reusable UOM-specific rules, formulas, and
  required parameters. An Item selects/inherits the rule for its pricing UOM
  or overrides that rule and provides its own parameter values.
- Item fields and form inputs are determined by the active pricing rule and
  selected UOM. The UI should only ask for parameters required by that rule.
- The amount is calculated as `chargeable quantity × rate per pricing UOM`.
  The result is translated into ERPNext's standard transaction-UOM `rate`
  (`line amount / document qty`). ERPNext then calculates the standard amount,
  base/net values, taxes, and totals. Do not rely on a custom rate field alone
  while leaving ERPNext's standard `rate` unchanged.
- Purchase Receipt valuation remains ERPNext-owned: the accepted line amount is
  valued against the received stock quantity (`qty × conversion_factor`). This
  produces the correct cost per stock UOM even when the pricing UOM differs.
  Purchase Order and Purchase Invoice must carry the same standard line-rate
  basis and conversion data forward.
- Implement generic UOM pricing in `erpnext_ui` because the requirement applies
  across customers. Keep the current NL kg purchasing implementation in
  `addsol_nl_custom` active while the generic path is developed and proven.
- After successful QA, move NL plate purchasing to the `erpnext_ui` kg rule and
  retire the overlapping kg purchase-pricing logic from `addsol_nl_custom`.
  Keep NL-specific physical plate, receipt-measurement, cutting, and offcut
  behavior where it remains customer-specific.
- Physical receipt checks remain configurable by measurement strategy. Truck
  weight allocation and weight-variance approvals apply to kg measurements;
  they must not be imposed on metre, foot, or other pricing rules.
- Plate cutting, offcut stock, and related physical kg costing remain specific
  to plate operations unless separately scoped.

## Configuration model

### Feature controls

Add an `erpnext_ui` singleton settings DocType with a master **Enable UOM Based
Pricing** switch, off by default. Add independent **Enable for Buying** and
**Enable for Selling** switches beneath it so a customer can adopt one side at
a time. When the master switch or the relevant side switch is off, documents
use standard ERPNext pricing and no UOM pricing validations run.

The effective feature state is the combination of:

1. Site master switch is on.
2. The relevant Buying or Selling switch is on.
3. The Item or its inherited Item Group has an enabled pricing rule.

Show the effective state and explain which level disabled the rule. The server
must apply this resolution on every save/submit/API path; hiding fields in the
UI is not sufficient. Turning the feature off must not erase configuration or
historical transaction values. It should stop applying the rule to new edits
until it is re-enabled.

### Pricing rule

Add an app-owned configuration model that can be attached to an Item Group and
optionally overridden on an Item. Each rule is specific to one pricing UOM and
has its own formula and parameter set. It should contain:

- enabled / disabled;
- pricing UOM (Link to UOM);
- formula for the measured quantity per item, or a configured direct-entry
  mode;
- a child table of formula parameters: symbol, label, data source or entry
  behavior, display order, required flag, and optional parameter UOM;
- a receiving measurement strategy, if needed: estimated-only, supplier
  measurement, scale/weighbridge total allocation, or another explicitly
  supported strategy;
- optional tolerance and decision/approval requirements for strategies that
  accept a measured quantity.

The administrator's Item Group setup should be a **UOM Pricing Rules** child
table. For each row, the administrator selects the ERPNext UOM, chooses or
enters that UOM's formula, and defines the formula's parameter schema. Each
parameter definition should include:

- formula symbol (for example, `L`), unique within the rule;
- user-facing label (for example, `Length per piece`);
- numeric value type, precision, and optional parameter UOM;
- value source: entered per Item, supplied by an existing Item field, or
  inherited from the Item Group default;
- required flag, optional default, and display order.

The formula editor should offer only the symbols declared in that rule and
preview the result using sample parameter values. A kg row and a metre row are
configured independently, each with its own symbols, parameters, and formula.
The administrator can add multiple UOM rows to one Item Group; this does not
mean the same formula is reused or that one transaction line has multiple
prices.

The Item Group can supply a separate default rule for each pricing UOM. Each
rule is independent: a kg rule can calculate mass from dimensions and material
factor, while a metre rule can calculate length from per-piece dimensions.
Changing the output UOM must not be treated as converting one rule's formula
into another. Item-level settings select or override a Group rule only where
explicitly configured. The effective rule must be resolved and shown
consistently on Supplier Quotation, Purchase Order, Purchase Receipt, and
Purchase Invoice.

An Item Group may define multiple available UOM rules. The first release should
resolve to one effective pricing UOM/rule per Item on a transaction; supporting
simultaneous rates in several pricing UOMs for one line is outside this
implementation.

### Item parameters

Add an Item form section for **UOM Pricing**. It must let the user inherit the
Item Group's default pricing rule or explicitly select an Item-level UOM rule.
After the user selects a rule, show an **Item Pricing Parameters** table with
one value input for each parameter defined by that exact rule. This is where
users configure per-Item dimensions or other formula inputs; configuring the
formula on the Item Group alone is not enough.

Store Item-level parameter values in a child table keyed by Item, rule, and
parameter symbol. Store only values and references there, not duplicate labels
or formula definitions. If a stable native ERPNext field supplies a value (for
example, `weight_per_unit`), the rule can reference that field and the Item
form can show it as read-only instead of asking for the same value again. This
avoids adding a separate Custom Field for every measurement concept.

The Item form behavior is:

1. Resolve the Item Group's default rule, or use an explicit Item override.
2. When the Item-level rule changes, load that rule's parameter schema and show
   only its parameters. For example, a kg formula may request `L`, `W`, `T`,
   and `MF`; a metre formula may request length per piece.
3. Let the user enter Item-specific parameter values, showing parameter units,
   required markers, defaults, and clear labels.
4. Validate required values and compatible units on save; do not treat missing
   values as zero.
5. Calculate and display the derived quantity per Item in the selected UOM,
   and identify the formula/rule used.
6. When the selected rule changes, retain values only for parameters shared by
   symbol and compatible unit. Mark other values inactive or archive them so
   stale values from a prior formula can never affect the new calculation.

Item Group rules may declare parameter defaults; Item-specific values take
precedence. The backend must validate parameter names and values against the
effective rule and must recalculate the derived quantity server-side.

### Formula safety and units

- Generalize the existing plate formula evaluator to declared numeric parameter
  symbols and arithmetic only. Do not use unrestricted Python `eval` or permit
  function calls, attribute access, imports, or arbitrary expressions.
- Validate all referenced symbols against parameters declared by the rule.
- Require a positive, finite formula result where the rule requires a measured
  quantity.
- Store the pricing UOM alongside the computed quantity and rate.
- Use ERPNext UOM conversions only when a valid conversion exists. A formula
  output in metres must not be treated as feet without an explicit conversion.
- Keep currency and rate precision consistent with ERPNext and round only at
  the final line amount boundary.

## Transaction behavior

### Supplier Quotation

- Show the effective pricing UOM and a dynamically labelled rate field such as
  `Rate per kg` or `Rate per metre`.
- Supplier responses may enter the configured rate and configured response
  parameters only. Server-side validation enforces the rule's allowlist.
- Calculate the estimated line amount from the formula-derived quantity and
  rate; preserve the Supplier Quotation as the source for the agreed rate.

### Purchase Order

- Resolve the same rule used by the Supplier Quotation, or the Item/Item Group
  rule when no quotation is linked.
- Show the pricing UOM, parameter values, derived quantity, and rate per UOM.
- Keep the existing Update Items dialog behavior but submit the generic rate
  and parameters, not kg-only fields.
- Calculate amount from the effective pricing quantity and derive ERPNext's
  standard `rate` as `amount / document qty`. Keep the configured UOM rate and
  measured quantity as the audit/source values, but make ERPNext's standard
  `rate`, `amount`, and derived base/net fields agree with them.
- Preserve `uom`, `conversion_factor`, `stock_qty`, `stock_uom_rate`, and
  discount/margin semantics. Ensure price-list, margin, and discount processing
  cannot overwrite the calculated standard `rate` with a value that changes
  the intended line amount.
- Offer last agreed rate per Item and supplier as a suggestion, without
  overwriting a rate the buyer enters.

### Purchase Receipt

- Copy the Purchase Order's effective pricing rule, parameter values, and rate
  to the receipt row.
- Let the receiver enter or confirm only measurements required by the selected
  receiving strategy.
- For kg plate receipts, preserve current supplier-weight/weighbridge,
  tolerance, approval, and truck allocation behavior through the kg strategy.
- Do not show kg-only inputs or validation for other UOMs.
- Recalculate the accepted chargeable quantity and amount server-side before
  saving/submitting. Keep ERPNext stock quantity and stock UOM behavior intact.
- Set the standard transaction-UOM `rate` so ERPNext's `amount` equals the
  accepted pricing measure times the configured rate. Let ERPNext derive
  `stock_qty`, `stock_uom_rate`, base/net amounts, taxes, and valuation fields
  through its normal calculations.
- Validate valuation against the stock quantity, not the pricing measure:
  `stock_qty = qty × conversion_factor`, and effective received unit cost is
  based on the valued net amount divided by that stock quantity (with ERPNext's
  valuation taxes/landed-cost rules applied).

### Purchase Invoice

- When linked to a receipt, inherit and validate the receipt's accepted
  chargeable quantity and rate per UOM.
- Populate the standard transaction-UOM `rate` consistently with the PO/receipt
  so standard `amount`, `base_amount`, `net_amount`, taxes, and payment totals
  remain authoritative. Preserve stock UOM/conversion fields when the invoice
  updates stock; use the Purchase Receipt's accepted measure for reconciliation.
- Preserve existing invoice/receipt reconciliation and over-billing controls,
  generalized to the effective pricing measure.
- For invoices without a receipt, enforce the configured rule only if that
  transaction path is supported; otherwise require a receipt as the current
  plate flow does.

### Sales Quotation

- Resolve the effective rule only when both the site Selling switch and the
  Item/Item Group rule are enabled.
- Show the pricing UOM, required parameters, calculated quantity, and rate per
  UOM. Keep the quotation amount aligned with the ERPNext line quantity/rate.
- Copy the effective basis and parameter snapshot to the resulting Sales
  Order so later Item configuration changes do not silently rewrite an
  accepted quote.

### Sales Order

- Inherit the Sales Quotation's rule snapshot, or resolve the Item/Item Group
  rule when no quotation is linked.
- Calculate the amount from the agreed pricing quantity and rate per UOM;
  preserve ERPNext's ordered quantity and stock-UOM conversion behavior.
- Translate the result to the standard sales-line `rate` per transaction UOM;
  let ERPNext calculate amounts, currency values, discounts, taxes, and totals.
- Prevent recalculating a submitted order from changed Item parameters unless
  the user explicitly updates the item under ERPNext's allowed workflow.

### Delivery Note

- Carry the Sales Order pricing basis and compute the delivered pricing quantity
  from the actual delivered quantity and configured measurement strategy.
- Keep inventory movement in ERPNext's stock UOM. The pricing UOM must not
  replace `stock_qty`, stock UOM, serial/batch handling, or warehouse movement.
- Populate the standard delivery-line rate and amount from the selected billing
  measure. Keep stock movement quantities and valuation/cost fields under
  ERPNext's stock controller.
- If the delivered amount differs from the ordered measurement, follow an
  explicit configured policy: use the order's agreed rate with actual delivered
  measure, or retain the order measure. Do not silently change invoice value.

### Sales Invoice / POS Invoice

- Inherit the basis/rate/measure from the Delivery Note or Sales Order when
  linked; for direct invoices, resolve the active Item/Item Group rule.
- Apply the measured quantity and rate per UOM consistently to line amount,
  taxes, discounts, and totals, while keeping inventory posting rules owned by
  ERPNext.
- Set the standard transaction-UOM `rate` to match the calculated line amount;
  do not leave the authoritative rate only in custom fields.
- Apply the same model to POS Invoice if the Selling switch is enabled there;
  otherwise leave POS on standard pricing and document that scope explicitly.

### Returns and credit/debit documents

- Purchase returns and sales returns/credit notes must reverse the original
  transaction's pricing UOM, rate, and measure snapshot, including negative
  quantities/amounts. Do not resolve a new Item rule for a return if it would
  differ from the original document.

## Application ownership and boundaries

### `erpnext_ui`

- Own the generic UOM pricing configuration, server-side pricing engine,
  authenticated metadata APIs, and reusable purchase/sales/supplier screens.
- Read effective pricing metadata from authenticated server endpoints.
- Render UOM-specific labels, inputs, previews, and validations dynamically.
- Never use client visibility as the validation boundary.
- Keep standard ERPNext screens usable; custom server behavior must work even
  when a document is created in Desk or through an API.
- Add the configuration DocTypes/settings needed to manage rules and
  parameters. This intentionally expands the app's current shell architecture;
  keep the configuration portable and independent of NL-specific fieldnames.
- Own the site master toggle and independent Buying/Selling enable switches.

### `addsol_nl_custom`

- Keep the current kg purchase implementation active while the generic path is
  built and QA'd.
- Convert current plate formulas and parameter values into the new kg rule
  during cutover.
- Retain customer-specific receipt measurement strategy where needed, plus
  plate cutting, serial/batch handling, and offcut behavior.
- After generic kg pricing is verified, remove duplicate PO/Supplier Quotation/
  Purchase Receipt/Purchase Invoice price calculation from this app. Remove
  obsolete kg-only purchase fields/settings only after data and consumers are
  migrated.
- Do not put generic UOM pricing logic in NL-specific plate modules.

### ERPNext standard behavior

- Continue using stock UOM, stock quantity, conversion factor, valuation,
  taxes, GL, and ordinary line-rate fields. The generic engine calculates the
  effective total and sets the standard transaction-UOM rate needed to produce
  it. Let ERPNext calculate standard amount/base/net/tax fields and stock
  valuation; never bypass document validation or stock posting.

## Data model and staged cutover

1. Add generic rule/parameter configuration, APIs, and transaction fields in
   `erpnext_ui` for pricing UOM, rate per UOM, calculated/accepted measure, and
   strategy-specific receiving decisions.
2. Add the master and Buying/Selling switches, disabled by default. Existing NL
   sites keep using the current `addsol_nl_custom` kg path while generic
   development proceeds.
3. Add a shadow/preview mode for QA that computes generic results for selected
   Items and compares them with legacy results without writing amounts or
   changing submitted documents.
4. On a QA copy, convert selected weighed Item Groups into enabled kg rules,
   carrying over formula, multiplication factor, dimensions, tolerance, and
   approver role. Exclude those Items from legacy repricing before enabling
   writes, so one transaction is never repriced by both implementations.
5. Backfill selected QA Supplier Quotations, Purchase Orders, Purchase
   Receipts, Purchase Invoices, Sales Quotations, Sales Orders, Delivery Notes,
   and Sales Invoices into generic transaction fields, preserving amounts/rates
   and links to the old `custom_*_kg` values.
6. Verify supplier responses, Update Items, receipt acceptance and truck
   allocation, reports, print formats, taxes, stock valuation, QR/traceability,
   and offcut costing through the generic kg rule.
7. After sign-off, switch NL plate purchasing to the generic engine and remove
   duplicate purchase-pricing behavior from `addsol_nl_custom`. Keep its
   plate-specific measurement adapter and offcut/cutting functionality where
   needed.
8. Remove old purchase fields/settings only after data, APIs, reports, and
   print formats have moved. Retain unrelated physical kg fields used by plate
   receiving and cutting.

## Delivery phases

### Phase 1 — Finalize supported measurement strategies

- Inventory formula-derived values and direct-entry needs from current
  requirements.
- Define which strategies ship initially: formula from Item parameters,
  direct measured quantity, and kg truck-total allocation.
- Specify UOM conversion, rounding, precision, missing-parameter, and approval
  behavior.
- Confirm whether item-level override can change the Group's UOM or only its
  parameters/rate rule.

### Phase 2 — Schema and rule administration

- Add configuration DocTypes/settings, Item Group rule rows, Item overrides,
  and the Item form's UOM Pricing section with formula-specific parameter-value
  editing and a live derived-quantity preview.
- Add formula parsing, validation, rule inheritance, and effective-rule API.
- Seed the current NL plate configuration as an opt-in kg rule in development/
  QA. Do not enable it while the legacy engine is writing for those Items.

### Phase 3 — Generic server pricing engine

- Replace the kg-only purchase path with a generic chargeable-measure
  calculation, then apply it to supported Selling documents.
- Add server validation and transaction field propagation for the complete
  Buying and Selling flows, including returns and configured POS scope.
- Keep kg receipt measurement and approval as a strategy adapter.
- Confirm submitted-document Update Items still persists rate, quantity, and
  calculated amounts correctly.

### Phase 4 — ERPNext UI and supplier response UI

- Add an admin configuration experience for Item Group rules and Item
  parameters.
- Render purchase screens using the effective UOM and parameter metadata.
- Update the supplier response form to show only enabled supplier-entered
  parameters and a dynamic rate-per-UOM label.
- Replace kg-specific receipt inputs and error messages with strategy-driven
  inputs while retaining the current kg flow.

### Phase 5 — QA cutover and cleanup

- Run shadow comparisons on a development copy across Buying and Selling, then
  enable the generic kg rule for selected QA Items after excluding them from
  legacy repricing.
- Compare document line amounts, taxes, stock quantities, valuations, supplier
  quotations, reports, print formats, and receipt traceability with the current
  behavior for plates.
- Test ordinary unconfigured items to prove the feature remains opt-in.
- After approval, switch NL plate purchasing to the generic engine and remove
  duplicate legacy pricing behavior. Remove old kg-specific fields/settings
  only after all paths and QA records have been checked.

## Acceptance criteria

- An unconfigured Item behaves exactly as standard ERPNext Buying and Selling.
- The master switch and Buying/Selling switches independently enable or disable
  the feature; disabled paths retain standard ERPNext behavior and preserve
  saved configuration/history.
- An administrator can choose any ERPNext UOM and configure the parameters and
  formula needed to calculate a chargeable quantity in that UOM.
- Item Groups can hold independent rules, formulas, and parameters for different
  UOMs; Items inherit or explicitly override the rule for the selected UOM.
- An Item can select/inherit a UOM/formula rule and configure its own values for
  that formula's parameters; switching rules displays the corresponding
  parameter set and stale values do not enter calculations.
- Only parameters required by the effective rule are displayed and required.
- Invalid, missing, non-finite, or non-positive measurements cannot be used to
  calculate a payable amount when the rule requires a positive quantity.
- The amount equals the accepted chargeable quantity multiplied by the rate
  per selected UOM; ERPNext totals, taxes, stock, and valuation remain correct.
- Supplier Quotation, Purchase Order, Purchase Receipt, Purchase Invoice,
  Sales Quotation, Sales Order, Delivery Note, Sales Invoice, applicable POS
  and return documents, supplier response, print formats, reports, and
  QR/traceability data carry the same effective UOM and rate consistently.
- Purchase and sales line amounts reconcile to the effective pricing measure;
  the standard ERPNext line `rate` is populated accordingly. Purchase Receipt
  stock valuation uses the correct received stock quantity and conversion
  factor, while stock UOMs, serial/batch behavior, and warehouse movements
  remain independent of the pricing UOM.
- Existing plate purchasing can move to the kg rule with its weight variance,
  approval, and truck allocation behavior, while the legacy path stays active
  until the generic path is validated.
- Non-weight rules never request supplier weight, weighbridge weight, or weight
  variance decisions.
- Desk, `erpnext_ui`, and API-created documents enforce the same server-side
  rules.
- Generic rollout leaves the current NL workflow active until an explicit QA
  cutover; only one pricing implementation writes transactions for an Item at
  a time.
- Migration is idempotent, preserves current QA document amounts, and ordinary
  unconfigured Items remain unaffected.

## Main risks

- **UOM ambiguity:** a unit name does not define how to calculate its quantity.
  Mitigation: require an explicit formula/direct-entry strategy and parameter
  definitions.
- **Stock versus pricing quantity:** ERPNext stock may remain in Nos while
  pricing is per kg or metre. Mitigation: keep stock UOM/stock quantity intact
  and derive only the accounting line rate from the chargeable measure.
- **Custom formula safety:** unrestricted expressions can create unsafe or
  unpredictable results. Mitigation: validate a small arithmetic grammar and
  declared numeric symbols on the server.
- **Workflow drift across entry points:** Desk, SPA, supplier form, and API may
  calculate differently. Mitigation: make one server engine authoritative and
  use the frontend only for previews.
- **Legacy kg fields embedded in templates and reports:** removal can break
  printed or analytical output. Mitigation: inventory and update all consumers
  before deleting fields.
- **Overgeneralizing receiving:** not every pricing UOM uses a truck scale or
  variance approval. Mitigation: separate price basis from receipt measurement
  strategy.
- **Sales fulfillment measure changes:** ordered and delivered quantities may
  differ. Mitigation: configure which delivered measurement is billable and
  snapshot the accepted rule/rate on the order.

## Scope exclusions for the first release

- Multiple simultaneous pricing bases on one transaction line.
- Arbitrary executable formulas, external scripts, or user-defined functions.
- Generalizing plate cutting, offcut inventory, or physical stock UOMs.
- Automatically inferring a measurement formula from the UOM label.
- Replacing ERPNext's stock, tax, valuation, or accounting lifecycle.
