import { test, expect } from "@playwright/test";
import { emitNav, getCalls, installBridge } from "../fixtures/bridge";
import { snap } from "../fixtures/snap";

const tiles = (page: import("@playwright/test").Page) =>
  page.locator("[data-source-id]");

test.describe("TV launcher (current UI)", () => {
  test("home renders source tiles with history", async ({ page }) => {
    await installBridge(page, "withHistory");
    await page.goto("/");
    await expect(tiles(page)).toHaveCount(4);
    await expect(page.getByText("Midnight Orbit").first()).toBeVisible();
    await snap(page, "tv-home-with-history");
  });

  test("home renders with empty history", async ({ page }) => {
    await installBridge(page, "empty");
    await page.goto("/");
    await expect(tiles(page)).toHaveCount(4);
    await snap(page, "tv-home-empty");
  });

  test("home shows remote error state", async ({ page }) => {
    await installBridge(page, "remoteError");
    await page.goto("/");
    await expect(tiles(page)).toHaveCount(4);
    await snap(page, "tv-home-remote-error");
  });

  test("ArrowRight moves focus and Enter opens focused source", async ({ page }) => {
    await installBridge(page, "withHistory");
    await page.goto("/");
    await expect(tiles(page)).toHaveCount(4);
    const first = tiles(page).nth(0);
    const second = tiles(page).nth(1);
    await expect(first).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("ArrowRight");
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await snap(page, "tv-home-focus-moved");

    const id = await second.getAttribute("data-source-id");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await getCalls(page, "openSource")).length).toBe(1);
    expect((await getCalls(page, "openSource"))[0]!.args[0]).toBe(id);
  });

  test("remote nav events move focus", async ({ page }) => {
    await installBridge(page, "withHistory");
    await page.goto("/");
    await expect(tiles(page)).toHaveCount(4);
    await emitNav(page, "right");
    await expect(tiles(page).nth(1)).toHaveAttribute("aria-pressed", "true");
  });
});
