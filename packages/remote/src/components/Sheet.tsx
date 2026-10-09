import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const SheetContext = createContext<() => void>(() => {});
/** Dismiss the surrounding sheet with its exit animation. */
export const useSheetClose = () => useContext(SheetContext);

interface SheetProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
  /** Lift above the on-screen keyboard (visualViewport). */
  avoidKeyboard?: boolean;
  /** Dim + dismiss on backdrop tap (default true). */
  modal?: boolean;
}

/** iOS-style bottom sheet: grabber, material, spring in, Escape/backdrop to dismiss. */
export function Sheet({ label, onClose, children, avoidKeyboard = false, modal = true }: SheetProps) {
  const [closing, setClosing] = useState(false);
  const [lift, setLift] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestClose = useCallback(() => {
    if (closeTimer.current != null) return;
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(
    () => () => {
      if (closeTimer.current != null) clearTimeout(closeTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  useEffect(() => {
    if (!avoidKeyboard) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setLift(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [avoidKeyboard]);

  return (
    <div className={`sheet-root${closing ? " is-closing" : ""}`}>
      {modal ? <div className="sheet-backdrop" onClick={requestClose} aria-hidden="true" /> : null}
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={lift ? { bottom: lift } : undefined}
      >
        <div className="sheet__grabber" aria-hidden="true" />
        <SheetContext.Provider value={requestClose}>{children}</SheetContext.Provider>
      </div>
    </div>
  );
}

