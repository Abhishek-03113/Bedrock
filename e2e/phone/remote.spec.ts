import { test, expect } from "../fixtures/mock-remote-server";
import { snap } from "../fixtures/snap";
import { settle } from "./helpers";

const playPause = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: "Play or pause" });

test.describe("Boot and connecting", () => {
  test("shows the connecting state while the computer can't be reached", async ({ page }) => {
    await page.goto("/?ws=ws://localhost:1");
    await expect(page.getByText("Looking for your computer…")).toBeVisible();
    await expect(page.getByText("Bedrock", { exact: true })).toBeVisible();
    await settle(page);
    await snap(page, "phone-01-connecting");
  });
});

test.describe("Pairing", () => {
  test.use({ mockRemoteOptions: { requirePairing: "482913" } });

  test("pair screen, wrong code error, then success", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(page.getByRole("heading", { name: "Pair with Bedrock" })).toBeVisible();
    await expect(page.getByText("Enter the 6-digit code shown on your TV screen.")).toBeVisible();
    const pair = page.getByRole("button", { name: "Pair", exact: true });
    await expect(pair).toBeDisabled();
    await settle(page);
    await snap(page, "phone-02-pairing");

    const input = page.getByLabel("Pairing code");
    await input.fill("111111");
    await expect(pair).toBeEnabled();
    await pair.tap();
    await expect(page.getByText("That code didn’t work. Check your TV and try again.")).toBeVisible();
    await settle(page, 700);
    await snap(page, "phone-03-pairing-error");

    await input.fill("482913");
    await pair.tap();
    await expect(playPause(page)).toBeVisible();
    expect(mockRemote.ofKind("hello").at(-1).pairingCode).toBe("482913");
  });
});

