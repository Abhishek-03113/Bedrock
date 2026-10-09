import type {
  CommandResult,
  InputCommand,
  RemoteCommand,
  SourceCapabilities,
  WsClientMessage,
  WsServerMessage,
} from "@bedrock/shared";

export type ConnectionStatus = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

const CLIENT_ID_KEY = "bedrock.remote.clientId";
/** Pre-rename (CoOSy) key; read as a fallback only. */
const LEGACY_CLIENT_ID_KEY = "coosy.remote.clientId";
const DEFAULT_REMOTE_PORT = 17832;

type HelloHandler = (
  ack: Extract<WsServerMessage, { kind: "hello-ack" }>,
) => void;
type ContextHandler = (
  ctx: Extract<WsServerMessage, { kind: "context" }>,
) => void;
type StatusHandler = (status: ConnectionStatus) => void;
type ErrorHandler = (message: string) => void;
type ToastHandler = (payload: { message: string; ok: boolean }) => void;

/**
 * Source-agnostic WebSocket client — RemoteCommand / nav / pointer+keyboard input.
 */
export interface WsClient {
  readonly status: ConnectionStatus;
  /** Bytes queued in the socket send buffer (0 when not open). Used for backpressure. */
  readonly bufferedAmount: number;
  sendCommand(command: RemoteCommand): Promise<CommandResult>;
  /**
   * Send pointer/keyboard input. By default awaits acknowledgement.
   * Use `awaitResult: false` for high-frequency pointer-move/scroll.
   */
  sendInput(
    command: InputCommand,
    opts?: { awaitResult?: boolean },
  ): Promise<CommandResult>;
  sendNav(
    action: Extract<WsClientMessage, { kind: "nav" }>["action"],
  ): Promise<void>;
  setPairingCode(code: string | undefined): void;
  onHello(handler: HelloHandler): void;
  onContext(handler: ContextHandler): void;
  onStatus(handler: StatusHandler): void;
  onError(handler: ErrorHandler): void;
  onToast(handler: ToastHandler): void;
  onClose(handler: () => void): void;
  close(): void;
}

/**
 * LAN http://IP pages are NOT secure contexts on iOS Safari — crypto.randomUUID throws.
 */
export function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* insecure context */
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

export function getOrCreateClientId(
  storage?: Pick<Storage, "getItem" | "setItem">,
): string {
  let store = storage;
  if (!store) {
    try {
      const probe = globalThis.localStorage;
      probe.getItem(CLIENT_ID_KEY);
      store = probe;
    } catch {
      store = memoryStorage();
    }
  }

  try {
    const existing =
      store.getItem(CLIENT_ID_KEY) ?? store.getItem(LEGACY_CLIENT_ID_KEY);
    if (existing && existing.length > 0) {
      // Carry a pre-rename id forward so the phone stays paired.
      store.setItem(CLIENT_ID_KEY, existing);
      return existing;
    }
    const id = randomId();
    store.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return randomId();
  }
}

/**
 * Prefer same host/port as the HTTP page (laptop-served UI).
 * Vite dev (`:5174`) defaults to the desktop remote port unless `?ws=` is set.
 */
export function resolveWsUrl(opts: {
  hostname: string;
  search: string;
  protocol?: string;
  port?: string;
}): string {
  const params = new URLSearchParams(opts.search);
  const host = opts.hostname || "localhost";
  const proto = opts.protocol === "https:" ? "wss" : "ws";
  const explicit = params.get("ws");

  if (explicit) {
    if (explicit.startsWith("ws://") || explicit.startsWith("wss://")) {
      return explicit;
    }
    return `${proto}://${host}:${explicit}`;
  }

  const pagePort = opts.port ?? "";
  if (pagePort === "5174" || params.get("dev") === "1") {
    return `${proto}://${host}:${DEFAULT_REMOTE_PORT}`;
  }
  if (pagePort) {
    return `${proto}://${host}:${pagePort}`;
  }
  return `${proto}://${host}:${DEFAULT_REMOTE_PORT}`;
}

export interface CreateWsClientOptions {
  url: string;
  clientId?: string;
  pairingCode?: string;
  /** Delay before the first reconnect attempt (ms); doubles (with jitter) up to 10 s. */
  reconnectDelayMs?: number;
  /** Max wait for a command-result before resolving `unknown` (ms). Default 10000. */
  requestTimeoutMs?: number;
  /** Injected WebSocket constructor for tests. */
  WebSocketImpl?: typeof WebSocket;
}

/**
 * Source-agnostic WebSocket client with pairing + simple reconnect.
 */
