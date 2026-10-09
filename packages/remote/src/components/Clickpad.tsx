import { useCallback, useEffect, useRef, useState } from "react";
import { createPointerCoalescer, TRACKPAD_TAP_SLOP, TRACKPAD_TAP_MAX_MS } from "../pointer-coalesce";
import type { ConnectionStatus, WsClient } from "../ws-client";
import type { InputCommand } from "@bedrock/shared";
import { describeFailure, describeInput } from "@bedrock/shared";

interface ClickpadProps {
  client: WsClient;
  status: ConnectionStatus;
  onToast: (toast: { message: string; ok: boolean }) => void;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

const HINT_KEY = "bedrock.remote.hintSeen";

function readHintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Touch surface (Siri Remote clickpad). One finger moves, tap clicks, two fingers scroll.
 * Gesture logic is unchanged; this component only restyles it and adds feedback.
 */
export function Clickpad({ client, status, onToast }: ClickpadProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(status);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  const rippleId = useRef(0);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const touchState = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastCenterX: 0,
    lastCenterY: 0,
    startTime: 0,
    isTwoFinger: false,
  });

  const coalescer = useRef<ReturnType<typeof createPointerCoalescer> | null>(null);

  const sendInput = useCallback(
    (cmd: InputCommand, awaitResult = false) => {
      if (status !== "CONNECTED") return;
      client
        .sendInput(cmd, { awaitResult })
        .then((result) => {
          if (!result.ok) onToast({ message: describeFailure("Click", result.reason), ok: false });
          else {
            const label = awaitResult ? describeInput(cmd) : null;
            if (label) onToast({ message: label, ok: true });
          }
        })
        .catch(() => {
          onToast({ message: describeFailure("Click"), ok: false });
        });
    },
    [client, status, onToast],
  );

  useEffect(() => {
    coalescer.current = createPointerCoalescer({
      send: (cmd) => sendInput(cmd),
      isActive: () => statusRef.current === "CONNECTED",
      // Backpressure: on congested Wi-Fi, moves would otherwise pile up in the
      // socket buffer and cursor lag would grow without bound.
      canSend: () => client.bufferedAmount < 4096,
    });
    return () => {
      coalescer.current?.dispose();
    };
  }, [sendInput, client]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;

    // Prevent default touch behaviors like scrolling and zooming
    const prevent = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchstart", prevent, { passive: false });
    el.addEventListener("touchmove", prevent, { passive: false });
    el.addEventListener("touchend", prevent, { passive: false });
    el.addEventListener("touchcancel", prevent, { passive: false });

    return () => {
      el.removeEventListener("touchstart", prevent);
      el.removeEventListener("touchmove", prevent);
      el.removeEventListener("touchend", prevent);
      el.removeEventListener("touchcancel", prevent);
    };
  }, []);

  const markUsed = () => {
    if (hintSeen) return;
    setHintSeen(true);
    try {
      window.localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* private mode */
    }
  };

  const addRipple = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const id = ++rippleId.current;
    setRipples((r) => [...r.slice(-3), { id, x: clientX - rect.left, y: clientY - rect.top }]);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 650);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0]!;
      let lastCenterX = touch.clientX;
      let lastCenterY = touch.clientY;
      if (e.touches.length >= 2) {
        const touch2 = e.touches[1]!;
        lastCenterX = (touch.clientX + touch2.clientX) / 2;
        lastCenterY = (touch.clientY + touch2.clientY) / 2;
      }
      touchState.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        lastCenterX,
        lastCenterY,
        startTime: Date.now(),
        isTwoFinger: e.touches.length >= 2,
      };
      markUsed();
      addRipple(touch.clientX, touch.clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 0 || !coalescer.current) return;

    const isTwoFinger = e.touches.length >= 2;
    if (isTwoFinger && !touchState.current.isTwoFinger) {
      touchState.current.isTwoFinger = true;
      const touch0 = e.touches[0]!;
      const touch1 = e.touches[1]!;
      touchState.current.lastCenterX = (touch0.clientX + touch1.clientX) / 2;
      touchState.current.lastCenterY = (touch0.clientY + touch1.clientY) / 2;
      return;
    }

    if (isTwoFinger) {
      const touch0 = e.touches[0]!;
      const touch1 = e.touches[1]!;
      const centerX = (touch0.clientX + touch1.clientX) / 2;
      const centerY = (touch0.clientY + touch1.clientY) / 2;
      const dx = centerX - touchState.current.lastCenterX;
      const dy = centerY - touchState.current.lastCenterY;
      touchState.current.lastCenterX = centerX;
      touchState.current.lastCenterY = centerY;
      coalescer.current.scroll(dx, dy);
      return;
    }

    const touch = e.touches[0]!;
    const dx = touch.clientX - touchState.current.lastX;
    const dy = touch.clientY - touchState.current.lastY;

    touchState.current.lastX = touch.clientX;
    touchState.current.lastY = touch.clientY;

    coalescer.current.move(dx, dy);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const { startX, startY, startTime, isTwoFinger } = touchState.current;
    if (isTwoFinger) return;

    if (e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0]!;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const time = Date.now() - startTime;

    if (dist <= TRACKPAD_TAP_SLOP && time <= TRACKPAD_TAP_MAX_MS) {
      try {
        navigator.vibrate?.(8);
      } catch {
        /* best-effort */
      }
      // Push out any pending move first so the click can't overtake it.
      coalescer.current?.flush({ force: true });
      sendInput({ type: "pointer-click", button: "left" }, true);
    }
  };

  return (
    <div
      ref={surfaceRef}
      className="clickpad"
      role="application"
      aria-label="Touch surface. Swipe to move, tap to click, two fingers to scroll."
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className={`clickpad__hint${hintSeen ? " is-hidden" : ""}`}>
        Swipe to move · Tap to click
        <br />
        Two fingers to scroll
      </p>
      {ripples.map((r) => (
        <span key={r.id} className="clickpad__ripple" style={{ left: r.x, top: r.y }} />
      ))}
    </div>
  );
}