test.describe("Player mode", () => {
  test("Touch clickpad: tap sends pointer-click", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(page.getByRole("heading", { name: "Netflix" })).toBeVisible();
    await expect(page.getByText("Connected", { exact: true })).toBeVisible();
    await expect(page.getByText("Swipe to move")).toBeVisible();
    await settle(page);
    await snap(page, "phone-04-player-touch");

    const pad = page.getByRole("application");
    const box = (await pad.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(() => mockRemote.ofKind("input").map((m) => m.command))
      .toContainEqual({ type: "pointer-click", button: "left" });
    await expect(page.locator(".clickpad__hint")).toHaveClass(/is-hidden/);
  });

  test("D-pad: the ring's up sends a navigate command, select sends select", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await page.getByRole("radio", { name: "D-pad" }).tap();
    await expect(page.getByRole("group", { name: "Directional pad" })).toBeVisible();
    await settle(page);
    await snap(page, "phone-05-player-dpad");

    await page.getByRole("button", { name: "Up", exact: true }).tap();
    await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "navigate", direction: "up" });
    await page.getByRole("button", { name: "Select" }).tap();
    await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "select" });

    // The choice is remembered across reloads.
    await page.reload();
    await expect(page.getByRole("group", { name: "Directional pad" })).toBeVisible();
  });

  test("transport: play/pause, back 10, volume up", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await playPause(page).tap();
    await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "toggle-play-pause" });
    await page.getByRole("button", { name: "Back 10 seconds" }).tap();
    await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "seek", deltaSeconds: -10 });
    await page.getByRole("button", { name: "Forward 10 seconds" }).tap();
    await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "seek", deltaSeconds: 10 });
    await page.getByRole("button", { name: "Volume up" }).tap();
    await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "volume", direction: "up" });
    await page.getByRole("button", { name: "Volume down" }).tap();
    await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "volume", direction: "down" });
    // Human copy, never raw command names.
    await expect(page.locator(".hud__text")).not.toContainText(/toggle-play-pause|nav:/);
  });

  test("Back and Home go out as nav", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await page.getByRole("button", { name: "Back", exact: true }).tap();
    await page.getByRole("button", { name: "Home", exact: true }).tap();
    await expect
      .poll(() => mockRemote.ofKind("nav").map((m) => m.action))
      .toEqual(["back", "home"]);
  });

  test("keyboard sheet live-sends text, Return and Done", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await page.getByRole("button", { name: "Keyboard" }).tap();
    const field = page.getByLabel("Type on your TV");
    await expect(field).toBeFocused();
    await field.pressSequentially("dune");
    await expect
      .poll(() => mockRemote.ofKind("input").filter((m) => m.command.type === "text-input").length)
      .toBe(4);
    await settle(page);
    await snap(page, "phone-07-keyboard");
    await field.press("Backspace");
    await expect
      .poll(() => mockRemote.ofKind("input").some((m) => m.command.type === "key-down" && m.command.key === "Backspace"))
      .toBe(true);
    await page.getByRole("button", { name: "Return" }).tap();
    await expect
      .poll(() => mockRemote.ofKind("input").some((m) => m.command.type === "key-down" && m.command.key === "Enter"))
      .toBe(true);
    await page.getByRole("button", { name: "Done" }).tap();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("More sheet sends special keys", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await page.getByRole("button", { name: "More" }).tap();
    await expect(page.getByRole("dialog", { name: "More" })).toBeVisible();
    await settle(page);
    await snap(page, "phone-08-more");
    await page.getByRole("button", { name: "Esc" }).tap();
    await page.getByRole("button", { name: "Delete" }).tap();
    await expect
      .poll(() => mockRemote.ofKind("input").filter((m) => m.command.type === "key-down").map((m) => m.command.key))
      .toEqual(["Escape", "Backspace"]);
  });

  test("search sheet sends a search command", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await page.getByRole("button", { name: "Search", exact: true }).tap();
    const field = page.getByPlaceholder("Search Netflix…");
    await expect(field).toBeVisible();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Search", exact: true })).toBeDisabled();
    await field.fill("dune");
    await settle(page);
    await snap(page, "phone-09-search");
    await dialog.getByRole("button", { name: "Search", exact: true }).tap();
    await expect.poll(() => mockRemote.commands()).toContainEqual({ type: "search", query: "dune" });
  });

  test("HUD capsule shows the server toast", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(playPause(page)).toBeVisible();
    mockRemote.broadcast({ kind: "toast", message: "Back 10 seconds", ok: true });
    const hud = page.locator(".hud.is-visible");
    await expect(hud).toContainText("Back 10 seconds");
    await settle(page, 600);
    await snap(page, "phone-10-toast");
    await expect(page.locator(".hud.is-visible")).toHaveCount(0, { timeout: 4000 });
  });

  test("shows a Reconnecting banner when the connection drops", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(playPause(page)).toBeVisible();
    await mockRemote.close();
    await expect(page.locator(".banner")).toContainText("Reconnecting…");
    // The remote stays on screen; nothing is shouted in capitals.
    await expect(playPause(page)).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/DISCONNECTED|CONNECTED|CONNECTING/);
    await settle(page);
    await snap(page, "phone-11-reconnecting");
  });
});

test.describe("Launcher mode", () => {
  test.use({ mockRemoteOptions: { mode: "launcher" } });

  test("shows Home, a hint instead of transport, and drives the TV with nav", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByText("Choose an app on your TV to start watching")).toBeVisible();
    await expect(playPause(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
    await page.getByRole("radio", { name: "D-pad" }).tap();
    await settle(page);
    await snap(page, "phone-06-launcher");
    await page.getByRole("button", { name: "Right" }).tap();
    await expect.poll(() => mockRemote.ofKind("nav").map((m) => m.action)).toContain("right");
  });
});

test.describe("Small phone", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("fits without scrolling and every control is reachable", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(playPause(page)).toBeVisible();
    await settle(page);
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow.x).toBeLessThanOrEqual(0);
    expect(overflow.y).toBeLessThanOrEqual(0);
    for (const name of ["More", "Back", "Home", "Search", "Keyboard", "Play or pause", "Volume up", "Volume down"]) {
      const box = await page.getByRole("button", { name, exact: true }).first().boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.y + box!.height, name).toBeLessThanOrEqual(667);
      expect(box!.width, name).toBeGreaterThanOrEqual(44);
    }
    await snap(page, "phone-12-small");
  });
});
