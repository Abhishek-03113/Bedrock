import { memo } from "react";
import mascotUrl from "@static/icons/bedrock-mascot-512.png";
import { greeting, lastWatchedLabel, timeLeftLabel } from "../format";
import { brandStyle } from "../source-brand";
import type { ContinueItem } from "./ContinueCard";
import { Icon } from "./Icon";

interface HeroProps {
  item: ContinueItem | null;
  /** Focused column in the hero row, or -1 when focus is elsewhere. */
  focusCol: number;
  row: number;
  onResume: (item: ContinueItem) => void;
  onOpenSource: (id: string) => void;
  onPair: () => void;
  onFocusRequest: (row: number, col: number) => void;
}

export const Hero = memo(function Hero({
  item,
  focusCol,
  row,
  onResume,
  onOpenSource,
  onPair,
  onFocusRequest,
}: HeroProps) {
  if (!item) return <WelcomeHero focused={focusCol === 0} row={row} onPair={onPair} onFocusRequest={onFocusRequest} />;

  const left = timeLeftLabel(item);
  const meta = [left, lastWatchedLabel(item.lastPlayedAt)].filter(Boolean);
  return (
    <section className="hero" aria-label="Featured" style={brandStyle(item.sourceId) as React.CSSProperties}>
      <div className="hero__backdrop" key={item.id} aria-hidden="true">
        {item.artworkUrl ? (
          <img src={item.artworkUrl} alt="" referrerPolicy="no-referrer" draggable={false} />
        ) : (
          <div className="hero__field" />
        )}
      </div>
      <div className="hero__scrim" aria-hidden="true" />
      <div className="hero__content" key={`c${item.id}`}>
        <p className="eyebrow">{item.sourceName}</p>
        <h1 className="hero__title">{item.title}</h1>
        <p className="hero__meta">
          {meta.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </p>
        <div className="hero__actions">
          <button
            type="button"
            className={`btn btn--primary${focusCol === 0 ? " is-focused" : ""}`}
            data-row={row}
            data-col={0}
            data-action="resume"
            tabIndex={focusCol === 0 ? 0 : -1}
            onClick={() => onResume(item)}
            onMouseMove={() => onFocusRequest(row, 0)}
          >
            <Icon name="play.fill" />
            Resume
          </button>
          <button
            type="button"
            className={`btn btn--glass${focusCol === 1 ? " is-focused" : ""}`}
            data-row={row}
            data-col={1}
            data-action="open-source"
            tabIndex={focusCol === 1 ? 0 : -1}
            onClick={() => onOpenSource(item.sourceId)}
            onMouseMove={() => onFocusRequest(row, 1)}
          >
            Open {item.sourceName}
          </button>
        </div>
      </div>
    </section>
  );
});

function WelcomeHero({
  focused,
  row,
  onPair,
  onFocusRequest,
}: {
  focused: boolean;
  row: number;
  onPair: () => void;
  onFocusRequest: (row: number, col: number) => void;
}) {
  const { hello, question } = greeting();
  return (
    <section className="hero hero--welcome" aria-label="Welcome">
      <div className="hero__backdrop" aria-hidden="true">
        <div className="hero__field hero__field--welcome" />
      </div>
      <div className="hero__scrim" aria-hidden="true" />
      <div className="hero__content">
        <p className="eyebrow">Welcome to Bedrock</p>
        <h1 className="hero__title">{hello}</h1>
        <p className="hero__question">{question}</p>
        <p className="hero__sub">
          Your phone is the remote. Pair it once, then browse, play and pause everything from bed.
        </p>
        <div className="hero__actions">
          <button
            type="button"
            className={`btn btn--primary${focused ? " is-focused" : ""}`}
            data-row={row}
            data-col={0}
            data-action="pair"
            tabIndex={focused ? 0 : -1}
            onClick={onPair}
            onMouseMove={() => onFocusRequest(row, 0)}
          >
            <Icon name="iphone" />
            Pair your phone
          </button>
        </div>
      </div>
      <img className="hero__mascot" src={mascotUrl} alt="" draggable={false} />
    </section>
  );
}
