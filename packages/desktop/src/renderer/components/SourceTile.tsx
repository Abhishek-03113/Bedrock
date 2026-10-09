import { memo } from "react";
import { perfInc } from "../../shared/perf";
import { brandStyle } from "../source-brand";

interface SourceTileProps {
  id: string;
  displayName: string;
  icon: { src: string; alt?: string };
  row: number;
  col: number;
  focused?: boolean;
  onSelect: (id: string) => void;
  onFocusRequest?: (row: number, col: number) => void;
}

/**
 * tvOS-style app card. Renders from MediaSource metadata + a brand tint looked up by id —
 * no source-specific logic. memo: focus changes re-render only the old/new focused tiles
 * when the parent keeps onSelect / onFocusRequest referentially stable.
 */
export const SourceTile = memo(function SourceTile({
  id,
  displayName,
  icon,
  row,
  col,
  focused = false,
  onSelect,
  onFocusRequest,
}: SourceTileProps) {
  perfInc("sourceTile.render");
  return (
    <button
      type="button"
      className={`card card--app${focused ? " is-focused" : ""}`}
      style={brandStyle(id) as React.CSSProperties}
      data-source-id={id}
      data-row={row}
      data-col={col}
      tabIndex={focused ? 0 : -1}
      aria-label={icon.alt ?? displayName}
      onClick={() => onSelect(id)}
      onMouseMove={() => onFocusRequest?.(row, col)}
    >
      <span className="card__media">
        <span className="card__tint">
          <img className={`card__logo card__logo--${id}`} src={icon.src} alt="" draggable={false} />
        </span>
        <span className="card__sheen" aria-hidden="true" />
      </span>
      <span className="card__meta card__meta--center">
        <strong>{displayName}</strong>
      </span>
    </button>
  );
});
