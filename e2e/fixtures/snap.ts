import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

/** <repo>/docs/screenshots */
export const SCREENSHOT_DIR = resolve(__dirname, "../../docs/screenshots");

/** Full-page screenshot to docs/screenshots/<name>.png (waits for fonts first). */
export async function snap(
  page: Page,
  name: string,
  opts: { animations?: "disabled" | "allow" } = {},
): Promise<string> {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  const path = resolve(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: opts.animations ?? "disabled" });
  return path;
}
