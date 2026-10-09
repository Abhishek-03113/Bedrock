import { memo } from "react";
import type { PlaybackHistoryItem } from "@bedrock/shared";
import { perfInc } from "../../shared/perf";
import { progressFraction, timeLeftLabel } from "../format";
import { brandStyle } from "../source-brand";

export interface ContinueItem extends PlaybackHistoryItem {
  sourceName: string;
  sourceIcon: string;
  title: string;
}

interface ContinueCardProps {
  item: ContinueItem;
  row: number;
  col: number;
  focused: boolean;
  onSelect: (item: ContinueItem) => void;
  onFocusRequest: (row: number, col: number) => void;
}

/** 16:9 resume card: artwork (or source logo on a tinted gradient), badges, progress. */
export const ContinueCard = memo(function ContinueCard({
  item,
  row,
  col,
  focused,
  onSelect,
  onFocusRequest,
}: ContinueCardProps) {
  perfInc("sourceTile.render");
  const left = timeLeftLabel(item);
  const progress = progressFraction(item);
  return (
    <button
      type="button"
      className={`card card--continue${focused ? " is-focused" : ""}`}
      style={brandStyle(item.sourceId) as React.CSSProperties}
      data-row={row}
      data-col={col}
      data-continue-id={item.id}
      tabIndex={focused ? 0 : -1}
      aria-label={`${item.title}, ${item.sourceName}${left ? `, ${left}` : ""}`}
      onClick={() => onSelect(item)}
      onMouseMove={() => onFocusRequest(row, col)}
    >
      <span className="card__media">
        {item.artworkUrl ? (
          <img className="card__art" src={item.artworkUrl} alt="" referrerPolicy="no-referrer" draggable={false} />
        ) : (
          <span className="card__tint">
            <img className="card__logo" src={item.sourceIcon} alt="" draggable={false} />
          </span>
        )}
        <span className="card__shade" aria-hidden="true" />
        <span className="badge badge--tl">{item.sourceName}</span>
        {left ? <span className="badge badge--tr">{left}</span> : null}
        {progress != null ? (
          <span className="card__progress" aria-hidden="true">
            <span style={{ width: `${Math.max(3, progress * 100)}%` }} />
          </span>
        ) : null}
        <span className="card__sheen" aria-hidden="true" />
      </span>
      <span className="card__meta">
        <strong>{item.title}</strong>
        <small>{item.sourceName}</small>
      </span>
    </button>
  );
});
