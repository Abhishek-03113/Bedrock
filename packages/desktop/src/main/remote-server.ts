import { createServer, type Server as HttpServer } from "node:http";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type {
  CommandResult,
  InputCommand,
  NavAction,
  PointerButton,
  RemoteKey,
  RemoteSourceSummary,
  SourceCapabilities,
  WsServerMessage,
} from "@bedrock/shared";
import {
  describeCommand,
  describeFailure,
  describeInput,
  describeNav,
  parseInputCommand,
  parseNavAction,
  parseRemoteCommand,
} from "@bedrock/shared";
import { listSources, SOURCES } from "./sources/registry.js";
import type { SourceHost } from "./source-host.js";
import { authorizeHello } from "./pairing.js";
import { handleRemoteStaticRequest } from "./remote-static.js";

export interface RemoteServerDeps {
  getSourceHost: () => SourceHost | null;
  onToast: (payload: { message: string; ok: boolean }) => void;
  onNav: (action: NavAction) => void;
  /** Built remote UI directory; null → HTTP returns 503 for UI (WS still works). */
  staticRoot: string | null;
  host?: string;
  port?: number;
}

export interface RemoteServer {
  port: number;
  host: string;
  broadcast: (message: WsServerMessage) => void;
  close: () => Promise<void>;
}

export const DEFAULT_REMOTE_PORT = 17832;

const authorized = new WeakSet<WebSocket>();

/** Pre-auth messages are tiny JSON; ws defaults to 100 MiB which is a memory DoS. */
const MAX_WS_PAYLOAD = 64 * 1024;
const AUTH_DEADLINE_MS = 10_000;
const MAX_FAILED_HELLOS_PER_SOCKET = 5;
const MAX_FAILED_HELLOS_PER_IP = 10;
const FAILED_HELLO_WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 256;
const HEARTBEAT_INTERVAL_MS = 15_000;
const CLOSE_GRACE_MS = 1_000;
const MAX_ID_LENGTH = 128;
const PAIRING_REQUIRED_REASON = "pairing required — enter the code shown on the TV";
const RATE_LIMITED_REASON = "too many pairing attempts — wait a minute";

/** Extract a lowercased hostname (no port, no IPv6 brackets) from a Host header. */
function hostnameFromHostHeader(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v.startsWith("[")) {
    const end = v.indexOf("]");
    return end > 1 ? v.slice(1, end) : null;
  }
  const colon = v.indexOf(":");
  const name = colon === -1 ? v : v.slice(0, colon);
  return name || null;
}

function hostnameFromOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    let name = url.hostname.toLowerCase();
    if (name.startsWith("[") && name.endsWith("]")) name = name.slice(1, -1);
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Gate WebSocket upgrades. WebSockets are not covered by CORS, so any web page
 * (including the streaming sites Bedrock loads) could otherwise reach us.
 * - Host must be an IP literal, localhost, or *.local (blocks DNS rebinding).
 * - A browser Origin, when present, must be same-host (any port).
 * - No Origin → non-browser client (scripts, tests) → allowed.
 */
export function isAllowedUpgrade(opts: { origin?: string; host?: string }): boolean {
  if (typeof opts.host !== "string") return false;
  const hostName = hostnameFromHostHeader(opts.host);
  if (!hostName) return false;
  if (isIP(hostName) === 0 && hostName !== "localhost" && !hostName.endsWith(".local")) {
    return false;
  }
  if (opts.origin === undefined) return true;
  const originName = hostnameFromOrigin(opts.origin);
  return originName !== null && originName === hostName;
}

interface ConnState {
  failedHellos: number;
  authTimer: NodeJS.Timeout | null;
  keysDown: Set<RemoteKey>;
  buttonsDown: Set<PointerButton>;
  alive: boolean;
}

/** Fixed-window failed-hello counter per remote IP; bounded in size. */
class HelloFailureLimiter {
  private readonly entries = new Map<string, { count: number; windowStart: number }>();

  isBlocked(ip: string, now = Date.now()): boolean {
    const e = this.entries.get(ip);
    if (!e) return false;
    if (now - e.windowStart >= FAILED_HELLO_WINDOW_MS) {
      this.entries.delete(ip);
      return false;
    }
    return e.count >= MAX_FAILED_HELLOS_PER_IP;
  }

