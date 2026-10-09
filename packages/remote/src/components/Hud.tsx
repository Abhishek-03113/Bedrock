import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export interface HudMessage {
  message: string;
  ok: boolean;
}

/** Dynamic-Island-style capsule under the safe area. Announced via aria-live. */
export function Hud({ toast }: { toast: HudMessage | null }) {
  const [shown, setShown] = useState<HudMessage | null>(toast);
  useEffect(() => {
    if (toast) setShown(toast);
  }, [toast]);

  return (
    <div className="hud-wrap" role="status" aria-live="polite" aria-atomic="true">
      <div className={`hud${toast ? " is-visible" : ""}${shown && !shown.ok ? " hud--error" : ""}`}>
        {shown ? (
          <>
            <Icon name={shown.ok ? "checkmark.circle.fill" : "xmark.circle.fill"} size={22} className="hud__icon" />
            <span className="hud__text">{shown.message}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
