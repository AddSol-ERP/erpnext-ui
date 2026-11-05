### Addsol Erpnext UI

This app build to show customize ui

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch develop
bench install-app erpnext_ui
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/erpnext_ui
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit
# erpnext-ui

### Pricing rules and Item codes

Each Item Group may have only **one enabled UI Uom Pricing Rule**, regardless of
pricing UOM. Disabled rules can remain for reference. Disable the existing rule
before activating another. Saving/enabling rules locks the common Item Group to
prevent concurrent activation; pricing reads also reject pre-existing duplicates
instead of selecting an arbitrary rule.

Configure **Item Naming** on **UI Uom Pricing Rule**: enable Item Code Generation
and enter e.g. `{item_group}-{param.T}x{param.W}x{param.L}` to produce
`MS Plate-10x1250x2500`. Use **Insert Field or Parameter** to append supported
Item master fields or parameters declared on that rule. On a new Item, fill its
values and click **Generate Item Code**, then save. Native/custom fields and
parameters can be combined. Item overrides take precedence over the group rule;
pricing and naming resolve the same rule. Naming is independent of the global
buying/selling switches but the rule itself must be enabled.

Existing Item codes, imports and cutting-generated Items stay unchanged.
Duplicate code combinations use ERPNext's duplicate-code rejection. Patterns
support literal text and tokens, not Python/Jinja expressions. Missing source
values and unsupported fields stop generation.

Deploy and run `bench --site <site> migrate`. Legacy **UI Item Code Rule** enabled naming patterns migrate onto
the group's single enabled pricing rule. Migration stops on a missing/ambiguous
pricing destination or conflicting pattern, preserving the records for review.
Configure exactly one enabled pricing rule for each affected group, then retry.
After the transfer, migration removes the obsolete **UI Item Code Rule** DocType
from Desk. Fresh installations only contain the combined pricing/naming rule.
Sites using `addsol_nl_custom` need its shared naming integration deployed too.

### Item QR scanning and public previews

Receipt labels (submitted receipts only) and the customer app's offcut labels
now contain a signed `/item-preview?token=...` link. Anyone holding the label
can open its read-only preview without logging in. The public projection shows
Item identity/specifications, stock UOM, batch/serial, supplier display name,
Project ID, Work Order ID, warehouse/location, source document IDs/dates, brand,
manufacturer, batch dates/heat number and submitted inspection details where available.
It does not publish prices, stock balances, internal files or contact details.
Receipt cancellation invalidates its preview. Site encryption-key rotation also
invalidates existing signed labels. The page is not indexed or cached.

In Store Material Issue, select the source warehouse, then **Scan item QR**.
Use the camera or paste the decoded link (USB keyboard scanners can enter it).
Scanning preserves serial/batch identifiers and counts actual scanned stock
units; a mapped request's planned quantity becomes the scanned quantity on that
line. Scan more labels to increase it. Duplicate labels/serials and serials from
another warehouse are refused. One item row accepts a single batch; issue
another batch separately. Scanned quantity/UOM are locked so identity and quantity
cannot diverge; remove the row and rescan to correct it. Normal ERPNext stock
and serial validation still controls submission.

Quality Inspection has the same scanner. It fills Item, serial, batch and known
receipt/Stock Entry reference; inspection type defaults from the reference. Fill
any remaining inspection fields normally. Source documents and Items still need
read permission for in-app scanning.

Camera decoding reuses Frappe's bundled `html5-qrcode` asset on the same site.
Camera access requires HTTPS and device permission. Paste/USB input remains
available if the camera is unavailable. Existing receipt/offcut QR formats are
recognized inside the app. Reprint old labels to make their links open the public
preview directly; old printed login-only URLs cannot be changed in place.
Deploy ERP UI and the customer app together, build assets and migrate as usual.
Live phone-camera and site submission verification is still required.

### Direct issue from Store

Open **Store → Direct Issue**, or **Give Items → Direct Issue**, to issue without
an indent. Choose the source warehouse, optionally fill Project, Work Order and
Requested User in **Global details**, then scan or add items. Every item line can
override those four fields. Untouched line fields follow the global values;
clearing an optional line field leaves it blank. **Use global details** resets
that line's overrides. Click **Issue items** to review and submit through the
normal Stock Entry flow. New header and line fields require `bench migrate`.
