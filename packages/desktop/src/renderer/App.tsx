import { useEffect, useState } from "react";
import type { NavAction, PlaybackHistoryItem } from "@bedrock/shared";
import { HomeScreen } from "./screens/HomeScreen";
import { PlayerOverlay } from "./screens/PlayerOverlay";

type Screen = "home" | "player";

/**
 * Surfaces:
 * 1. Launcher (home) — Bedrock UI
 * 2. Active source — native WebContentsView (main process); this renderer stays empty
 * 3. Temporary overlays — toast window in main while source is active
 *
 * Keyboard context:
 * - HomeScreen owns tile nav + Enter/Space activation while launcher is shown.
 * - While a source WebContentsView is active, media keys are not intercepted here;
 *   Cmd/Ctrl+Escape → home is handled in SourceHost.
 */
export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  /** Last launched / focused source — restored when returning Home. */
  const [lastFocusedSourceId, setLastFocusedSourceId] = useState<string | null>(
    null,
  );

  const goHome = () => {
    setScreen("home");
    setActiveSourceId(null);
    void window.bedrock?.showLauncher();
  };

  // Main-process Escape / host transitions (source view has focus).
  useEffect(() => {
    if (!window.bedrock?.onContext) return;
    return window.bedrock.onContext(({ mode, activeSourceId: id }) => {
      if (mode === "launcher") {
        setScreen("home");
        setActiveSourceId(null);
        return;
      }
      if (mode === "player" && id) {
        setLastFocusedSourceId(id);
        setActiveSourceId(id);
        setScreen("player");
      }
    });
  }, []);

  useEffect(() => {
    if (screen !== "player" || !window.bedrock?.onNav) return;
    return window.bedrock.onNav((action: NavAction) => {
      if (action === "home" || action === "back") goHome();
    });
  }, [screen]);

  if (screen === "player" && activeSourceId) {
    return <PlayerOverlay sourceId={activeSourceId} />;
  }

  return (
    <HomeScreen
      initialFocusSourceId={lastFocusedSourceId}
      onResumePlaybackHistory={(item: PlaybackHistoryItem) => {
        setLastFocusedSourceId(item.sourceId);
        setActiveSourceId(item.sourceId);
        setScreen("player");
        void window.bedrock?.resumePlaybackHistory(item).catch((error) => {
          console.warn("[launcher] saved playback URL could not be opened", error);
          setActiveSourceId(null);
          setScreen("home");
        });
      }}
      onSelectSource={(id) => {
        setLastFocusedSourceId(id);
        setActiveSourceId(id);
        setScreen("player");
        void window.bedrock?.openSource(id).catch(() => {
          setActiveSourceId(null);
          setScreen("home");
        });
      }}
    />
  );
}
