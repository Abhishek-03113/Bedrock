/**
 * electron-builder `afterSign` hook — Castlabs EVS VMP signing for Windows.
 *
 * Windows: VMP signing must happen AFTER Authenticode signing (signing a
 * VMP-signed binary with Authenticode afterwards invalidates the VMP
 * signature). electron-builder's afterSign runs after the .exe/.dll files in
 * win-unpacked were Authenticode-signed and before the NSIS installer is
 * assembled. macOS is deliberately skipped here (see vmp-after-pack.mjs).
 *
 * @param {import('electron-builder').AfterPackContext} context
 */
import { signVmp } from "./vmp-sign.mjs";

export default async function vmpAfterSign(context) {
  await signVmp(context, { platforms: ["win32"], hook: "afterSign" });
}
