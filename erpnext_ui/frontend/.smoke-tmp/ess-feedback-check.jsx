import "./domShim.js";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { FormField } from "../src/components/FormField";
import { FormFeedbackContext } from "../src/components/FormField/feedbackContext";
import FormErrorSummary from "../src/components/FormErrorSummary";

const html = renderToString(<FormFeedbackContext.Provider value={{ toastOnly: true }}><FormField name="reason" label="Reason" error="Reason is required"><input data-slot="input" /></FormField><FormErrorSummary toastOnly summary="Reason is required" fieldErrors={{ reason: "Reason is required" }} /></FormFeedbackContext.Provider>);
assert(html.includes('aria-invalid="true"'));
assert(html.includes('class="sr-only"'));
assert(html.includes("Reason is required"));
assert(!html.includes('data-slot="alert"'));
console.log("ESS error feedback keeps accessible field errors without an inline alert");
