/**
 * electron-builder `afterPack` hook — Castlabs EVS VMP signing for macOS.
 *
 * macOS: VMP signing must happen BEFORE Apple code signing. afterPack runs
 * before electron-builder's codesign + notarization, so it is the right place.
 * Windows is deliberately skipped here (see vmp-after-sign.mjs).
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
import { signVmp } from "./vmp-sign.mjs";

export default async function vmpAfterPack(context) {
  await signVmp(context, { platforms: ["darwin"], hook: "afterPack" });
}
