import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Palette, Sun, Moon, Check, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { getDirection } from "@/i18n";

const DEFAULT_CONFIG = { primary: "#4f46e5", secondary: "#6366f1", mode: "light" };

const SWATCHES = [
	"#4f46e5",
	"#6366f1",
	"#3b82f6",
	"#10b981",
	"#f59e0b",
	"#f43f5e",
];

function readSavedConfig() {
	try {
		const saved = localStorage.getItem("app_theme");
		if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
	} catch (e) {
		console.error("Failed to load saved theme:", e);
	}
	return DEFAULT_CONFIG;
}

function Swatch({ color, active, onSelect }) {
	return (
		<button
			type="button"
			aria-label={color}
			className="relative size-7 rounded-full ring-1 ring-foreground/20 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			style={{ background: color }}
			onClick={() => onSelect(color)}
		>
			{active && (
				<Check className="absolute inset-0 m-auto size-4 text-white drop-shadow" />
			)}
		</button>
	);
}

export default function ThemePanel({ applyTheme }) {
	const { t, i18n } = useTranslation();
	const [open, setOpen] = useState(false);
	// Lazy init: reads localStorage once, no effect/setState cascade.
	const [config, setConfig] = useState(readSavedConfig);
	const [showJson, setShowJson] = useState(false);
	const [json, setJson] = useState("");
	const [jsonError, setJsonError] = useState("");

	const persist = (next) => {
		setConfig(next);
		applyTheme(next);
		localStorage.setItem("app_theme", JSON.stringify(next));
	};

	const setMode = (mode) => persist({ ...config, mode });
	const setColor = (key, value) => persist({ ...config, [key]: value });

	const openJson = () => {
		setJson(JSON.stringify(config, null, 2));
		setJsonError("");
		setShowJson(true);
	};

	const applyJson = () => {
		try {
			const parsed = JSON.parse(json);
			persist({ ...DEFAULT_CONFIG, ...parsed });
			setJsonError("");
		} catch {
			setJsonError(t("common.invalidJson"));
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					title={t("theme.appearance")}
					aria-label={t("theme.appearance")}
				>
					<Palette />
				</Button>
			</PopoverTrigger>

			<PopoverContent
				dir={getDirection(i18n.resolvedLanguage || i18n.language)}
				align="end"
				className="w-72 p-4"
			>
				<div className="mb-3 text-sm font-medium">{t("theme.appearance")}</div>

				{/* MODE */}
				<div className="mb-4">
					<div className="mb-1.5 text-xs text-muted-foreground">
						{t("theme.mode")}
					</div>
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
								config.mode === "dark"
									? "border-primary bg-primary/10 text-primary"
									: "border-border hover:bg-muted"
							}`}
							onClick={() => setMode("dark")}
						>
							<Sun className="size-4" />
							{t("theme.dark")}
						</button>
						<button
							type="button"
							className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
								config.mode === "light"
									? "border-primary bg-primary/10 text-primary"
									: "border-border hover:bg-muted"
							}`}
							onClick={() => setMode("light")}
						>
							<Moon className="size-4" />
							{t("theme.light")}
						</button>
					</div>
				</div>

				{/* PRIMARY COLOR */}
				<div className="mb-3">
					<div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
						<span>{t("theme.brandColor")}</span>
						<input
							type="color"
							className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
							value={config.primary}
							onChange={(e) => setColor("primary", e.target.value)}
							aria-label={t("theme.brandColor")}
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						{SWATCHES.map((c) => (
							<Swatch
								key={`p-${c}`}
								color={c}
								active={config.primary?.toLowerCase() === c}
								onSelect={(color) => setColor("primary", color)}
							/>
						))}
					</div>
				</div>

				{/* SECONDARY COLOR */}
				<div className="mb-4">
					<div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
						<span>{t("theme.secondaryColor")}</span>
						<input
							type="color"
							className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
							value={config.secondary}
							onChange={(e) => setColor("secondary", e.target.value)}
							aria-label={t("theme.secondaryColor")}
						/>
					</div>
					<div className="flex flex-wrap gap-2">
						{SWATCHES.map((c) => (
							<Swatch
								key={`s-${c}`}
								color={c}
								active={config.secondary?.toLowerCase() === c}
								onSelect={(color) => setColor("secondary", color)}
							/>
						))}
					</div>
				</div>

				{/* ADVANCED JSON */}
				{!showJson ? (
					<button
						type="button"
						className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
						onClick={openJson}
					>
						<Code2 className="size-3.5" />
						Advanced (JSON)
					</button>
				) : (
					<div className="space-y-2">
						<textarea
							className="h-24 w-full rounded-lg border border-border bg-input/50 p-2 font-mono text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
							value={json}
							onChange={(e) => setJson(e.target.value)}
						/>
						{jsonError && <div className="text-xs text-destructive">{jsonError}</div>}
						<div className="flex gap-2">
							<Button size="xs" onClick={applyJson}>
								{t("common.apply")}
							</Button>
							<Button
								size="xs"
								variant="outline"
								onClick={() => setShowJson(false)}
							>
								{t("common.close")}
							</Button>
						</div>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
