import mascotUrl from "@static/icons/bedrock-mascot-512.png";
import type { ConnectionInfo } from "../bedrock-api";
import { QrCode } from "./QrCode";

interface PairingSheetProps {
  connection: ConnectionInfo | null;
  onClose: () => void;
}

export function pairingEndpoint(connection: ConnectionInfo | null): string | null {
  if (!connection) return null;
  if (connection.httpUrl) return connection.httpUrl;
  if (connection.ip != null) return `http://${connection.ip}:${connection.port}`;
  return null;
}

/** Centered modal on a dimmed, blurred backdrop. Done is the only focusable control. */
export function PairingSheet({ connection, onClose }: PairingSheetProps) {
  const endpoint = pairingEndpoint(connection);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__body">
          <img className="sheet__mascot" src={mascotUrl} alt="" draggable={false} />
          <h2 id="pair-title">Pair your phone</h2>
          <p className="sheet__sub">
            Scan with your phone&rsquo;s camera, or open <strong>bedrock.local</strong> on the same Wi-Fi and enter
            this code.
          </p>
          <div className="sheet__code" aria-label={`Pairing code ${connection?.pairingCode ?? ""}`}>
            {(connection?.pairingCode ?? "······").split("").map((digit, i) => (
              <span key={i}>{digit}</span>
            ))}
          </div>
          <p className="sheet__caption">
            {connection?.remoteError
              ? connection.remoteError
              : connection
                ? `${connection.ip ?? "This computer"} · port ${connection.port}`
                : ""}
          </p>
          <button type="button" className="btn btn--glass is-focused" data-sheet-done tabIndex={0} autoFocus onClick={onClose}>
            Done
          </button>
        </div>
        <div className="sheet__qr">
          {endpoint ? <QrCode value={endpoint} label="QR code to open Bedrock on your phone" /> : <div className="qr qr--empty">Remote unavailable</div>}
        </div>
      </section>
    </div>
  );
}
