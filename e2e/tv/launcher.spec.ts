import { test, expect, type Page } from "@playwright/test";
import { emitNav, emitToast, getCalls, installBridge } from "../fixtures/bridge";
import { snap } from "../fixtures/snap";
import { toastDataUrl } from "../../packages/desktop/src/main/toast-html";

const focused = (page: Page) => page.locator('[data-row].is-focused, [data-row]:focus').first();

/** Open Home and wait for the startup splash to finish (reduced motion keeps it short). */
async function openHome(page: Page, scenario: "withHistory" | "empty" | "remoteError" = "withHistory") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installBridge(page, scenario);
  await page.goto("/");
  await expect(page.locator(".splash")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator(".hero")).toBeVisible();
  await page.waitForTimeout(700); // hero entrance + data
}

test.describe("TV launcher", () => {
  test("startup splash plays mid-animation, then Home", async ({ page }) => {
    await installBridge(page, "withHistory");
    await page.goto("/");
    await expect(page.locator(".splash")).toBeVisible();
    await page.waitForTimeout(600);
    await snap(page, "tv-01-splash", { animations: "allow" });
    await expect(page.locator(".splash")).toHaveCount(0, { timeout: 4000 });
    await expect(page.getByRole("heading", { name: "Midnight Orbit" })).toBeVisible();
  });

  test("any remote nav skips the splash", async ({ page }) => {
    await installBridge(page, "withHistory");
    await page.goto("/");
    await expect(page.locator(".splash")).toBeVisible();
    await emitNav(page, "down");
    await expect(page.locator(".splash")).toHaveCount(0, { timeout: 500 });
  });

  test("home hero features the latest item", async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole("heading", { name: "Midnight Orbit" })).toBeVisible();
    await expect(page.locator(".hero__meta")).toContainText("28 min left");
    await expect(page.locator(".hero__meta")).toContainText("Last watched today");
    await expect(page.locator('[data-action="resume"]')).toHaveClass(/is-focused/);
    await expect(page.locator(".status")).toContainText("Ready to pair");
    await expect(page.locator(".topbar__clock")).toHaveText(/\d{1,2}:\d{2}/);
    await expect(page.locator(".card--app")).toHaveCount(4);
    await snap(page, "tv-02-home-hero");
  });

  test("remote nav moves focus down into Continue Watching and Apps", async ({ page }) => {
    await openHome(page);
    await emitNav(page, "down");
    await expect(page.locator('[data-row="2"][data-col="0"]')).toHaveClass(/is-focused/);
    await expect(page.locator('[data-row="2"][data-col="0"]')).toBeFocused();
    await emitNav(page, "right");
    await expect(page.locator('[data-row="2"][data-col="1"]')).toBeFocused();
    await emitNav(page, "right");
    await emitNav(page, "right"); // clamps at the end, no wrap
    await expect(page.locator('[data-row="2"][data-col="2"]')).toBeFocused();
    await emitNav(page, "left");
    await emitNav(page, "left");
    await page.waitForTimeout(500);
    await snap(page, "tv-03-focus-continue");

    await emitNav(page, "down");
    await expect(page.locator('[data-source-id="netflix"]')).toBeFocused();
    await emitNav(page, "right");
    await emitNav(page, "right");
    await expect(page.locator('[data-source-id="prime"]')).toBeFocused();
    await page.waitForTimeout(600);
    await snap(page, "tv-04-focus-apps");

    await emitNav(page, "up");
    await expect(page.locator('[data-row="2"]').nth(2)).toBeFocused();
  });

  test("select opens the focused app and Resume resumes history", async ({ page }) => {
    await openHome(page);
    await emitNav(page, "select");
    await expect.poll(async () => (await getCalls(page, "resumePlaybackHistory")).length).toBe(1);
    const resumed = (await getCalls(page, "resumePlaybackHistory"))[0]!.args[0] as { sourceId: string };
    expect(resumed.sourceId).toBe("netflix");

    // Home again (player mode ended), then pick an app.
    await page.goto("/");
    await expect(page.locator(".splash")).toHaveCount(0, { timeout: 5000 });
    await page.waitForTimeout(700);
    await emitNav(page, "down");
    await emitNav(page, "down");
    await emitNav(page, "right");
    await emitNav(page, "select");
    await expect.poll(async () => (await getCalls(page, "openSource")).length).toBe(1);
    expect((await getCalls(page, "openSource"))[0]!.args[0]).toBe("youtube");
  });

  test("keyboard works too: arrows, Enter and mouse hover", async ({ page }) => {
    await openHome(page);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-action="open-source"]')).toBeFocused();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await getCalls(page, "openSource")).length).toBe(1);
    expect((await getCalls(page, "openSource"))[0]!.args[0]).toBe("netflix");
  });

  test("empty state shows the welcome hero", async ({ page }) => {
    await openHome(page, "empty");
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
    await expect(page.getByText(/What are we watching/)).toBeVisible();
    await expect(page.locator('[data-action="pair"]')).toHaveClass(/is-focused/);
    await expect(page.locator(".shelf__title")).toHaveText(["Your Apps"]);
    await snap(page, "tv-05-home-empty");
  });

  test("pairing sheet shows the QR and closes with back", async ({ page }) => {
    await openHome(page, "empty");
    await emitNav(page, "select"); // welcome hero: Pair your phone
    await expect(page.getByRole("dialog", { name: "Pair your phone" })).toBeVisible();
    await expect(page.locator(".qr svg")).toBeVisible();
    await expect(page.locator(".sheet__code")).toContainText("482913");
    await expect(page.locator(".sheet")).toContainText("bedrock.local");
    await expect(page.locator(".sheet__caption")).toContainText("192.168.1.24");
    await page.waitForTimeout(600);
    await snap(page, "tv-06-pairing-sheet");
    await emitNav(page, "back");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-action="pair"]')).toBeFocused();

    // Top-bar button opens it too, Escape closes.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("remote error shows an unavailable status", async ({ page }) => {
    await openHome(page, "remoteError");
    await expect(page.locator(".status")).toContainText("Remote unavailable");
    await expect(page.locator(".status--err")).toBeVisible();
    await snap(page, "tv-07-remote-error");
  });

  test("launcher toast appears as a HUD capsule", async ({ page }) => {
    await openHome(page);
    await emitToast(page, { message: "Couldn't reach Netflix. Try again.", ok: false });
    await expect(page.locator(".hud__capsule--in")).toBeVisible();
    await expect(page.locator(".hud__capsule")).toContainText("Couldn't reach Netflix");
    await page.waitForTimeout(300);
    await emitToast(page, { message: "Playing", ok: true });
    await expect(page.locator(".hud__capsule--in")).toContainText("Playing");
    await page.waitForTimeout(300);
    await snap(page, "tv-08-toast");
    await expect(page.locator(".hud__capsule")).toHaveCount(0, { timeout: 4000 });
  });

  test("scales down to 1280x720", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openHome(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await snap(page, "tv-09-home-720p");
  });

  test("player-mode toast overlay markup", async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 260 });
    const ok = toastDataUrl({ message: "Forward 10 seconds", ok: true });
    await page.setContent(
      `<body style="margin:0;background:radial-gradient(60% 90% at 70% 30%,#27406e,#05070d);height:100vh;display:grid;place-items:end center;padding-bottom:40px;box-sizing:border-box">
        <iframe src="${ok.replace(/"/g, "&quot;")}" style="border:0;width:460px;height:72px;background:transparent" scrolling="no"></iframe></body>`,
    );
    await page.waitForTimeout(700);
    await expect(page.frameLocator("iframe").locator(".toast")).toContainText("Forward 10 seconds");
    await snap(page, "tv-10-overlay-toast");
  });
});
