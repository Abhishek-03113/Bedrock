/** Minimal typings for the vendored qrcode-generator 2.0.4 (MIT, Kazuhiko Arase). */
export interface QRCode {
  addData(data: string, mode?: "Numeric" | "Alphanumeric" | "Byte" | "Kanji"): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
}
export type ErrorCorrectionLevel = "L" | "M" | "Q" | "H";
export function qrcode(typeNumber: number, errorCorrectionLevel: ErrorCorrectionLevel): QRCode;
export default qrcode;
