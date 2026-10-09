import { memo, useMemo } from "react";
import qrcode from "../vendor/qrcode-generator.js";

interface QrCodeProps {
  value: string;
  label?: string;
}

/** Inline-SVG QR code: dark modules on a rounded white card with a 4-module quiet zone. */
export const QrCode = memo(function QrCode({ value, label = "QR code" }: QrCodeProps) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 4;
    let d = "";
    for (let r = 0; r < count; r++) {
      let c = 0;
      while (c < count) {
        if (!qr.isDark(r, c)) {
          c++;
          continue;
        }
        const start = c;
        while (c < count && qr.isDark(r, c)) c++;
        d += `M${start + quiet} ${r + quiet}h${c - start}v1h-${c - start}z`;
      }
    }
    return { size: count + quiet * 2, path: d };
  }, [value]);

  return (
    <div className="qr">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <path d={path} fill="#0b0b10" />
      </svg>
    </div>
  );
});
