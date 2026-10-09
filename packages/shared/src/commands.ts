/**
 * Generic remote commands — never source-specific.
 * Phone → WebSocket → MediaSource.handleCommand
 */

export type RemoteCommand =
  | { type: "play" }
  | { type: "pause" }
  | { type: "toggle-play-pause" }
  | { type: "seek"; deltaSeconds: number }
  | { type: "next-episode" }
  | { type: "volume"; direction: "up" | "down" }
  /** Scroll the active source page (browse context). */
  | { type: "scroll"; direction: "up" | "down" }
  /** Move focus among selectable media items on the active source. */
  | { type: "navigate"; direction: "up" | "down" | "left" | "right" }
  /** Open / play the currently focused media item (Enter/click in the source UI). */
  | { type: "select" }
  /** Run a source search with the given query when the source supports it. */
  | { type: "search"; query: string };

export type CommandFailureReason =
  | "unsupported"
  | "no-active-session"
  | "unknown";

export type CommandResult =
  | { ok: true }
  | { ok: false; reason: CommandFailureReason };

const MAX_SEEK_SECONDS = 600;
const MAX_SEARCH_QUERY = 200;

/**
 * Narrow unknown JSON into RemoteCommand. Returns null when malformed.
 */
export function parseRemoteCommand(raw: unknown): RemoteCommand | null {
  if (!raw || typeof raw !== "object") return null;
  const cmd = raw as Record<string, unknown>;
  const type = cmd.type;
  if (typeof type !== "string") return null;

  switch (type) {
    case "play":
    case "pause":
    case "toggle-play-pause":
    case "next-episode":
    case "select":
      return { type };
    case "seek": {
      const d = cmd.deltaSeconds;
      if (typeof d !== "number" || !Number.isFinite(d)) return null;
      if (Math.abs(d) > MAX_SEEK_SECONDS) return null;
      return { type, deltaSeconds: d };
    }
    case "volume":
    case "scroll": {
      if (cmd.direction !== "up" && cmd.direction !== "down") return null;
      return { type, direction: cmd.direction };
    }
    case "navigate": {
      const dir = cmd.direction;
      if (dir !== "up" && dir !== "down" && dir !== "left" && dir !== "right") {
        return null;
      }
      return { type, direction: dir };
    }
    case "search": {
      if (typeof cmd.query !== "string") return null;
      const query = cmd.query.trim();
      if (query.length < 1 || query.length > MAX_SEARCH_QUERY) return null;
      return { type, query };
    }
    default:
      return null;
  }
}
