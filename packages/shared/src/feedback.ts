import type { CommandFailureReason, RemoteCommand } from "./commands.js";
import type { InputCommand } from "./input-commands.js";
import type { NavAction } from "./ws-protocol.js";

/**
 * Human-readable feedback copy shared by the TV toast overlay and the phone HUD,
 * so both surfaces describe the same action with the same words.
 * Voice rules: docs/design/bedrock-design-system.md §8.
 */

export function describeCommand(command: RemoteCommand): string {
  switch (command.type) {
    case "play":
      return "Playing";
    case "pause":
      return "Paused";
    case "toggle-play-pause":
      return "Play / Pause";
    case "seek": {
      const seconds = Math.abs(command.deltaSeconds);
      return command.deltaSeconds < 0
        ? `Back ${seconds} seconds`
        : `Forward ${seconds} seconds`;
    }
    case "next-episode":
      return "Next episode";
    case "volume":
      return command.direction === "up" ? "Volume up" : "Volume down";
    case "scroll":
      return command.direction === "up" ? "Scrolled up" : "Scrolled down";
    case "navigate":
      return describeNav(command.direction);
    case "select":
      return "Selected";
    case "search":
      return `Searching for “${command.query}”`;
  }
}

export function describeNav(action: NavAction): string {
  switch (action) {
    case "up":
      return "Up";
    case "down":
      return "Down";
    case "left":
      return "Left";
    case "right":
      return "Right";
    case "select":
      return "Selected";
    case "back":
      return "Back";
    case "home":
      return "Home";
  }
}

/** Returns null for high-frequency pointer input that should never toast. */
export function describeInput(command: InputCommand): string | null {
  switch (command.type) {
    case "pointer-click":
      return "Click";
    case "key-down":
      return command.key === "Enter" ? "Return" : command.key === "Escape" ? "Escape" : null;
    case "text-input":
      return "Typing…";
    default:
      return null;
  }
}

export function describeFailure(action: string, reason?: CommandFailureReason): string {
  switch (reason) {
    case "unsupported":
      return `${action} isn’t available here`;
    case "no-active-session":
      return "Open an app first";
    default:
      return `Couldn’t do that. Try again.`;
  }
}
