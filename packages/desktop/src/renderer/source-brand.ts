/**
 * Brand tints for app cards, keyed by source id. The renderer stays source-agnostic:
 * unknown ids fall back to a neutral palette.
 */
export interface SourceBrand {
  /** Vivid brand color: glows, progress. */
  accent: string;
  /** Deep base color of the tile gradient. */
  base: string;
  /** Optical size correction for logos drawn small inside their square viewBox. */
  logoScale?: number;
}

const BRANDS: Record<string, SourceBrand> = {
  netflix: { accent: "#E50914", base: "#0a0000" },
  youtube: { accent: "#FF0033", base: "#1a0409" },
  prime: { accent: "#00A8E1", base: "#04202c", logoScale: 2.1 },
  hotstar: { accent: "#1F80E0", base: "#0E2C5A" },
};

const FALLBACK: SourceBrand = { accent: "#5E6B85", base: "#14181f" };

export function brandFor(sourceId: string): SourceBrand {
  return BRANDS[sourceId] ?? FALLBACK;
}

/** Inline CSS variables consumed by the tile/hero gradient classes. */
export function brandStyle(sourceId: string): Record<string, string> {
  const b = brandFor(sourceId);
  return { "--brand-accent": b.accent, "--brand-base": b.base, "--logo-scale": String(b.logoScale ?? 1) };
}
