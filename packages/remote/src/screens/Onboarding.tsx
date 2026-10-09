import { useEffect, useRef, useState, type FormEvent } from "react";
import { ActivityIndicator } from "../components/ActivityIndicator";
import { Mascot } from "../components/Mascot";

/** Same layout as the inline boot screen in index.html, so the handoff is seamless. */
export function BootScreen({ children }: { children?: React.ReactNode }) {
  return (
    <main className="screen screen--center">
      <Mascot size={112} />
      <p className="wordmark">Bedrock</p>
      {children}
    </main>
  );
}

export function ConnectingScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(t);
  }, []);
  return (
    <BootScreen>
      <div className="connecting" role="status" aria-live="polite">
        <ActivityIndicator size={20} />
        <span>Looking for your computer…</span>
      </div>
      <p className={`footnote connecting__help${slow ? " is-visible" : ""}`}>
        Make sure your phone and computer are on the same Wi-Fi.
      </p>
    </BootScreen>
  );
}

interface PairingScreenProps {
  /** Increments each time the TV rejects a code (restarts the shake). */
  errorTick: number;
  busy: boolean;
  onSubmit: (code: string) => void;
}

export function PairingScreen({ errorTick, busy, onSubmit }: PairingScreenProps) {
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // A rejected code clears the boxes so the next attempt starts fresh.
  useEffect(() => {
    if (errorTick > 0) {
      setCode("");
      inputRef.current?.focus();
    }
  }, [errorTick]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.length === 6 && !busy) onSubmit(code);
  };

  const active = Math.min(code.length, 5);
  const showError = errorTick > 0 && !busy;

  return (
    <main className="screen">
      <form className="pair" onSubmit={submit}>
        <Mascot size={96} />
        <h1 className="large-title">Pair with Bedrock</h1>
        <p className="body-secondary">Enter the 6-digit code shown on your TV screen.</p>

        <div
          key={showError ? `err-${errorTick}` : "ok"}
          className={`otp${showError ? " otp--error" : ""}`}
          onClick={() => inputRef.current?.focus()}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={`otp__box${focused && i === active ? " is-active" : ""}${code[i] ? " is-filled" : ""}`}
              aria-hidden="true"
            >
              {code[i] ?? ""}
              {focused && i === active && !code[i] ? <i className="otp__caret" /> : null}
            </span>
          ))}
          <input
            ref={inputRef}
            className="otp__input"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            value={code}
            aria-label="Pairing code"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>

        <p className="form-error" role="alert">
          {showError ? "That code didn’t work. Check your TV and try again." : ""}
        </p>

        <button type="submit" className="primary-button" disabled={code.length !== 6 || busy}>
          {busy ? <ActivityIndicator size={18} /> : null}
          Pair
        </button>
      </form>
    </main>
  );
}

export function ErrorScreen({ message }: { message?: string | null }) {
  return (
    <main className="screen screen--center">
      <Mascot size={88} breathing={false} />
      <h1 className="title-2">Something went wrong</h1>
      <p className="body-secondary">
        Bedrock hit a snag. Reload to try again, and make sure the app is running on your computer.
      </p>
      {message ? <p className="footnote error-detail">{message}</p> : null}
      <button type="button" className="primary-button primary-button--inline" onClick={() => window.location.reload()}>
        Reload
      </button>
    </main>
  );
}
