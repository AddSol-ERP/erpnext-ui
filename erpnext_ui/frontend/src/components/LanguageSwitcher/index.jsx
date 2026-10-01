import { useTranslation } from "react-i18next";
import { Languages, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES } from "@/i18n";

export default function LanguageSwitcher() {
	const { t, i18n } = useTranslation();
	const current = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					title={t("theme.language")}
					aria-label={t("theme.language")}
				>
					<Languages />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-36">
				{SUPPORTED_LANGUAGES.map((lng) => (
					<DropdownMenuItem
						key={lng}
						onSelect={() => i18n.changeLanguage(lng)}
						className="justify-between gap-4"
					>
						<span>{t(`language.${lng}`)}</span>
						{current === lng && <Check className="size-4 text-primary" />}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
