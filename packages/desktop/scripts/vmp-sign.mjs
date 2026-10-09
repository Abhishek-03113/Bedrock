#!/usr/bin/env node
/**
 * Castlabs EVS VMP signing core for electron-builder hooks.
 *
 * This module holds the reusable signing logic. The actual electron-builder
 * hooks are thin wrappers around `signVmp`:
 *
 *   - scripts/vmp-after-pack.mjs  (afterPack) — signs macOS only
 *   - scripts/vmp-after-sign.mjs  (afterSign) — signs Windows only
 *
 * Why two hooks (ordering matters, per the Castlabs EVS documentation):
 *   - macOS:   VMP signing must happen BEFORE Apple code signing
 *              -> afterPack runs before electron-builder's codesign/notarize.
 *   - Windows: VMP signing must happen AFTER Authenticode signing
 *              -> afterSign runs after electron-builder signed the .exe/.dll
 *                 files and before the NSIS installer is assembled.
 *
 * Environment variables:
 *   BEDROCK_REQUIRE_VMP_SIGNING=1
 *     Signing (and verification) failures become BUILD FAILURES. Without it a
 *     missing Python / castlabs_evs / failed sign only warns and the build
 *     continues with the Castlabs development-signed runtime.
 *     (Legacy name COOSY_REQUIRE_VMP_SIGNING is still honoured.)
 *   BEDROCK_VMP_PERSISTENT=1
 *     Use persistent signing: `sign-pkg --persistent` and `verify-pkg -p`.
 *   BEDROCK_PYTHON
 *     Force the Python interpreter (CI uses actions/setup-python).
 *
 * EVS credentials come from the local EVS configuration
 * (`python -m castlabs_evs.account signin`, or `refresh` in CI).
 * NEVER store EVS tokens or passwords in this file or the repository.
 *
 * See docs/widevine-vmp.md and docs/release-ci.md.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

/** appOutDirs already signed in this process (guards against double signing). */
const signedDirs = new Set();

/** @returns {boolean} */
function isSigningRequired() {
  return (process.env.BEDROCK_REQUIRE_VMP_SIGNING ?? process.env.COOSY_REQUIRE_VMP_SIGNING) === "1";
}

/** @returns {boolean} */
function isPersistent() {
  return process.env.BEDROCK_VMP_PERSISTENT === "1";
}

/**
 * Resolve the best available Python executable on the current platform.
 * BEDROCK_PYTHON wins; otherwise prefers .venv, then system interpreters.
 * Returns null if no usable Python is found.
 * @returns {string|null}
 */
export function resolvePython() {
  const forced = process.env.BEDROCK_PYTHON;
  /** @type {string[]} */
  const venvCandidates =
    process.platform === "win32"
      ? [join(repoRoot, ".venv", "Scripts", "python.exe")]
      : [join(repoRoot, ".venv", "bin", "python")];

  const systemCandidates =
    process.platform === "win32"
      ? ["py", "python", "python3"]
      : ["python3", "python"];

  const candidates = forced ? [forced] : [...venvCandidates, ...systemCandidates];

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "pipe" });
      return candidate;
    } catch {
      // not available — try next
    }
  }
  return null;
}

/**
 * Sign (and, when required, verify) the packaged application directory with
 * Castlabs EVS VMP.
 *
 * @param {import('electron-builder').AfterPackContext} context
 * @param {{ platforms: string[], hook?: string }} options
 *   platforms: electronPlatformName values this call is allowed to sign.
 *   hook: label for log lines ("afterPack" / "afterSign").
 */
