import type { ReactElement } from "react";

export type IconName =
  | "play.fill"
  | "qrcode"
  | "iphone"
  | "wifi"
  | "checkmark.circle.fill"
  | "xmark.circle.fill"
  | "house.fill"
  | "chevron.left"
  | "chevron.right"
  | "tv";

/** SF Symbols-style glyphs: 24px grid, 2px stroke, round caps/joins, currentColor. */
const GLYPHS: Record<IconName, ReactElement> = {
  "play.fill": (
    <path d="M8 5.8v12.4a.9.9 0 0 0 1.38.76l9.7-6.2a.9.9 0 0 0 0-1.52l-9.7-6.2A.9.9 0 0 0 8 5.8z" fill="currentColor" />
  ),
  qrcode: (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" />
      <path d="M14 14h2.5v2.5H14zM18 18h2.5M18 14h2.5M14 20.5V18" />
    </>
  ),
  iphone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.5 9.2a14 14 0 0 1 19 0M5.5 12.6a9.6 9.6 0 0 1 13 0M8.6 16a5.2 5.2 0 0 1 6.8 0" />
      <circle cx="12" cy="19.4" r="1" fill="currentColor" />
    </>
  ),
  "checkmark.circle.fill": (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
      <path d="m7.6 12.4 3 3 5.8-6.4" stroke="var(--icon-glyph, #fff)" strokeWidth="2.2" />
    </>
  ),
  "xmark.circle.fill": (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
      <path d="m8.6 8.6 6.8 6.8M15.4 8.6l-6.8 6.8" stroke="var(--icon-glyph, #fff)" strokeWidth="2.2" />
    </>
  ),
  "house.fill": (
    <path d="M3.5 11.2 11 4.4a1.4 1.4 0 0 1 2 0l7.5 6.8v8a1.4 1.4 0 0 1-1.4 1.4H15v-5.2H9v5.2H4.9a1.4 1.4 0 0 1-1.4-1.4z" fill="currentColor" />
  ),
  "chevron.left": <path d="m15 5-7 7 7 7" />,
  "chevron.right": <path d="m9 5 7 7-7 7" />,
  tv: (
    <>
      <rect x="2.5" y="4.5" width="19" height="13" rx="2.5" />
      <path d="M8 21h8" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  className?: string;
  /** Pass a label for meaningful icons; otherwise the icon is decorative. */
  label?: string;
}

export function Icon({ name, className, label }: IconProps) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  );
}
