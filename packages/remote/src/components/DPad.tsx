import { useRef, useState } from "react";
import type { NavAction } from "@bedrock/shared";
import { Icon, type IconName } from "./Icon";

type Dir = "up" | "down" | "left" | "right";
const ZONES: Array<{ dir: Dir; icon: IconName; label: string }> = [
  { dir: "up", icon: "chevron.up", label: "Up" },
  { dir: "left", icon: "chevron.left", label: "Left" },
  { dir: "right", icon: "chevron.right", label: "Right" },
  { dir: "down", icon: "chevron.down", label: "Down" },
];

/** Siri-Remote-style clickpad ring: four directional zones + centre select. */
export function DPad({
  disabled,
  onPress,
}: {
  disabled?: boolean;
  onPress: (action: NavAction) => void;
}) {
  const [pressed, setPressed] = useState<NavAction | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = (action: NavAction) => {
    try {
      navigator.vibrate?.(8);
    } catch {
      /* haptics are best-effort */
    }
    setPressed(action);
    if (timer.current != null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPressed(null), 160);
    onPress(action);
  };

  return (
    <div className={`dpad${disabled ? " is-disabled" : ""}`} role="group" aria-label="Directional pad">
      <div className="dpad__ring">
        {ZONES.map((z) => (
          <button
            key={z.dir}
            type="button"
            className={`dpad__zone dpad__zone--${z.dir}${pressed === z.dir ? " is-pressed" : ""}`}
            aria-label={z.label}
            disabled={disabled}
            onClick={() => fire(z.dir)}
          >
            <Icon name={z.icon} size={26} />
          </button>
        ))}
        <button
          type="button"
          className={`dpad__select${pressed === "select" ? " is-pressed" : ""}`}
          aria-label="Select"
          disabled={disabled}
          onClick={() => fire("select")}
        />
      </div>
    </div>
  );
}
