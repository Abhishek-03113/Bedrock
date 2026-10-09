import { memo, useEffect, useState } from "react";
import mascotUrl from "@static/icons/bedrock-mascot-512.png";
import type { ConnectionInfo } from "../bedrock-api";
import { clockLabel } from "../format";
import { Icon } from "./Icon";

function Clock() {
  const [label, setLabel] = useState(() => clockLabel());
  useEffect(() => {
    const id = window.setInterval(() => setLabel(clockLabel()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return <time className="topbar__clock">{label}</time>;
}

function statusOf(connection: ConnectionInfo | null): { text: string; tone: "ok" | "err" | "idle" } {
  if (connection?.remoteError) return { text: "Remote unavailable", tone: "err" };
  if (connection) return { text: "Ready to pair", tone: "ok" };
  return { text: "Starting up", tone: "idle" };
}

interface TopBarProps {
  connection: ConnectionInfo | null;
  focused: boolean;
  /** Page is scrolled under the bar: use the opaque scrim. */
  solid?: boolean;
  onPair: () => void;
  onFocusRequest: (row: number, col: number) => void;
  row: number;
}

export const TopBar = memo(function TopBar({ connection, focused, solid = false, onPair, onFocusRequest, row }: TopBarProps) {
  const status = statusOf(connection);
  return (
    <header className={`topbar${solid ? " topbar--solid" : ""}`}>
      <div className="topbar__brand">
        <img className="topbar__icon" src={mascotUrl} alt="" draggable={false} />
        <span className="topbar__word">Bedrock</span>
      </div>
      <div className={`status status--${status.tone}`} role="status" aria-live="polite">
        <span className="status__dot" aria-hidden="true" />
        {status.text}
      </div>
      <div className="topbar__right">
        <Clock />
        <button
          type="button"
          className={`btn btn--glass${focused ? " is-focused" : ""}`}
          data-row={row}
          data-col={0}
          tabIndex={focused ? 0 : -1}
          aria-label="Pair phone"
          onClick={onPair}
          onMouseMove={() => onFocusRequest(row, 0)}
        >
          <Icon name="qrcode" />
          Pair phone
        </button>
      </div>
    </header>
  );
});
