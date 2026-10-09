import { app, BrowserWindow } from "electron";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { closeDb, initDb } from "./db/db.js";
import { SourceHost } from "./source-host.js";
import {
  buildContextMessage,
  resolveRemotePort,
  resolveRemoteStaticRoot,
  startRemoteServer,
  type RemoteServer,
} from "./remote-server.js";
import { startDiscovery } from "./discovery.js";
import { ensureWidevineReady } from "./widevine.js";
import {
  presentToast,
  registerIpcHandlers,
  sendContextToRenderer,
  sendNavToRenderer,
} from "./ipc.js";
import { getOrCreatePairingCode } from "./pairing.js";
import { ToastOverlay } from "./toast-overlay.js";
import { getLanIPv4 } from "./lan.js";

/**
 * One-time, best-effort migration of pre-rename (CoOSy) user data.
 * Renaming the app changes Electron's default `userData` dir, which would
 * orphan the user's streaming-service logins (session partitions) and history.
 * Must run before anything touches userData (before `app.whenReady`).
 */
function migrateLegacyUserData(): void {
  try {
    const userData = app.getPath("userData");
    if (!existsSync(userData)) {
      const appData = app.getPath("appData");
      for (const name of ["CoOSy", "@coosy/desktop", "coosy"]) {
        const legacy = join(appData, name);
        if (existsSync(legacy)) {
          renameSync(legacy, userData);
          console.log(`[migrate] moved userData ${legacy} -> ${userData}`);
          break;
        }
      }
    }
    // The SQLite file was renamed coosy.sqlite -> bedrock.sqlite.
    const oldDb = join(userData, "coosy.sqlite");
    const newDb = join(userData, "bedrock.sqlite");
    if (existsSync(oldDb) && !existsSync(newDb)) {
      renameSync(oldDb, newDb);
      for (const ext of ["-wal", "-shm"]) {
        if (existsSync(oldDb + ext)) renameSync(oldDb + ext, newDb + ext);
      }
    }
  } catch (err) {
    console.warn("[migrate] legacy userData migration failed", err);
  }
}

migrateLegacyUserData();

let mainWindow: BrowserWindow | null = null;
let sourceHost: SourceHost | null = null;
let remoteServer: RemoteServer | null = null;
let stopDiscovery: (() => void) | null = null;
let toastOverlay: ToastOverlay | null = null;
let remoteStartError: string | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    fullscreen: true,
    autoHideMenuBar: true,
    // Avoid a native title strip painting above the media surface on macOS.
    titleBarStyle: "hidden",
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
    },
  });

  toastOverlay = new ToastOverlay();
  toastOverlay.attach(mainWindow);

  sourceHost = new SourceHost(mainWindow, {
    onContextChange: ({ mode, activeSourceId }) => {
      remoteServer?.broadcast(buildContextMessage(sourceHost));
      sendContextToRenderer(mainWindow, { mode, activeSourceId });
      if (mode === "launcher") {
        toastOverlay?.hide();
      }
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  // Warm source WebContentsViews so the first tile click is attach-only.
  sourceHost.warmSources();

  mainWindow.on("closed", () => {
    sourceHost?.dispose();
    toastOverlay?.dispose();
    mainWindow = null;
    sourceHost = null;
    toastOverlay = null;
  });
}

async function startAuxiliaryRemote(): Promise<void> {
  const staticRoot = resolveRemoteStaticRoot({
    desktopOutDir: join(__dirname, ".."),
  });

  try {
    remoteServer = await startRemoteServer({
      getSourceHost: () => sourceHost,
      staticRoot,
      onToast: (payload) =>
        presentToast({
          window: mainWindow,
          host: sourceHost,
          overlay: toastOverlay,
          payload,
        }),
      onNav: (action) => sendNavToRenderer(mainWindow, action),
    });
    remoteStartError = null;

    try {
      stopDiscovery = await startDiscovery(remoteServer.port);
    } catch (err) {
      console.warn("[discovery] failed to advertise (remote still up)", err);
    }

    const ip = getLanIPv4() ?? "<lan-ip>";
    console.log(
      `[pairing] code ${getOrCreatePairingCode()} — open http://${ip}:${remoteServer.port}`,
    );
    if (!staticRoot) {
      console.warn(
        "[remote] UI assets missing — run `pnpm --filter @bedrock/remote build` (or desktop package script)",
      );
    }
  } catch (err) {
    remoteServer = null;
    remoteStartError =
      err instanceof Error ? err.message : "Remote server failed to start";
    console.error("[remote] startup failed — desktop continues without remote", err);
  }
}

app.whenReady().then(async () => {
  initDb();
  getOrCreatePairingCode();

  await ensureWidevineReady();
  await createWindow();

  registerIpcHandlers({
    getWindow: () => mainWindow,
    getSourceHost: () => sourceHost,
    getWsPort: () => remoteServer?.port ?? resolveRemotePort(),
    getRemoteError: () => remoteStartError,
  });

  await startAuxiliaryRemote();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

let isQuitting = false;

/**
 * Tear down everything that holds an OS resource (sockets, mDNS
 * advertisement, the sqlite handle) before the process actually exits.
 * Idempotent — safe to invoke from multiple lifecycle hooks.
 */
async function shutdown(): Promise<void> {
  if (isQuitting) return;
  isQuitting = true;

  stopDiscovery?.();
  stopDiscovery = null;

  try {
    await remoteServer?.close();
  } catch (err) {
    console.warn("[remote] close error", err);
  }
  remoteServer = null;

  sourceHost?.dispose();
  sourceHost = null;

  toastOverlay?.dispose();
  toastOverlay = null;

  try {
    closeDb();
  } catch (err) {
    console.warn("[db] close error", err);
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  void shutdown().finally(() => app.quit());
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown().finally(() => process.exit(0));
  });
}
