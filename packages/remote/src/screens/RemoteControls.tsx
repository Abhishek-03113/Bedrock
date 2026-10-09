import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeCommand,
  describeFailure,
  describeNav,
  type NavAction,
  type RemoteCommand,
  type SourceCapabilities,
} from "@bedrock/shared";
import type { ConnectionStatus, WsClient } from "../ws-client";
import { resolveControlAction } from "../remote-actions";
import { Clickpad } from "../components/Clickpad";
import { DPad } from "../components/DPad";
import { Hud } from "../components/Hud";
import { Icon, type IconName } from "../components/Icon";
import { KeyboardInput } from "../components/KeyboardInput";
import { MoreSheet } from "../components/MoreSheet";
import { SearchSheet } from "../components/SearchSheet";
import { SegmentedControl } from "../components/SegmentedControl";
import { Transport } from "../components/Transport";
import { ActivityIndicator } from "../components/ActivityIndicator";

type InputMode = "touch" | "dpad";
type Sheet = "keyboard" | "more" | "search" | null;

const INPUT_MODE_KEY = "bedrock.remote.inputMode";

function readInputMode(): InputMode {
  try {
    const v = window.localStorage.getItem(INPUT_MODE_KEY);
    if (v === "dpad" || v === "touch") return v;
  } catch {
    /* storage unavailable */
  }
  return "touch";
}

interface RemoteControlsProps {
  client: WsClient;
  status: ConnectionStatus;
  mode: "launcher" | "player";
  activeSourceName: string | null;
  capabilities: SourceCapabilities | null;
  toast: { message: string; ok: boolean } | null;
  onToast: (toast: { message: string; ok: boolean }) => void;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="glass-button" aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={22} />
    </button>
  );
}

/**
 * Phone remote chrome — source-agnostic. Never branches on Netflix/YouTube/etc.
 */
export function RemoteControls({
  client,
  status,
  mode,
  activeSourceName,
  capabilities,
  toast,
  onToast,
}: RemoteControlsProps) {
  const [inputMode, setInputModeState] = useState<InputMode>(readInputMode);
  const [sheet, setSheet] = useState<Sheet>(null);
  const padRef = useRef<HTMLDivElement | null>(null);

  const online = status === "CONNECTED";
  const seek = capabilities?.supportsSeek ?? true;
  const volume = capabilities?.supportsVolume ?? true;
  const next = capabilities?.supportsNextEpisode ?? false;
  const browse = capabilities?.supportsBrowseNavigate ?? true;
  const canSearch = (capabilities?.supportsSearch ?? false) && mode === "player";
  const isPlayer = mode === "player";

  const setInputMode = (m: InputMode) => {
    setInputModeState(m);
    try {
      window.localStorage.setItem(INPUT_MODE_KEY, m);
    } catch {
      /* storage unavailable */
    }
  };

  // Keep the control surface from scrolling/zooming under thumbs.
  useEffect(() => {
    const el = padRef.current;
    if (!el) return;
    const block = (event: TouchEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, .sheet")) {
        return;
      }
      event.preventDefault();
    };
    el.addEventListener("touchmove", block, { passive: false });
    return () => el.removeEventListener("touchmove", block);
  }, []);

  // Offline: the "Reconnecting…" banner already says it; stay quiet.
  const offline = useCallback(() => undefined, []);

  const press = async (action: NavAction) => {
    if (!online) return offline();
    const dispatch = resolveControlAction(mode, action);
    try {
      if (dispatch.kind === "nav") {
        await client.sendNav(dispatch.action);
        onToast({ message: describeNav(dispatch.action), ok: true });
        return;
      }
      const result = await client.sendCommand(dispatch.command);
      onToast(
        result.ok
          ? { message: describeCommand(dispatch.command), ok: true }
          : { message: describeFailure(describeCommand(dispatch.command), result.reason), ok: false },
      );
    } catch {
      offline();
    }
  };

  const pressCommand = async (command: RemoteCommand) => {
    if (!online) return offline();
    try {
      const result = await client.sendCommand(command);
      onToast(
        result.ok
          ? { message: describeCommand(command), ok: true }
          : { message: describeFailure(describeCommand(command), result.reason), ok: false },
      );
    } catch {
      offline();
    }
  };

  const title = isPlayer && activeSourceName ? activeSourceName : "Home";
  const dpadDisabled = isPlayer && !browse;

  return (
    <main className={`remote${online ? "" : " remote--offline"}${toast ? " remote--hud" : ""}`} ref={padRef}>
      <Hud toast={toast} />
      {!online ? (
        <div className="banner" role="status" aria-live="polite">
          <ActivityIndicator size={16} />
          <span>Reconnecting…</span>
        </div>
      ) : null}

      <header className="header">
        <div className="header__text">
          <h1 className="header__title">{title}</h1>
          <p className={`status${online ? "" : " status--warn"}`}>
            <span className="status__dot" aria-hidden="true" />
            {online ? "Connected" : "Reconnecting…"}
          </p>
        </div>
        <button type="button" className="glass-button" aria-label="More" onClick={() => setSheet("more")}>
          <Icon name="ellipsis" size={22} />
        </button>
      </header>

      <nav className="toolbar" aria-label="System">
        <ToolbarButton icon="chevron.left" label="Back" onClick={() => void press("back")} />
        <ToolbarButton icon="house.fill" label="Home" onClick={() => void press("home")} />
        {canSearch ? (
          <ToolbarButton icon="magnifyingglass" label="Search" onClick={() => setSheet("search")} />
        ) : null}
        <ToolbarButton icon="keyboard" label="Keyboard" onClick={() => setSheet("keyboard")} />
      </nav>

      <SegmentedControl<InputMode>
        label="Input"
        value={inputMode}
        onChange={setInputMode}
        options={[
          { value: "touch", label: "Touch" },
          { value: "dpad", label: "D-pad" },
        ]}
      />

      <section className="surface" aria-label="Input">
        {inputMode === "touch" ? (
          <Clickpad client={client} status={status} onToast={onToast} />
        ) : (
          <DPad disabled={dpadDisabled} onPress={(a) => void press(a)} />
        )}
      </section>

      {isPlayer ? (
        <Transport
          canSeek={seek}
          canVolume={volume}
          canNext={next}
          onPlayPause={() => void pressCommand({ type: "toggle-play-pause" })}
          onSeek={(d) => void pressCommand({ type: "seek", deltaSeconds: d })}
          onNext={() => void pressCommand({ type: "next-episode" })}
          onVolume={(d) => void pressCommand({ type: "volume", direction: d })}
        />
      ) : (
        <div className="launcher-hint">
          <Icon name="tv" size={22} />
          <p>Choose an app on your TV to start watching</p>
        </div>
      )}

      {sheet === "keyboard" ? (
        <KeyboardInput client={client} onClose={() => setSheet(null)} onToast={onToast} />
      ) : null}
      {sheet === "more" ? <MoreSheet client={client} onClose={() => setSheet(null)} onToast={onToast} /> : null}
      {sheet === "search" ? (
        <SearchSheet
          sourceName={activeSourceName}
          onClose={() => setSheet(null)}
          onSubmit={(query) => void pressCommand({ type: "search", query })}
        />
      ) : null}
    </main>
  );
}
