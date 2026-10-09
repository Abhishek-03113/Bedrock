import { Icon } from "./Icon";

export interface ToastState {
  id: number;
  message: string;
  ok: boolean;
  visible: boolean;
}

/** tvOS-style HUD capsule, top center, regular material. Always mounted so the live region announces. */
export function ToastHud({ toast }: { toast: ToastState | null }) {
  return (
    <div className="hud" role="status" aria-live="polite">
      {toast ? (
        <div
          key={toast.id}
          className={`hud__capsule${toast.visible ? " hud__capsule--in" : ""}${toast.ok ? "" : " hud__capsule--err"}`}
        >
          <Icon name={toast.ok ? "checkmark.circle.fill" : "xmark.circle.fill"} className="hud__icon" />
          <span>{toast.message}</span>
        </div>
      ) : null}
    </div>
  );
}
