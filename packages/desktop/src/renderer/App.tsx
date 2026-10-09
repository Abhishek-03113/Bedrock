import { useCallback, useEffect, useRef, useState } from "react";
import type { NavAction, PlaybackHistoryItem } from "@bedrock/shared";
import { HomeScreen } from "./screens/HomeScreen";
import { PlayerOverlay } from "./screens/PlayerOverlay";
import { SplashScreen } from "./components/SplashScreen";
import { ToastHud, type ToastState } from "./components/Toast";

type Screen = "home" | "player";

/** Time the HUD stays up before springing away (ms). */
const TOAST_MS = 1600;

/**
 * Surfaces:
 * 1. Launcher (home) — Bedrock UI, behind a one-time startup splash
 * 2. Active source — native WebContentsView (main process); this renderer stays empty
 * 3. Temporary overlays — toast window in main while source is active; in launcher mode
 *    toasts are drawn here as a HUD capsule.
 *
 * Keyboard context:
 * - HomeScreen owns focus nav + Enter/Space activation while launcher is shown.
 * - While a source WebContentsView is active, media keys are not intercepted here;
 *   Cmd/Ctrl+Escape → home is handled in SourceHost.
 */
export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  /** The splash plays once per app launch; returning Home from a source never replays it. */
  const [splash, setSplash] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimers = useRef<number[]>([]);
  /** Last launched / focused source — restored when returning Home. */
  const [lastFocusedSourceId, setLastFocusedSourceId] = useState<string | null>(
    null,
  );

  const endSplash = useCallback(() => setSplash(false), []);

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

  // Launcher-mode toasts: HUD capsule, auto-hides after ~1.6s.
  useEffect(() => {
    if (!window.bedrock?.onToast) return;
    let seq = 0;
    const clearTimers = () => {
      toastTimers.current.forEach((t) => window.clearTimeout(t));
      toastTimers.current = [];
    };
    const unsubscribe = window.bedrock.onToast(({ message, ok }) => {
      clearTimers();
      const id = ++seq;
      setToast({ id, message, ok, visible: false });
      // Next frame so the capsule mounts hidden, then springs in.
      toastTimers.current.push(
        window.setTimeout(() => setToast((t) => (t && t.id === id ? { ...t, visible: true } : t)), 16),
        window.setTimeout(() => setToast((t) => (t && t.id === id ? { ...t, visible: false } : t)), TOAST_MS),
        window.setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), TOAST_MS + 450),
      );
    });
    return () => {
      unsubscribe();
      clearTimers();
    };
  }, []);

  if (screen === "player" && activeSourceId) {
    return <PlayerOverlay sourceId={activeSourceId} />;
  }

  return (
    <>
      <HomeScreen
        inputEnabled={!splash}
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
      <ToastHud toast={toast} />
      {splash ? <SplashScreen onDone={endSplash} /> : null}
    </>
  );
}