  recordFailure(ip: string, now = Date.now()): void {
    const e = this.entries.get(ip);
    if (e && now - e.windowStart < FAILED_HELLO_WINDOW_MS) {
      e.count++;
      return;
    }
    if (this.entries.size >= MAX_TRACKED_IPS) this.prune(now);
    this.entries.set(ip, { count: 1, windowStart: now });
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    for (const [ip, e] of this.entries) {
      if (now - e.windowStart >= FAILED_HELLO_WINDOW_MS) this.entries.delete(ip);
    }
    // Still full of live entries: drop oldest (Map preserves insertion order).
    while (this.entries.size >= MAX_TRACKED_IPS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

interface MessageContext {
  state: ConnState;
  limiter: HelloFailureLimiter;
  remoteIp: string;
  onAuthenticated: () => void;
}

export function resolveRemotePort(envPort = process.env.BEDROCK_WS_PORT ?? process.env.COOSY_WS_PORT /* legacy */): number {
  const n = Number(envPort ?? DEFAULT_REMOTE_PORT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REMOTE_PORT;
}

/**
 * Prefer packaged/copied remote assets next to the desktop build output.
 * Falls back to the monorepo remote dist during local development.
 */
export function resolveRemoteStaticRoot(opts: {
  desktopOutDir: string;
  candidates?: string[];
}): string | null {
  const candidates = opts.candidates ?? [
    join(opts.desktopOutDir, "remote"),
    join(opts.desktopOutDir, "..", "..", "remote", "dist"),
    join(opts.desktopOutDir, "..", "remote", "dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "index.html"))) return candidate;
  }
  return null;
}

function sourceSummaries(): RemoteSourceSummary[] {
  return listSources().map((s) => ({
    id: s.id,
    displayName: s.displayName,
  }));
}

function currentRemoteSnapshot(host: SourceHost | null): {
  mode: "launcher" | "player";
  activeSourceId: string | null;
  capabilities: SourceCapabilities | null;
  sources: RemoteSourceSummary[];
} {
  const active = host?.getActiveSource() ?? null;
  return {
    mode: active ? "player" : "launcher",
    activeSourceId: active?.id ?? null,
    capabilities: active?.capabilities ?? null,
    sources: sourceSummaries(),
  };
}

/**
 * Laptop remote boundary: HTTP (mobile UI) + WebSocket (commands).
 * SOURCE-AGNOSTIC — no Netflix/YouTube/Hotstar/Prime branches.
 */
export async function startRemoteServer(
  deps: RemoteServerDeps,
): Promise<RemoteServer> {
  const host = deps.host ?? "0.0.0.0";
  const port = deps.port ?? resolveRemotePort();
  const clients = new Set<WebSocket>();

  const limiter = new HelloFailureLimiter();
  const conns = new Map<WebSocket, ConnState>();

  const httpServer: HttpServer = createServer((req, res) => {
    try {
      handleRemoteStaticRequest(req, res, deps.staticRoot);
    } catch (err) {
      console.error("[remote] http handler failed", err);
      if (!res.headersSent) {
        try {
          res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        } catch {
          /* ignore */
        }
      }
      try {
        res.end("Internal Server Error");
      } catch {
        /* ignore */
      }
    }
  });

  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: MAX_WS_PAYLOAD,
    verifyClient: (info, done) => {
      const ok = isAllowedUpgrade({
        origin: info.req.headers.origin,
        host: info.req.headers.host,
      });
      if (ok) done(true);
      else done(false, 403, "Forbidden");
    },
  });

  const broadcast = (message: WsServerMessage): void => {
    const raw = JSON.stringify(message);
    for (const socket of clients) {
      if (socket.readyState === socket.OPEN) {
        socket.send(raw);
      }
    }
  };

  /** Release anything the phone left held (key/button down with no matching up). */
  const releaseHeldInput = (state: ConnState): void => {
    if (state.keysDown.size === 0 && state.buttonsDown.size === 0) return;
    const host = deps.getSourceHost();
    if (host) {
      for (const key of state.keysDown) {
        try {
          host.handleInput({ type: "key-up", key });
        } catch (err) {
          console.error("[remote] failed to release key", err);
        }
      }
      for (const button of state.buttonsDown) {
        try {
          host.handleInput({ type: "pointer-up", button });
        } catch (err) {
          console.error("[remote] failed to release button", err);
        }
      }
    }
    state.keysDown.clear();
    state.buttonsDown.clear();
  };

  // Heartbeat: drop half-open phones (sleep / Wi-Fi drop).
  const heartbeat = setInterval(() => {
    for (const [socket, state] of conns) {
      if (!state.alive) {
        socket.terminate();
        continue;
      }
      state.alive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  wss.on("connection", (socket, req) => {
    const state: ConnState = {
      failedHellos: 0,
      authTimer: null,
      keysDown: new Set(),
      buttonsDown: new Set(),
      alive: true,
    };
    const remoteIp = req.socket.remoteAddress ?? "unknown";
    clients.add(socket);
    conns.set(socket, state);

    state.authTimer = setTimeout(() => {
      state.authTimer = null;
      if (!authorized.has(socket)) socket.close(1008, "pairing timeout");
    }, AUTH_DEADLINE_MS);
    state.authTimer.unref();

    socket.on("pong", () => {
      state.alive = true;
    });
    socket.on("error", (err) => {
      console.error("[remote] socket error", err);
    });
    socket.once("close", () => {
      if (state.authTimer) clearTimeout(state.authTimer);
      state.authTimer = null;
      clients.delete(socket);
      conns.delete(socket);
      authorized.delete(socket);
      releaseHeldInput(state);
    });

    const ctx: MessageContext = {
      state,
      limiter,
      remoteIp,
      onAuthenticated: () => {
        if (state.authTimer) clearTimeout(state.authTimer);
        state.authTimer = null;
      },
    };

    socket.on("message", (raw) => {
      handleMessage(deps, socket, broadcast, raw.toString(), ctx).catch((err) => {
        console.error("[remote] message handler failed", err);
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      httpServer.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      httpServer.off("error", onError);
      resolve();
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port, host);
  });

  console.log(
    `[remote] HTTP+WS listening on http://${host}:${port}` +
      (deps.staticRoot ? ` (ui: ${deps.staticRoot})` : " (ui missing)"),
  );

  return {
    port,
    host,
    broadcast,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(heartbeat);
        limiter.clear();
        for (const state of conns.values()) {
          if (state.authTimer) clearTimeout(state.authTimer);
          state.authTimer = null;
        }
        const open = [...clients];
        for (const socket of open) {
          try {
            socket.close(1001, "server closing");
          } catch {
            /* ignore */
          }
        }
        // An unresponsive phone would otherwise hold httpServer.close() open
        // until ws's 30 s closeTimeout; force-drop stragglers after a short grace.
        const reaper = setTimeout(() => {
          for (const socket of open) {
            if (socket.readyState !== socket.CLOSED) socket.terminate();
          }
          httpServer.closeAllConnections?.();
        }, CLOSE_GRACE_MS);
        wss.close((wsErr) => {
          httpServer.close((httpErr) => {
            clearTimeout(reaper);
            clients.clear();
            conns.clear();
            if (wsErr) reject(wsErr);
            else if (httpErr) reject(httpErr);
            else resolve();
          });
          httpServer.closeIdleConnections?.();
        });
      }),
  };
}

/** @deprecated Use startRemoteServer — kept as alias for older imports/tests. */
export async function startWsServer(
  deps: Omit<RemoteServerDeps, "staticRoot"> & { staticRoot?: string | null },
): Promise<RemoteServer> {
  return startRemoteServer({
    ...deps,
    staticRoot: deps.staticRoot ?? null,
  });
}

export type WsServer = RemoteServer;
export type WsServerDeps = Omit<RemoteServerDeps, "staticRoot"> & {
  staticRoot?: string | null;
};

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_ID_LENGTH;
}

function failHello(
  socket: WebSocket,
  ctx: MessageContext,
  reason: string,
): void {
  authorized.delete(socket);
  ctx.limiter.recordFailure(ctx.remoteIp);
  ctx.state.failedHellos++;
  send(socket, { kind: "error", message: reason });
  if (ctx.state.failedHellos >= MAX_FAILED_HELLOS_PER_SOCKET) {
    socket.close(1008, "too many failed pairing attempts");
  }
}

async function handleMessage(
  deps: RemoteServerDeps,
  socket: WebSocket,
  broadcast: (message: WsServerMessage) => void,
  raw: string,
  ctx: MessageContext,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    send(socket, { kind: "error", message: "invalid JSON" });
    return;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { kind?: unknown }).kind !== "string"
  ) {
    send(socket, { kind: "error", message: "invalid message" });
    return;
  }
  const message = parsed as Record<string, unknown> & { kind: string };

  if (message.kind === "hello") {
    if (ctx.limiter.isBlocked(ctx.remoteIp)) {
      authorized.delete(socket);
      send(socket, { kind: "error", message: RATE_LIMITED_REASON });
      socket.close(1008, "too many pairing attempts");
      return;
    }
    const clientId = message.clientId;
    if (
      typeof clientId !== "string" ||
      clientId.length === 0 ||
      clientId.length > MAX_ID_LENGTH
    ) {
      failHello(socket, ctx, PAIRING_REQUIRED_REASON);
      return;
    }
    const pairingCode =
      typeof message.pairingCode === "string" ? message.pairingCode : undefined;
    const auth = authorizeHello({ clientId, pairingCode });
    if (!auth.ok) {
      failHello(socket, ctx, auth.reason);
      return;
    }

    authorized.add(socket);
    ctx.onAuthenticated();
    const snap = currentRemoteSnapshot(deps.getSourceHost());
    send(socket, {
      kind: "hello-ack",
      sessionId: crypto.randomUUID(),
      activeSourceId: snap.activeSourceId,
      capabilities: snap.capabilities,
      mode: snap.mode,
      sources: snap.sources,
    });
    return;
  }

  if (!authorized.has(socket)) {
    send(socket, { kind: "error", message: "not paired — send hello first" });
    return;
  }

  if (message.kind === "command") {
    if (!isRequestId(message.requestId)) {
      send(socket, { kind: "error", message: "invalid message" });
      return;
    }
    const requestId = message.requestId;
    const command = parseRemoteCommand(message.command);
    if (!command) {
      send(socket, {
        kind: "command-result",
        requestId,
        result: { ok: false, reason: "unknown" },
      });
      send(socket, { kind: "error", requestId, message: "invalid command" });
      return;
    }

    const host = deps.getSourceHost();
    const activeId = host?.getActiveSourceId();
    let result: CommandResult;
    if (!activeId) {
      result = { ok: false, reason: "no-active-session" };
    } else {
      const source = SOURCES[activeId];
      if (!source) {
        send(socket, {
          kind: "command-result",
          requestId,
          result: { ok: false, reason: "unknown" },
        });
        return;
      }
      try {
        result = await source.handleCommand(command);
      } catch (err) {
        // e.g. navigation rejecting with ERR_ABORTED — the phone must still get a result.
        console.error("[remote] handleCommand failed", err);
        result = { ok: false, reason: "unknown" };
      }
    }
    send(socket, { kind: "command-result", requestId, result });

    const toast = {
      message: result.ok
        ? describeCommand(command)
        : describeFailure(describeCommand(command), result.reason),
      ok: result.ok,
    };
    deps.onToast(toast);
    broadcast({ kind: "toast", ...toast });
    return;
  }

  if (message.kind === "input") {
    if (!isRequestId(message.requestId)) {
      send(socket, { kind: "error", message: "invalid message" });
      return;
    }
    const requestId = message.requestId;
    const input = parseInputCommand(message.command);
    if (!input) {
      send(socket, {
        kind: "command-result",
        requestId,
        result: { ok: false, reason: "unknown" },
      });
      send(socket, { kind: "error", requestId, message: "invalid input command" });
      return;
    }

    const host = deps.getSourceHost();
    if (!host) {
      send(socket, {
        kind: "command-result",
        requestId,
        result: { ok: false, reason: "no-active-session" },
      });
      return;
    }

    let result: CommandResult;
    try {
      result = host.handleInput(input);
    } catch (err) {
      console.error("[remote] handleInput failed", err);
      result = { ok: false, reason: "unknown" };
    }
    if (result.ok) trackHeldInput(ctx.state, input);
    send(socket, { kind: "command-result", requestId, result });
    // Avoid toast spam: pointer moves/scroll and key-up have no description.
    const label = describeInput(input);
    if (label) {
      const toast = {
        message: result.ok ? label : describeFailure(label, result.reason),
        ok: result.ok,
      };
      deps.onToast(toast);
      broadcast({ kind: "toast", ...toast });
    }
    return;
  }

  if (message.kind === "nav") {
    if (!isRequestId(message.requestId)) {
      send(socket, { kind: "error", message: "invalid message" });
      return;
    }
    const action = parseNavAction(message.action);
    if (!action) {
      send(socket, {
        kind: "error",
        requestId: message.requestId,
        message: "invalid message",
      });
      return;
    }
    deps.onNav(action);
    const toast = { message: describeNav(action), ok: true };
    deps.onToast(toast);
    broadcast({ kind: "toast", ...toast });
    return;
  }

  send(socket, { kind: "error", message: "invalid message" });
}

function trackHeldInput(state: ConnState, input: InputCommand): void {
  switch (input.type) {
    case "key-down":
      state.keysDown.add(input.key);
      break;
    case "key-up":
      state.keysDown.delete(input.key);
      break;
    case "pointer-down":
      state.buttonsDown.add(input.button ?? "left");
      break;
    case "pointer-up":
      state.buttonsDown.delete(input.button ?? "left");
      break;
    default:
      break;
  }
}

function send(socket: WebSocket, message: WsServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

/** Build a context message from the current host — used by main on source changes. */
export function buildContextMessage(host: SourceHost | null): Extract<
  WsServerMessage,
  { kind: "context" }
> {
  const snap = currentRemoteSnapshot(host);
  return {
    kind: "context",
    mode: snap.mode,
    activeSourceId: snap.activeSourceId,
    capabilities: snap.capabilities,
    sources: snap.sources,
  };
}
