import type { Page } from "@playwright/test";

/** Wait for CSS animations/transitions to settle so screenshots are stable. */
export async function settle(page: Page, ms = 450): Promise<void> {
  await page.waitForTimeout(ms);
}
