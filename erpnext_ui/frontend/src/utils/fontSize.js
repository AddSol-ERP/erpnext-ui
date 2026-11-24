const FONT_SIZES = {
	extraSmall: 0.82,
	small: 0.9,
	medium: 1,
	extraLarge: 1.15,
};

export const DEFAULT_FONT_SIZE = "small";

export function applyFontSize(size) {
	const selected = Object.hasOwn(FONT_SIZES, size) ? size : DEFAULT_FONT_SIZE;
	const root = document.documentElement;
	root.dataset.fontSize = selected;
	root.style.setProperty("--app-font-scale", FONT_SIZES[selected]);
	return selected;
}

export function readSavedFontSize() {
	try {
		const saved = localStorage.getItem("app_font_size");
		// Preserve users' former Large choice after that option becomes Extra large.
		const migrated = saved === "large" ? "extraLarge" : saved || DEFAULT_FONT_SIZE;
		if (migrated !== saved && saved) localStorage.setItem("app_font_size", migrated);
		return applyFontSize(migrated);
	} catch (error) {
		console.error("Failed to load saved font size:", error);
		return applyFontSize(DEFAULT_FONT_SIZE);
	}
}

export function saveFontSize(size) {
	const selected = applyFontSize(size);
	try {
		localStorage.setItem("app_font_size", selected);
	} catch (error) {
		console.error("Failed to save font size:", error);
	}
	return selected;
}
