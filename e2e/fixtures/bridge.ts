import type { Page } from "@playwright/test";

/**
 * Mock of `window.bedrock` (see packages/desktop/src/renderer/bedrock-api.ts).
 *
 *   await installBridge(page, "withHistory");   // before page.goto()
 *   await page.goto("/");
 *   await emitNav(page, "down");                // push onNav event
 *   await emitContext(page, { mode: "player", activeSourceId: "netflix" });
 *   await emitToast(page, { message: "Hi", ok: true });
 *   const calls = await getCalls(page);         // [{ method, args }]
 *   const opened = await getCalls(page, "openSource");
 *
 * In-page handle: `window.__bedrockMock` ({ calls, emitNav, emitContext, emitToast }).
 */
export type BridgeScenario = "withHistory" | "empty" | "remoteError";

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export type MockNavAction = "up" | "down" | "left" | "right" | "select" | "back" | "home";

const ARTWORK_COLORS = ["#F36425", "#0E2C5A", "#BCE772"];

function artwork(i: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180'><rect width='320' height='180' fill='${ARTWORK_COLORS[i % 3]}'/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function buildFixtures(scenario: BridgeScenario) {
  const caps = {
    supportsSeek: true,
    supportsNextEpisode: true,
    supportsVolume: true,
    supportsScroll: true,
    supportsSearch: true,
    supportsBrowseNavigate: true,
  };
  const sources = [
    ["netflix", "Netflix"],
    ["youtube", "YouTube"],
    ["prime", "Prime Video"],
    ["hotstar", "Hotstar"],
  ].map(([id, displayName]) => ({
    id,
    displayName,
    icon: { src: `./assets/sources/${id}.svg`, alt: displayName },
    capabilities: caps,
  }));
  const now = Date.now();
  const history =
    scenario === "empty"
      ? []
      : [
          { id: 1, sourceId: "netflix", contentUrl: "https://www.netflix.com/watch/1001", title: "Midnight Orbit", artworkUrl: artwork(0), lastPlayedAt: now - 3_600_000, positionSeconds: 1320, durationSeconds: 3000 },
          { id: 2, sourceId: "youtube", contentUrl: "https://www.youtube.com/watch?v=abc", title: "Lo-fi Beats to Relax To", artworkUrl: artwork(1), lastPlayedAt: now - 86_400_000, positionSeconds: 600, durationSeconds: 5400 },
          { id: 3, sourceId: "prime", contentUrl: "https://www.primevideo.com/detail/xyz", title: "The Long Quiet", artworkUrl: "", lastPlayedAt: now - 3 * 86_400_000, positionSeconds: 90, durationSeconds: 2700 },
        ];
  const connection = {
    ip: "192.168.1.24",
    port: 8787,
    pairingCode: "482913",
    mdnsName: "bedrock.local",
    httpUrl: "http://192.168.1.24:8787",
    remoteError:
      scenario === "remoteError" ? "Port 8787 is already in use" : null,
  };
  return { sources, history, connection };
}

/** Install the mock before navigation (uses page.addInitScript). */
export async function installBridge(
  page: Page,
  scenario: BridgeScenario = "withHistory",
): Promise<void> {
  const fixtures = buildFixtures(scenario);
  await page.addInitScript((fx) => {
    type Handler = (v: never) => void;
    const calls: { method: string; args: unknown[] }[] = [];
    const handlers: Record<"nav" | "context" | "toast", Set<Handler>> = {
      nav: new Set(),
      context: new Set(),
      toast: new Set(),
    };
    const rec = <T,>(method: string, value: T) =>
      (...args: unknown[]) => {
        calls.push({ method, args });
        return Promise.resolve(value);
      };
    const sub = (kind: "nav" | "context" | "toast") => (h: Handler) => {
      handlers[kind].add(h);
      return () => handlers[kind].delete(h);
    };
    const emit = (kind: "nav" | "context" | "toast", payload: unknown) =>
      handlers[kind].forEach((h) => h(payload as never));

    (window as unknown as Record<string, unknown>).bedrock = {
      listSources: rec("listSources", fx.sources),
      openSource: rec("openSource", undefined),
      listPlaybackHistory: rec("listPlaybackHistory", fx.history),
      resumePlaybackHistory: rec("resumePlaybackHistory", undefined),
      showLauncher: rec("showLauncher", undefined),
      getConnectionInfo: rec("getConnectionInfo", fx.connection),
      onToast: sub("toast"),
      onNav: sub("nav"),
      onContext: sub("context"),
    };
    (window as unknown as Record<string, unknown>).__bedrockMock = {
      calls,
      emitNav: (a: string) => emit("nav", a),
      emitContext: (c: unknown) => emit("context", c),
      emitToast: (t: unknown) => emit("toast", t),
    };
  }, fixtures);
}

export async function emitNav(page: Page, action: MockNavAction): Promise<void> {
  await page.evaluate(
    (a) => (window as any).__bedrockMock.emitNav(a),
    action,
  );
}

export async function emitContext(
  page: Page,
  ctx: { mode: "launcher" | "player"; activeSourceId: string | null },
): Promise<void> {
  await page.evaluate((c) => (window as any).__bedrockMock.emitContext(c), ctx);
}

export async function emitToast(
  page: Page,
  toast: { message: string; ok: boolean },
): Promise<void> {
  await page.evaluate((t) => (window as any).__bedrockMock.emitToast(t), toast);
}

/** Recorded bridge calls, optionally filtered by method name. */
export async function getCalls(page: Page, method?: string): Promise<RecordedCall[]> {
  const all: RecordedCall[] = await page.evaluate(
    () => (window as any).__bedrockMock.calls.slice(),
  );
  return method ? all.filter((c) => c.method === method) : all;
}
