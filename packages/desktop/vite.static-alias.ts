import { resolve } from "node:path";

/**
 * Repo-level brand assets live in `<repo>/static`. Renderer code imports them
 * as `@static/icons/bedrock-mascot-512.png`; Vite bundles/fingerprints them.
 * Shared by electron.vite.config.ts and the e2e launcher config so they never drift.
 */
export const STATIC_DIR = resolve(__dirname, "../../static");
export const staticAlias = { "@static": STATIC_DIR };