export async function signVmp(context, { platforms, hook = "hook" }) {
  const { appOutDir, electronPlatformName, arch } = context;

  console.log(`[vmp] ${hook} hook invoked`);
  console.log("[vmp] platform:", electronPlatformName);
  console.log("[vmp] arch:", arch);
  console.log("[vmp] app output directory:", appOutDir);

  const requireSigning = isSigningRequired();
  const persistent = isPersistent();

  // Only Windows and macOS are VMP-signed — ECS supports both.
  // Each hook additionally restricts itself to the platform whose ordering
  // constraint it satisfies (see file header).
  if (!platforms.includes(electronPlatformName)) {
    console.log(
      `[vmp] skipping VMP signing in ${hook} — platform ${electronPlatformName} is not signed by this hook (${platforms.join(", ")})`,
    );
    return;
  }

  if (signedDirs.has(appOutDir)) {
    console.log(`[vmp] ${appOutDir} was already VMP-signed in this run — skipping`);
    return;
  }

  // Verify the output directory exists before attempting to sign it.
  if (!existsSync(appOutDir)) {
    const msg = `[vmp] app output directory does not exist: ${appOutDir}`;
    if (requireSigning) {
      throw new Error(msg);
    }
    console.warn(msg);
    return;
  }

  const python = resolvePython();
  if (!python) {
    const msg =
      "[vmp] Python not found — cannot run castlabs_evs.vmp.\n" +
      "      Install Python 3 and run: pip install --upgrade castlabs-evs\n" +
      "      Then authenticate: python -m castlabs_evs.account signin";

    if (requireSigning) {
      throw new Error(msg);
    }
    console.warn(msg);
    console.log(
      "[vmp] BEDROCK_REQUIRE_VMP_SIGNING is not set — continuing with Castlabs development-signed runtime",
    );
    return;
  }

  // Check whether the EVS module is importable before running.
  try {
    execFileSync(python, ["-c", "import castlabs_evs"], { stdio: "pipe" });
  } catch {
    const msg =
      "[vmp] castlabs_evs Python package not installed.\n" +
      `      Run: ${python} -m pip install --upgrade castlabs-evs\n` +
      "      Then authenticate: python -m castlabs_evs.account signin";

    if (requireSigning) {
      throw new Error(msg);
    }
    console.warn(msg);
    console.log(
      "[vmp] BEDROCK_REQUIRE_VMP_SIGNING is not set — continuing without VMP signing",
    );
    return;
  }

  // The signing target is the application directory (appOutDir): the
  // directory containing the .app (macOS) or the .exe (Windows, win-unpacked).
  // Do NOT sign the NSIS/DMG installer itself — EVS VMP operates on the
  // Electron runtime directory, not the final installer artifact.
  const signingTarget = appOutDir;
  console.log("[vmp] signing application directory:", signingTarget);

  const signArgs = ["-m", "castlabs_evs.vmp", "sign-pkg"];
  if (persistent) signArgs.push("--persistent");
  signArgs.push(signingTarget);

  try {
    execFileSync(python, signArgs, {
      stdio: "inherit",
      // EVS reads credentials from its own local configuration — do not
      // pass any secrets via env vars here.
    });
    console.log("[vmp] VMP signing completed successfully");
    signedDirs.add(appOutDir);
  } catch (err) {
    const msg =
      "[vmp] EVS VMP signing FAILED.\n" +
      "      Ensure you have authenticated: python -m castlabs_evs.account signin\n" +
      "      Error: " +
      String(err);

    // Signing failure is always a hard error when explicitly required.
    if (requireSigning) {
      throw new Error(msg);
    }

    // If signing is optional (dev builds) warn loudly but do not abort.
    // The packaged app will use the Castlabs development-signed runtime.
    console.error(msg);
    console.log(
      "[vmp] Continuing with Castlabs development-signed runtime.\n" +
        "      Set BEDROCK_REQUIRE_VMP_SIGNING=1 to make signing failures fatal.",
    );
    return;
  }

  // When signing is required, also verify the result so a silently
  // ineffective signature fails the build instead of shipping.
  if (requireSigning) {
    const verifyArgs = ["-m", "castlabs_evs.vmp", "verify-pkg", persistent ? "-p" : "-s", signingTarget];
    console.log("[vmp] verifying VMP signature…");
    try {
      execFileSync(python, verifyArgs, { stdio: "inherit" });
      console.log("[vmp] VMP signature verified");
    } catch (err) {
      throw new Error(
        "[vmp] EVS VMP verification FAILED after signing.\n" +
          "      The package at " + signingTarget + " does not carry a valid VMP signature.\n" +
          "      Error: " + String(err),
      );
    }
  }

  // Locate the VMP manifest file if EVS wrote one, for log confirmation.
  const vmpManifest = join(signingTarget, "vmp.hfu");
  if (existsSync(vmpManifest)) {
    console.log("[vmp] vmp.hfu manifest present in signed output");
  }
}

/**
 * Legacy single-hook entry point. Equivalent to the macOS afterPack hook;
 * Windows signing moved to scripts/vmp-after-sign.mjs (Authenticode must run
 * first). Prefer referencing vmp-after-pack.mjs / vmp-after-sign.mjs directly.
 * @param {import('electron-builder').AfterPackContext} context
 */
export default async function vmpSignLegacy(context) {
  if (context.electronPlatformName === "win32") {
    console.warn(
      "[vmp] scripts/vmp-sign.mjs no longer signs Windows builds (VMP must run after Authenticode). " +
        "Use scripts/vmp-after-sign.mjs as the electron-builder afterSign hook.",
    );
  }
  await signVmp(context, { platforms: ["darwin"], hook: "afterPack (legacy)" });
}
