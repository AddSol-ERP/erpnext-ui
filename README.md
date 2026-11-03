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
