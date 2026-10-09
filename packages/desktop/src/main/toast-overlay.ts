import { BrowserWindow } from "electron";
import { perfInc } from "../shared/perf.js";
import { toastDataUrl } from "./toast-html.js";

/**
 * Temporary toast surface above an active source WebContentsView.
 * Does not reserve permanent layout space in the source viewport.
 *
 * Lifecycle: create overlay once → reuse → update content → show → hide.
 */
export class ToastOverlay {
  private window: BrowserWindow | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private parent: BrowserWindow | null = null;
  private lastBounds: { x: number; y: number; width: number; height: number } | null =
    null;

  attach(parent: BrowserWindow): void {
    this.parent = parent;
  }

  show(payload: { message: string; ok: boolean }, durationMs = 1500): void {
    const parent = this.parent;
    if (!parent || parent.isDestroyed()) return;

    perfInc("toast.show");
    this.ensureWindow(parent);
    const win = this.window;
    if (!win || win.isDestroyed()) return;

    this.position(parent, win);
    void win.loadURL(toastDataUrl(payload));
    if (!win.isVisible()) {
      win.showInactive();
    }

    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hide(), durationMs);
  }

  hide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.hide();
    }
  }

  dispose(): void {
    this.hide();
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
    this.parent = null;
    this.lastBounds = null;
  }

  private ensureWindow(parent: BrowserWindow): void {
    if (this.window && !this.window.isDestroyed()) return;

    this.window = new BrowserWindow({
      parent,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      width: 460,
      height: 72,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    this.window.setAlwaysOnTop(true, "pop-up-menu");
    this.window.setIgnoreMouseEvents(true, { forward: true });
  }

  private position(parent: BrowserWindow, win: BrowserWindow): void {
    const bounds = parent.getBounds();
    const width = Math.min(460, Math.max(280, bounds.width - 48));
    const height = 72;
    const x = Math.round(bounds.x + (bounds.width - width) / 2);
    const y = Math.round(bounds.y + bounds.height - height - 28);
    const next = { x, y, width, height };
    const prev = this.lastBounds;
    if (
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.width === next.width &&
      prev.height === next.height
    ) {
      return;
    }
    win.setBounds(next);
    this.lastBounds = next;
  }
}
