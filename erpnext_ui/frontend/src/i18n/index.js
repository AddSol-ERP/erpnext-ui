import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/translation.json";
import hi from "./locales/hi/translation.json";
import ar from "./locales/ar/translation.json";

// Per-module locale files (each phase/module owns its own pair so parallel
// work never collides on translation.json).
import enApprovals from "./locales/en/approvals.json";
import enEss from "./locales/en/ess.json";
import enStore from "./locales/en/store.json";
import enOps from "./locales/en/ops.json";
import enCommercial from "./locales/en/commercial.json";
import enReports from "./locales/en/reports.json";
import hiApprovals from "./locales/hi/approvals.json";
import hiEss from "./locales/hi/ess.json";
import hiStore from "./locales/hi/store.json";
import hiOps from "./locales/hi/ops.json";
import hiCommercial from "./locales/hi/commercial.json";
import hiReports from "./locales/hi/reports.json";
import arApprovals from "./locales/ar/approvals.json";
import arEss from "./locales/ar/ess.json";
import arStore from "./locales/ar/store.json";
import arOps from "./locales/ar/ops.json";
import arCommercial from "./locales/ar/commercial.json";
import arReports from "./locales/ar/reports.json";

/** Shallow-merge module bundles over the core translation bundle. */
function withModules(core, ...modules) {
	return Object.assign({}, core, ...modules);
}

export const SUPPORTED_LANGUAGES = ["en", "hi", "ar"];
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "app_lang";

/** RTL is active for Arabic (and any future RTL language added here). */
export const RTL_LANGUAGES = ["ar"];

export function getDirection(language) {
	return RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
}

/** Keep <html lang>/<html dir> in sync so CSS logical properties & fonts follow. */
export function applyDocumentLanguage(language) {
	const lang = SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
	document.documentElement.lang = lang;
	document.documentElement.dir = getDirection(lang);
}

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			en: {
				translation: withModules(
					en,
					enApprovals,
					enEss,
					enStore,
					enOps,
					enCommercial,
					enReports
				),
			},
			hi: {
				translation: withModules(
					hi,
					hiApprovals,
					hiEss,
					hiStore,
					hiOps,
					hiCommercial,
					hiReports
				),
			},
			ar: {
				translation: withModules(
					ar,
					arApprovals,
					arEss,
					arStore,
					arOps,
					arCommercial,
					arReports
				),
			},
		},
		supportedLngs: SUPPORTED_LANGUAGES,
		fallbackLng: DEFAULT_LANGUAGE,
		nonExplicitSupportedLngs: true,
		lowerCaseLng: true,
		interpolation: { escapeValue: false },
		detection: {
			order: ["localStorage", "navigator"],
			caches: ["localStorage"],
			lookupLocalStorage: LANGUAGE_STORAGE_KEY,
		},
		returnEmptyString: false,
	});

i18n.on("languageChanged", applyDocumentLanguage);
applyDocumentLanguage(i18n.resolvedLanguage || i18n.language || DEFAULT_LANGUAGE);

/** Convenience helper for non-component code (e.g. plain utils). */
export function changeLanguage(language) {
	return i18n.changeLanguage(language);
}

export default i18n;
