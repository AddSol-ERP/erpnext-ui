import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Type, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { getDirection } from "../../i18n";
import { saveFontSize } from "../../utils/fontSize";

const OPTIONS = ["extraSmall", "small", "medium", "extraLarge"];

export default function FontSizeControl() {
	const { t, i18n } = useTranslation();
	const [selected, setSelected] = useState(
		() => document.documentElement.dataset.fontSize || "small",
	);

	const chooseSize = (size) => setSelected(saveFontSize(size));

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					title={t("theme.textSize")}
					aria-label={t("theme.textSize")}
				>
					<Type />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				dir={getDirection(i18n.resolvedLanguage || i18n.language)}
				align="end"
				className="w-48 p-2"
			>
				<div className="px-2 py-1 text-sm font-medium">{t("theme.textSize")}</div>
				{OPTIONS.map((size) => (
					<button
						key={size}
						type="button"
						className="flex w-full items-center justify-between rounded-md px-2 py-2 text-start text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-pressed={selected === size}
						onClick={() => chooseSize(size)}
					>
						<span>{t(`theme.fontSize.${size}`)}</span>
						{selected === size && <Check className="size-4" />}
					</button>
				))}
			</PopoverContent>
		</Popover>
	);
}
