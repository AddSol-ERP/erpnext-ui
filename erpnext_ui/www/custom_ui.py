import os
import json
import frappe

no_cache = 1

def get_context(context):
    context.no_sidebar = True
    context.no_header = True
    context.no_footer = True

    # Read the Vite manifest to get hashed filenames for cache busting.
    # After every bench build, Vite generates new hashes, so the browser
    # automatically loads the latest JS/CSS without caching issues.
    manifest_path = frappe.get_app_path(
        "erpnext_ui", "public", "erp_ui", ".vite", "manifest.json"
    )
    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
        entry = manifest.get("src/main.jsx", {})
        context.main_js = entry.get("file", "main.js")
        css_files = entry.get("css", [])
        context.main_css = css_files[0] if css_files else "erp-ui.css"
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        # Fallback if manifest is not yet built
        context.main_js = "main.js"
        context.main_css = "erp-ui.css"

    return context
