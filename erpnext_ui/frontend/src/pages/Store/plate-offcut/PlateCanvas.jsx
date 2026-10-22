import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { packPieces, pieceLabel } from "./pack";

/**
 * The plate, drawn at true scale.
 *
 * The SVG's viewBox IS the plate in millimetres -- `0 0 length_mm width_mm` --
 * so every offcut is drawn with its real dimensions and no unit conversion
 * happens anywhere in this file. A 2500x1250 plate and a 600x300 offcut are
 * simply rectangles in the same coordinate space.
 *
 * Two honesty rules, both about not overclaiming:
 *
 * - The layout is INDICATIVE. `cutting.check_offcut_fits` only asks whether each
 *   piece fits inside the plate in either orientation; the server never
 *   positions anything. So the picture shows proportion and coverage, not the
 *   order a saw would take. It is labelled as such on screen.
 * - Scrap is NOT shaded as leftover area. Weight comes from an Item Group
 *   formula that need not be linear in area, so the empty region is not
 *   necessarily the scrap weight. Utilisation is instead computed from the
 *   server's own weight figures.
 *
 * Weights shown on a piece are the server's, passed in; nothing here computes
 * one.
 */
export default function PlateCanvas({
  plateLength,
  plateWidth,
  pieces,
  weightsByRow,
  highlightedRow,
  onHighlightRow,
  utilisationPct,
}) {
  const { t } = useTranslation();

  const plateL = Number(plateLength) || 0;
  const plateW = Number(plateWidth) || 0;
  const hasGeometry = plateL > 0 && plateW > 0;

  const countsById = useMemo(() => {
    const counts = new Map();
    for (const p of pieces || []) {
      counts.set(p.id, Math.max(1, Math.floor(Number(p.count) || 1)));
    }
    return counts;
  }, [pieces]);

  const { placed, overflow } = useMemo(
    () =>
      packPieces({
        plateLength: plateL,
        plateWidth: plateW,
        pieces,
      }),
    [pieces, plateL, plateW],
  );

  if (!hasGeometry) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 px-4 text-center text-xs text-muted-foreground">
        {t("store.plateOffcut.canvasNoGeometry")}
      </div>
    );
  }

  const summary = t("store.plateOffcut.canvasSummary", {
    plate: `${plateL} x ${plateW} mm`,
    pieces: placed.length,
    overflow: overflow.length,
    utilisation: utilisationPct,
  });

  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      {/* role/label: the numbers live in the table, so the picture is never the
          only way to read them. */}
      <svg
        role="img"
        aria-label={summary}
        viewBox={`0 0 ${plateL} ${plateW}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-44 w-full sm:h-56"
      >
        {/* the plate itself */}
        <rect
          x={0}
          y={0}
          width={plateL}
          height={plateW}
          className="fill-background stroke-border"
          strokeWidth={Math.max(plateL, plateW) / 200}
        />

        {placed.map((piece) => {
          const rowWeights = weightsByRow?.get(piece.id);
          const highlighted = highlightedRow === piece.id;
          const stroke = Math.max(plateL, plateW) / 220;
          return (
            <g key={`${piece.id}#${piece.index}`}>
              {piece.shape === "Circle" ? (
                <circle
                  cx={piece.x + piece.w / 2}
                  cy={piece.y + piece.h / 2}
                  r={Math.min(piece.w, piece.h) / 2}
                  className={
                    highlighted
                      ? "fill-primary/30 stroke-primary"
                      : "fill-primary/10 stroke-primary/50"
                  }
                  strokeWidth={stroke}
                  onMouseEnter={() => onHighlightRow?.(piece.id)}
                  onMouseLeave={() => onHighlightRow?.(null)}
                />
              ) : (
                <rect
                  x={piece.x}
                  y={piece.y}
                  width={piece.w}
                  height={piece.h}
                  className={
                    highlighted
                      ? "fill-primary/30 stroke-primary"
                      : "fill-primary/10 stroke-primary/50"
                  }
                  strokeWidth={stroke}
                  onMouseEnter={() => onHighlightRow?.(piece.id)}
                  onMouseLeave={() => onHighlightRow?.(null)}
                />
              )}
              {/* Only label a piece big enough to hold the text, otherwise the
                  label is wider than the rectangle it describes. */}
              {piece.w > plateL / 9 && piece.h > plateW / 9 ? (
                <text
                  x={piece.x + piece.w / 2}
                  y={piece.y + piece.h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground"
                  fontSize={Math.max(8, Math.min(piece.w, piece.h) / 4)}
                  pointerEvents="none"
                >
                  {pieceLabel(piece, countsById)}
                </text>
              ) : null}
              <title>
                {`${pieceLabel(piece, countsById)} mm${
                  rowWeights ? ` · ${rowWeights.weight_kg} Kg` : ""
                }`}
              </title>
            </g>
          );
        })}

        {/* Pieces that cannot fit. Shown as a marker rather than silently
            omitted -- the save will refuse them, and a piece that vanished from
            the picture would read as "already counted". */}
        {overflow.length ? (
          <g>
            <rect
              x={plateL * 0.02}
              y={plateW * 0.02}
              width={plateL * 0.96}
              height={Math.max(plateW * 0.06, 1)}
              className="fill-destructive"
            />
            <text
              x={plateL / 2}
              y={plateW * 0.05}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-destructive-foreground"
              fontSize={Math.max(8, plateW / 22)}
              pointerEvents="none"
            >
              {t("store.plateOffcut.canvasOverflow", { count: overflow.length })}
            </text>
          </g>
        ) : null}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{summary}</span>
        {/* Explicit, because this is a drawing and not a cut plan. */}
        <span className="italic">{t("store.plateOffcut.canvasIndicative")}</span>
      </div>
    </div>
  );
}
