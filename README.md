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

### Configurable Item codes

After deploying, run `bench --site <site> migrate`. As System Manager, open
**UI Item Code Rule** from Desk search, choose an Item Group, enable the rule,
and enter a pattern. One rule applies to the exact selected group.

- `{item_group}-{param.T}x{param.W}x{param.L}` → `MS Plate-10x1250x2500`
- `{custom_project}-{brand}-{param.L}` combines custom/native Item fields and a UOM parameter.
- `{item_group}-{item_name}` works without UOM pricing configuration.

**Insert Field or Parameter** lists supported scalar fields from the site's live
Item metadata and parameters from the group's UOM pricing rule. Parameter tokens
use `param.SYMBOL`; the Item's UOM pricing override takes precedence at generation,
and a parameter's mapped Item field takes precedence over its child-table value.
Fill those values on the new Item, then use **Generate Item Code** to fill its
code before saving. Server naming also enforces the pattern for new Items created
through APIs. Numeric tokens omit trailing decimal zeroes. Missing values and
invalid codes stop creation; duplicate combinations receive ERPNext's duplicate
code error, without silently adding a suffix.

Patterns accept literal separators and tokens, not Python/Jinja expressions.
Item code/name identity fields, child tables and Password fields are unavailable.
Existing Items are not renamed. Imports and cutting-generated offcuts/remainders
retain their assigned codes. On sites using `addsol_nl_custom`, deploy its naming
integration too: an enabled shared rule takes precedence over legacy plate and
finished-goods naming, while plate weight/default logic still runs. Without an
enabled shared rule, existing naming remains in effect.
