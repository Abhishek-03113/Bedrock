import type { RemoteKey } from "@bedrock/shared";
import { describeFailure } from "@bedrock/shared";
import type { WsClient } from "../ws-client";
import { Sheet, useSheetClose } from "./Sheet";
import { Icon, type IconName } from "./Icon";

const KEYS: Array<{ label: string; key: RemoteKey; icon: IconName; feedback: string }> = [
  { label: "Esc", key: "Escape", icon: "escape", feedback: "Escape" },
  { label: "Tab", key: "Tab", icon: "tab", feedback: "Tab" },
  { label: "Delete", key: "Backspace", icon: "delete.left", feedback: "Delete" },
  { label: "Return", key: "Enter", icon: "return", feedback: "Return" },
  { label: "Up", key: "ArrowUp", icon: "arrow.up", feedback: "Up" },
  { label: "Down", key: "ArrowDown", icon: "arrow.down", feedback: "Down" },
  { label: "Left", key: "ArrowLeft", icon: "arrow.left", feedback: "Left" },
  { label: "Right", key: "ArrowRight", icon: "arrow.right", feedback: "Right" },
];

interface MoreSheetProps {
  client: WsClient;
  onClose: () => void;
  onToast: (toast: { message: string; ok: boolean }) => void;
}

/** "More" sheet: special keys as an icon grid. */
export function MoreSheet({ client, onClose, onToast }: MoreSheetProps) {
  return (
    <Sheet label="More" onClose={onClose}>
      <MoreBody client={client} onToast={onToast} />
    </Sheet>
  );
}

function MoreBody({ client, onToast }: Omit<MoreSheetProps, "onClose">) {
  const close = useSheetClose();

  const press = async (key: RemoteKey, feedback: string) => {
    try {
      navigator.vibrate?.(8);
    } catch {
      /* best-effort */
    }
    try {
      await client.sendInput({ type: "key-down", key }, { awaitResult: true });
      await client.sendInput({ type: "key-up", key }, { awaitResult: true });
      onToast({ message: feedback, ok: true });
    } catch {
      onToast({ message: describeFailure(feedback), ok: false });
    }
  };

  return (
    <>
      <div className="sheet__bar">
        <h2 className="sheet__title">More</h2>
        <button type="button" className="text-button text-button--bold" onClick={close}>
          Done
        </button>
      </div>
      <p className="section-label">Keys</p>
      <div className="key-grid">
        {KEYS.map((k) => (
          <button
            key={k.key}
            type="button"
            className="key-tile"
            aria-label={k.label}
            onClick={() => void press(k.key, k.feedback)}
          >
            <Icon name={k.icon} size={26} />
            <span>{k.label}</span>
          </button>
        ))}
      </div>
      <p className="footnote">Keys go to the app that’s open on your TV.</p>
    </>
  );
}
