import { test as base } from "@playwright/test";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * Mock desktop WebSocket server speaking packages/shared/src/ws-protocol.ts.
 *
 *   import { test, expect } from "../fixtures/mock-remote-server";
 *   test("x", async ({ page, mockRemote }) => {
 *     await page.goto(mockRemote.phoneUrl);
 *     await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "toggle-play-pause" });
 *   });
 *
 * Per-describe options: `test.use({ mockRemoteOptions: { requirePairing: "482913" } })`.
 */
export interface MockRemoteOptions {
  mode?: "launcher" | "player";
  /** If set, hellos without this exact pairingCode get an `error` containing "pairing". */
  requirePairing?: string;
}

export interface MockRemote {
  port: number;
  /** ws://localhost:<port> */
  url: string;
  /** http://localhost:5174/?ws=ws://localhost:<port> */
  phoneUrl: string;
  /** Every client message received, in order. */
  messages: any[];
  /** Just the `command` payloads. */
  commands(): any[];
  /** Messages of a given kind (hello, command, input, nav). */
  ofKind(kind: string): any[];
  /** Push a server message to all connected clients. */
  broadcast(msg: unknown): void;
  close(): Promise<void>;
}

const ALL_CAPS = {
  supportsSeek: true,
  supportsNextEpisode: true,
  supportsVolume: true,
  supportsScroll: true,
  supportsSearch: true,
  supportsBrowseNavigate: true,
};
const SOURCES = [
  { id: "netflix", displayName: "Netflix" },
  { id: "youtube", displayName: "YouTube" },
  { id: "prime", displayName: "Prime Video" },
  { id: "hotstar", displayName: "Hotstar" },
];

export async function startMockRemote(opts: MockRemoteOptions = {}): Promise<MockRemote> {
  const mode = opts.mode ?? "player";
  const messages: any[] = [];
  const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await new Promise<void>((r) => wss.once("listening", () => r()));
  const port = (wss.address() as AddressInfo).port;

  const send = (ws: WebSocket, msg: unknown) => ws.send(JSON.stringify(msg));
  wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      messages.push(msg);
      if (msg.kind === "hello") {
        if (opts.requirePairing && msg.pairingCode !== opts.requirePairing) {
          send(ws, { kind: "error", message: "pairing code required" });
          return;
        }
        send(ws, {
          kind: "hello-ack",
          sessionId: "mock-session",
          mode,
          activeSourceId: mode === "player" ? "netflix" : null,
          capabilities: mode === "player" ? ALL_CAPS : null,
          sources: SOURCES,
        });
      } else if (msg.requestId) {
        send(ws, { kind: "command-result", requestId: msg.requestId, result: { ok: true } });
      }
    });
  });

  return {
    port,
    url: `ws://localhost:${port}`,
    phoneUrl: `http://localhost:5174/?ws=${encodeURIComponent(`ws://localhost:${port}`)}`,
    messages,
    commands: () => messages.filter((m) => m.kind === "command").map((m) => m.command),
    ofKind: (k) => messages.filter((m) => m.kind === k),
    broadcast: (m) => wss.clients.forEach((c) => send(c, m)),
    close: () =>
      new Promise<void>((r) => {
        wss.clients.forEach((c) => c.terminate());
        wss.close(() => r());
      }),
  };
}

export const test = base.extend<{
  mockRemoteOptions: MockRemoteOptions;
  mockRemote: MockRemote;
}>({
  mockRemoteOptions: [{}, { option: true }],
  mockRemote: async ({ mockRemoteOptions }, use) => {
    const server = await startMockRemote(mockRemoteOptions);
    await use(server);
    await server.close();
  },
});
export { expect } from "@playwright/test";
