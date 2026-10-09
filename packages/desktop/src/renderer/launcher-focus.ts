import type { NavAction } from "@bedrock/shared";

/**
 * Pure launcher focus helpers — renderer-owned, no Electron main coupling.
 * `moveFocusIndex` is the legacy single-grid helper (wraps). The launcher itself uses
 * `moveRowFocus`: rows of focusable items, up/down between rows, left/right clamped.
 */

export function resolveInitialFocusIndex(
  sourceIds: readonly string[],
  preferredSourceId: string | null | undefined,
): number {
  if (sourceIds.length === 0) return 0;
  if (preferredSourceId) {
    const idx = sourceIds.indexOf(preferredSourceId);
    if (idx >= 0) return idx;
  }
  return 0;
}

export function clampFocusIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

/**
 * Move focus on a CSS grid with `columns` columns (1-based width of a row).
 * Left/right wrap within the full list; up/down wrap by column stride.
 */
export function moveFocusIndex(
  current: number,
  action: Exclude<NavAction, "select" | "home" | "back">,
  length: number,
  columns: number,
): number {
  if (length <= 0) return 0;
  const cols = Math.max(1, columns);
  const index = clampFocusIndex(current, length);

  switch (action) {
    case "left":
      return (index - 1 + length) % length;
    case "right":
      return (index + 1) % length;
    case "up":
      return (index - cols + length) % length;
    case "down":
      return (index + cols) % length;
    default:
      return index;
  }
}

/** Count columns from a CSS `grid-template-columns` computed value. */
export function columnCountFromTemplate(gridTemplateColumns: string): number {
  const parts = gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, parts.length);
}

export interface RowFocus {
  row: number;
  col: number;
}

type DirectionAction = "up" | "down" | "left" | "right";

/**
 * 2-D focus across rows (spec section 5). `rowLengths[i]` is the number of focusable
 * items in row i; empty rows are skipped. Left/right clamp at the row ends (no wrap).
 * Up/down jump to the nearest non-empty row and keep the closest column.
 */
export function moveRowFocus(
  current: RowFocus,
  action: DirectionAction,
  rowLengths: readonly number[],
): RowFocus {
  const pos = clampRowFocus(current, rowLengths);
  switch (action) {
    case "left":
      return { row: pos.row, col: Math.max(0, pos.col - 1) };
    case "right":
      return {
        row: pos.row,
        col: Math.min((rowLengths[pos.row] ?? 1) - 1, pos.col + 1),
      };
    case "up":
    case "down": {
      const step = action === "up" ? -1 : 1;
      for (let r = pos.row + step; r >= 0 && r < rowLengths.length; r += step) {
        const len = rowLengths[r] ?? 0;
        if (len > 0) return { row: r, col: nearestColumn(pos.col, rowLengths[pos.row] ?? 1, len) };
      }
      return pos;
    }
    default:
      return pos;
  }
}

/** Map a column in a row of `fromLen` items onto a row of `toLen` items (clamped). */
export function nearestColumn(col: number, fromLen: number, toLen: number): number {
  if (toLen <= 0) return 0;
  if (fromLen <= 1) return Math.min(col, toLen - 1);
  return clampFocusIndex(col, toLen);
}

/** Keep a row/col position inside the current layout (used when rows change). */
export function clampRowFocus(pos: RowFocus, rowLengths: readonly number[]): RowFocus {
  if (rowLengths.length === 0) return { row: 0, col: 0 };
  let row = Math.min(Math.max(pos.row, 0), rowLengths.length - 1);
  if ((rowLengths[row] ?? 0) === 0) {
    const fallback = rowLengths.findIndex((len) => len > 0);
    row = fallback >= 0 ? fallback : 0;
  }
  return { row, col: clampFocusIndex(pos.col, rowLengths[row] ?? 0) };
}
