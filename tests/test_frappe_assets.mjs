import assert from "node:assert/strict";
import { frappeAssetUrl } from "../erpnext_ui/frontend/src/lib/frappeAssets.js";
const path = "/assets/frappe/node_modules/html5-qrcode/html5-qrcode.min.js";
assert.equal(frappeAssetUrl(path, "http://localhost:8000/api", "http://localhost:5173"), "http://localhost:8000" + path);
assert.equal(frappeAssetUrl(path, "https://erp.example/api/", "http://localhost:5173"), "https://erp.example" + path);
assert.equal(frappeAssetUrl(path, "/api", "https://erp.example"), "https://erp.example" + path);
assert.equal(frappeAssetUrl(path, undefined, "https://erp.example"), "https://erp.example" + path);
console.log("Frappe scanner asset URL checks passed");
