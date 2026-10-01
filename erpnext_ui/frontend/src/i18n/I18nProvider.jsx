import { useTranslation } from "react-i18next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DirectionProvider } from "@/components/ui/direction";
import { getDirection } from "./index";

/**
 * Wires i18n language -> RTL direction for Radix portals (dialogs,
 * dropdowns, tooltips, popovers) and provides a global TooltipProvider.
 */
export default function I18nProvider({ children }) {
	const { i18n } = useTranslation();
	const language = i18n.resolvedLanguage || i18n.language || "en";
	const dir = getDirection(language);

	return (
		<DirectionProvider dir={dir}>
			<TooltipProvider delayDuration={300}>{children}</TooltipProvider>
		</DirectionProvider>
	);
}
