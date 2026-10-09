import type { ReactNode, SVGProps } from "react";

/**
 * SF-Symbols-style inline icons: 24px grid, 2px stroke, round caps and joins,
 * `currentColor`. Names follow the SF Symbols vocabulary (design system §7).
 * Filled glyphs paint with `fill="currentColor"`; knock-outs use `--knockout`.
 */
export type IconName =
  | "chevron.left"
  | "chevron.right"
  | "chevron.up"
  | "chevron.down"
  | "house.fill"
  | "magnifyingglass"
  | "keyboard"
  | "ellipsis"
  | "gobackward.10"
  | "goforward.10"
  | "play.fill"
  | "pause.fill"
  | "playpause.fill"
  | "forward.end.fill"
  | "speaker.minus"
  | "speaker.plus"
  | "checkmark"
  | "checkmark.circle.fill"
  | "xmark"
  | "xmark.circle.fill"
  | "arrow.up"
  | "arrow.down"
  | "arrow.left"
  | "arrow.right"
  | "escape"
  | "tab"
  | "delete.left"
  | "return"
  | "tv";

const F = "currentColor";
const KO = "var(--knockout, #000)";

const GLYPHS: Record<IconName, ReactNode> = {
  "chevron.left": <path d="M15 5l-7 7 7 7" strokeWidth={2.4} />,
  "chevron.right": <path d="M9 5l7 7-7 7" strokeWidth={2.4} />,
  "chevron.up": <path d="M5 15l7-7 7 7" strokeWidth={2.4} />,
  "chevron.down": <path d="M5 9l7 7 7-7" strokeWidth={2.4} />,
  "house.fill": (
    <path
      d="M12 3.4 3.4 10.3A1 1 0 0 0 3 11.1V19.5A1.5 1.5 0 0 0 4.5 21H9v-5.5h6V21h4.5a1.5 1.5 0 0 0 1.5-1.5v-8.4a1 1 0 0 0-.4-.8z"
      fill={F}
      strokeWidth={1.4}
    />
  ),
  magnifyingglass: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20.5 20.5" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="3" />
      <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M6.5 14h.01M17.5 14h.01" strokeWidth={2.4} />
      <path d="M9.5 14h5" />
    </>
  ),
  ellipsis: (
    <>
      <circle cx="5" cy="12" r="1.7" fill={F} stroke="none" />
      <circle cx="12" cy="12" r="1.7" fill={F} stroke="none" />
      <circle cx="19" cy="12" r="1.7" fill={F} stroke="none" />
    </>
  ),
  "gobackward.10": (
    <>
      <path d="M12 5.2A7.8 7.8 0 1 1 6.5 7.5" />
      <path d="M12 2l-3.2 3.2L12 8.4" />
      <text x="12" y="16" textAnchor="middle" fontSize="7.6" fontWeight="700" fill={F} stroke="none" fontFamily="inherit">10</text>
    </>
  ),
  "goforward.10": (
    <>
      <path d="M12 5.2A7.8 7.8 0 1 0 17.5 7.5" />
      <path d="M12 2l3.2 3.2L12 8.4" />
      <text x="12" y="16" textAnchor="middle" fontSize="7.6" fontWeight="700" fill={F} stroke="none" fontFamily="inherit">10</text>
    </>
  ),
  "play.fill": (
    <path d="M7.5 5v14l11.5-7z" fill={F} strokeWidth={1.8} />
  ),
  "pause.fill": (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1.3" fill={F} strokeWidth={1} />
      <rect x="14" y="4.5" width="4" height="15" rx="1.3" fill={F} strokeWidth={1} />
    </>
  ),
  "playpause.fill": (
    <>
      <path d="M3.8 5.4v13.2l9-6.6z" fill={F} strokeWidth={1.8} />
      <rect x="15" y="5" width="2.6" height="14" rx="1.1" fill={F} strokeWidth={1} />
      <rect x="19" y="5" width="2.6" height="14" rx="1.1" fill={F} strokeWidth={1} />
    </>
  ),
  "forward.end.fill": (
    <>
      <path d="M3 6.4v11.2l7.6-5.6z" fill={F} strokeWidth={1.6} />
      <path d="M10.8 6.4v11.2l7.6-5.6z" fill={F} strokeWidth={1.6} />
      <rect x="19.6" y="5.6" width="2" height="12.8" rx="1" fill={F} strokeWidth={1} />
    </>
  ),
  "speaker.minus": (
    <>
      <path d="M3.5 9.6h3.4l5.1-4.2v13.2l-5.1-4.2H3.5z" fill={F} strokeWidth={1.6} />
      <path d="M16 12h5.5" strokeWidth={2.2} />
    </>
  ),
  "speaker.plus": (
    <>
      <path d="M2.5 9.6h3.4L11 5.4v13.2l-5.1-4.2H2.5z" fill={F} strokeWidth={1.6} />
      <path d="M15 12h6M18 9v6" strokeWidth={2.2} />
    </>
  ),
  checkmark: <path d="M5 12.8 9.8 17.5 19 7" strokeWidth={2.6} />,
  "checkmark.circle.fill": (
    <>
      <circle cx="12" cy="12" r="10" fill={F} stroke="none" />
      <path d="M7.3 12.4l3.3 3.2 6.1-6.6" stroke={KO} strokeWidth={2.4} />
    </>
  ),
  xmark: <path d="M6 6l12 12M18 6 6 18" strokeWidth={2.4} />,
  "xmark.circle.fill": (
    <>
      <circle cx="12" cy="12" r="10" fill={F} stroke="none" />
      <path d="M8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8" stroke={KO} strokeWidth={2.4} />
    </>
  ),
  "arrow.up": <path d="M12 19V5.5M5.8 11.5 12 5.3l6.2 6.2" />,
  "arrow.down": <path d="M12 5v13.5M5.8 12.5 12 18.7l6.2-6.2" />,
  "arrow.left": <path d="M19 12H5.5M11.5 5.8 5.3 12l6.2 6.2" />,
  "arrow.right": <path d="M5 12h13.5M12.5 5.8l6.2 6.2-6.2 6.2" />,
  escape: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M15.2 15.2 8.8 8.8M8.6 14V8.6H14" />
    </>
  ),
  tab: <path d="M3.5 12h11.5M10.5 7l5 5-5 5M20 5.5v13" />,
  "delete.left": (
    <>
      <path d="M9.2 5.5H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9.2L2.8 12z" />
      <path d="M12.8 9.4l4.4 4.4M17.2 9.4l-4.4 4.4" />
    </>
  ),
  return: <path d="M20 5.5v6.2a3 3 0 0 1-3 3H4.8M9.2 10 4.5 14.7l4.7 4.7" />,
  tv: (
    <>
      <rect x="3" y="4.5" width="18" height="12.5" rx="2.6" />
      <path d="M8 20.5h8" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Rendered edge in px (default 24). Scales with the viewBox. */
  size?: number;
}

export function Icon({ name, size = 24, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {GLYPHS[name]}
    </svg>
  );
}
