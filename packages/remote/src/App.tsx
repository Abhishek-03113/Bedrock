import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RemoteSourceSummary, SourceCapabilities } from "@bedrock/shared";
import { RemoteControls } from "./screens/RemoteControls";
import { BootScreen, ConnectingScreen, ErrorScreen, PairingScreen } from "./screens/Onboarding";
import { useRemoteToast, type RemoteToast } from "./use-remote-toast";
import { createWsClient, resolveWsUrl, type ConnectionStatus, type WsClient } from "./ws-client";

type Mode = "launcher" | "player";

/** Same message twice inside this window is one HUD, not two (server + local feedback). */
const HUD_DEDUPE_MS = 800;
const HUD_DISMISS_MS = 1400;

class RemoteErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.error) return <ErrorScreen message={this.state.error} />;
    return this.props.children;
  }
}

function RemoteApp() {
  const [client, setClient] = useState<WsClient | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("CONNECTING");
  const [mode, setMode] = useState<Mode>("launcher");
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [sources, setSources] = useState<RemoteSourceSummary[]>([]);
  const [capabilities, setCapabilities] = useState<SourceCapabilities | null>(null);
  const [needsPairing, setNeedsPairing] = useState(false);
  const [paired, setPaired] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [pairErrorTick, setPairErrorTick] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);
  const awaitingPair = useRef(false);
  const { toast, show, clear: clearToast } = useRemoteToast(HUD_DISMISS_MS);

  const lastToast = useRef<{ message: string; at: number } | null>(null);
  const showToast = useCallback(
    (next: RemoteToast) => {
      const now = Date.now();
      const last = lastToast.current;
      if (last && last.message === next.message && now - last.at < HUD_DEDUPE_MS) return;
      lastToast.current = { message: next.message, at: now };
      show(next);
    },
    [show],
  );

  useEffect(() => {
    try {
      const url = resolveWsUrl({
        hostname: window.location.hostname,
        search: window.location.search,
        protocol: window.location.protocol,
        port: window.location.port,
      });
      const ws = createWsClient({ url });

      ws.onStatus(setStatus);

      ws.onHello((ack) => {
        awaitingPair.current = false;
        setPairBusy(false);
        setNeedsPairing(false);
        setPaired(true);
        setCapabilities(ack.capabilities);
        setActiveSourceId(ack.activeSourceId);
        setMode(ack.mode ?? (ack.activeSourceId ? "player" : "launcher"));
        setSources(ack.sources ?? []);
        clearToast();
      });

      ws.onContext((ctx) => {
        setCapabilities(ctx.capabilities);
        setActiveSourceId(ctx.activeSourceId);
        setMode(ctx.mode);
        setSources(ctx.sources ?? []);
      });

      ws.onError((message) => {
        if (message.includes("pairing") || message.includes("not paired")) {
          setNeedsPairing(true);
          if (awaitingPair.current) {
            awaitingPair.current = false;
            setPairBusy(false);
            setPairErrorTick((t) => t + 1);
          }
        } else {
          showToast({ message, ok: false });
        }
      });

      ws.onToast((payload) => showToast(payload));

      setClient(ws);
      return () => ws.close();
    } catch (err) {
      setBootError(err instanceof Error ? err.message : String(err));
      return undefined;
    }
    // Mount-only WS session; toast helpers are stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect once
  }, []);

  const activeSourceName = useMemo(() => {
    if (!activeSourceId) return null;
    return sources.find((s) => s.id === activeSourceId)?.displayName ?? activeSourceId;
  }, [activeSourceId, sources]);

  const submitPairing = (code: string) => {
    awaitingPair.current = true;
    setPairBusy(true);
    client?.setPairingCode(code);
  };

  if (bootError) return <ErrorScreen message={bootError} />;
  if (!client) return <BootScreen />;

  // An already-paired session that drops keeps the remote on screen with a banner.
  if (paired && !needsPairing) {
    return (
      <RemoteControls
        client={client}
        status={status}
        mode={mode}
        activeSourceName={activeSourceName}
        capabilities={capabilities}
        toast={toast}
        onToast={showToast}
      />
    );
  }

  if (needsPairing) {
    return <PairingScreen errorTick={pairErrorTick} busy={pairBusy} onSubmit={submitPairing} />;
  }

  return <ConnectingScreen />;
}

export function App() {
  return (
    <RemoteErrorBoundary>
      <RemoteApp />
    </RemoteErrorBoundary>
  );
}