export function createWsClient(opts: CreateWsClientOptions | string): WsClient {
  const options: CreateWsClientOptions =
    typeof opts === "string" ? { url: opts } : opts;
  const WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  const reconnectDelayMs = options.reconnectDelayMs ?? 1500;
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  const clientId = options.clientId ?? getOrCreateClientId();

  let pairingCode = options.pairingCode;
  let socket: WebSocket = new WebSocketImpl(options.url);
  let status: ConnectionStatus = "CONNECTING";
  let intentionalClose = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;

  let helloHandler: HelloHandler | null = null;
  let contextHandler: ContextHandler | null = null;
  let statusHandler: StatusHandler | null = null;
  let errorHandler: ErrorHandler | null = null;
  let toastHandler: ToastHandler | null = null;
  let closeHandler: (() => void) | null = null;

  const pending = new Map<
    string,
    {
      resolve: (result: CommandResult) => void;
      reject: (err: Error) => void;
    }
  >();

  /** Register a pending request; settles with `unknown` if no result arrives in time. */
  const trackRequest = (
    requestId: string,
    resolve: (result: CommandResult) => void,
    reject: (err: Error) => void,
  ) => {
    const timer = setTimeout(() => {
      if (pending.delete(requestId)) resolve({ ok: false, reason: "unknown" });
    }, requestTimeoutMs);
    pending.set(requestId, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  };

  /** Capped exponential backoff with jitter; the first retry uses the base delay exactly. */
  const nextReconnectDelay = (): number => {
    const attempt = reconnectAttempt++;
    if (attempt === 0) return reconnectDelayMs;
    const cap = Math.max(10_000, reconnectDelayMs);
    const jitter = 0.8 + Math.random() * 0.4;
    return Math.min(cap, Math.round(reconnectDelayMs * 2 ** attempt * jitter));
  };

  const setStatus = (next: ConnectionStatus) => {
    status = next;
    statusHandler?.(next);
  };

  const rejectPending = (reason: string) => {
    for (const [, entry] of pending) {
      entry.reject(new Error(reason));
    }
    pending.clear();
  };

  const attach = (ws: WebSocket) => {
    // Every listener ignores events from a socket that is no longer current,
    // otherwise orphaned sockets keep reconnecting and multiply.
    ws.addEventListener("open", () => {
      if (ws !== socket) return;
      setStatus("CONNECTING");
      send({
        kind: "hello",
        clientId,
        ...(pairingCode ? { pairingCode } : {}),
      });
    });

    ws.addEventListener("message", (event) => {
      if (ws !== socket) return;
      let message: WsServerMessage;
      try {
        message = JSON.parse(String(event.data)) as WsServerMessage;
      } catch {
        return;
      }

      if (message.kind === "hello-ack") {
        reconnectAttempt = 0;
        setStatus("CONNECTED");
        helloHandler?.(message);
        return;
      }
      if (message.kind === "context") {
        contextHandler?.(message);
        return;
      }
      if (message.kind === "command-result") {
        const entry = pending.get(message.requestId);
        if (entry) {
          pending.delete(message.requestId);
          entry.resolve(message.result);
        }
        return;
      }
      if (message.kind === "toast") {
        toastHandler?.(message);
        return;
      }
      if (message.kind === "error") {
        errorHandler?.(message.message);
        if (message.message.includes("pairing")) {
          // Keep the socket; UI should collect a pairing code.
          setStatus("DISCONNECTED");
        }
      }
    });

    ws.addEventListener("close", () => {
      if (ws !== socket) return;
      rejectPending("connection closed");
      closeHandler?.();
      if (intentionalClose) {
        setStatus("DISCONNECTED");
        return;
      }
      setStatus("CONNECTING");
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (intentionalClose) return;
        socket = new WebSocketImpl(options.url);
        attach(socket);
      }, nextReconnectDelay());
    });

    ws.addEventListener("error", () => {
      if (ws !== socket) return;
      // close handler drives reconnect / status
    });
  };

  attach(socket);

  function send(message: WsClientMessage): void {
    if (socket.readyState === WebSocketImpl.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  return {
    get status() {
      return status;
    },
    get bufferedAmount() {
      return socket.readyState === WebSocketImpl.OPEN
        ? (socket.bufferedAmount ?? 0)
        : 0;
    },
    async sendCommand(command) {
      if (socket.readyState !== WebSocketImpl.OPEN || status !== "CONNECTED") {
        return { ok: false, reason: "no-active-session" };
      }
      const requestId = randomId();
      return new Promise<CommandResult>((resolve, reject) => {
        trackRequest(requestId, resolve, reject);
        send({ kind: "command", requestId, command });
      });
    },
    async sendInput(command, opts) {
      if (socket.readyState !== WebSocketImpl.OPEN || status !== "CONNECTED") {
        return { ok: false, reason: "no-active-session" };
      }
      const requestId = randomId();
      const message: Extract<WsClientMessage, { kind: "input" }> = {
        kind: "input",
        requestId,
        command,
      };

      if (opts?.awaitResult === false) {
        send(message);
        return { ok: true };
      }

      return new Promise<CommandResult>((resolve, reject) => {
        trackRequest(requestId, resolve, reject);
        send(message);
      });
    },
    async sendNav(action) {
      if (socket.readyState !== WebSocketImpl.OPEN || status !== "CONNECTED") {
        throw new Error("Not connected");
      }
      send({
        kind: "nav",
        requestId: randomId(),
        action,
      });
    },
    setPairingCode(code) {
      pairingCode = code?.trim() || undefined;
      if (socket.readyState === WebSocketImpl.OPEN) {
        send({
          kind: "hello",
          clientId,
          ...(pairingCode ? { pairingCode } : {}),
        });
      } else if (socket.readyState === WebSocketImpl.CLOSED) {
        // A backoff timer may already be pending; cancel it or it would create
        // a second socket on top of this one.
        if (reconnectTimer != null) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        reconnectAttempt = 0;
        intentionalClose = false;
        setStatus("CONNECTING");
        socket = new WebSocketImpl(options.url);
        attach(socket);
      }
    },
    onHello(handler) {
      helloHandler = handler;
    },
    onContext(handler) {
      contextHandler = handler;
    },
    onStatus(handler) {
      statusHandler = handler;
      handler(status);
    },
    onError(handler) {
      errorHandler = handler;
    },
    onToast(handler) {
      toastHandler = handler;
    },
    onClose(handler) {
      closeHandler = handler;
    },
    close() {
      intentionalClose = true;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      closeHandler = null;
      rejectPending("client closed");
      setStatus("DISCONNECTED");
      socket.close();
    },
  };
}

export type { SourceCapabilities };
