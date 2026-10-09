import { test, expect } from "../fixtures/mock-remote-server";
import { snap } from "../fixtures/snap";

test.describe("Phone remote in player mode (current UI)", () => {
  test("connects and shows controls", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(page.getByRole("button", { name: /play \/ pause/i })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
    await snap(page, "phone-remote-player");
  });

  test("tapping play/pause sends toggle-play-pause", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    const btn = page.getByRole("button", { name: /play \/ pause/i });
    await expect(btn).toBeEnabled();
    await btn.tap();
    await expect
      .poll(() => mockRemote.commands())
      .toContainEqual({ type: "toggle-play-pause" });
  });
});

test.describe("Phone remote pairing", () => {
  test.use({ mockRemoteOptions: { requirePairing: "482913" } });

  test("shows pairing screen, then connects with the code", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    const input = page.getByLabel("Pairing code");
    await expect(input).toBeVisible();
    await snap(page, "phone-pairing");

    await input.fill("482913");
    await page.getByRole("button", { name: "Pair" }).tap();
    await expect(page.getByRole("button", { name: /play \/ pause/i })).toBeVisible();
  });
});

test.describe("Phone remote in launcher mode", () => {
  test.use({ mockRemoteOptions: { mode: "launcher" } });

  test("connects in launcher mode", async ({ page, mockRemote }) => {
    await page.goto(mockRemote.phoneUrl);
    await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
    await snap(page, "phone-remote-launcher");
  });
});
