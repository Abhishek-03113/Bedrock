import { useEffect, useRef } from "react";
import mascotUrl from "@static/icons/bedrock-mascot-512.png";

/** Total length of the startup moment (spec section 6). */
export const SPLASH_MS = 1800;
export const SPLASH_REDUCED_MS = 600;

interface SplashScreenProps {
  onDone: () => void;
}

/**
 * Startup animation, played once per app launch: mascot springs in with a lime bloom,
 * blinks, the wordmark + tagline rise, then the whole splash scales up and fades into Home.
 * Any key press or remote nav skips it. Timing lives in CSS (`.splash*` keyframes);
 * this component only owns the "done" timer and skip handlers.
 */
export function SplashScreen({ onDone }: SplashScreenProps) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => doneRef.current(), reduced ? SPLASH_REDUCED_MS : SPLASH_MS);
    const skip = () => doneRef.current();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    const unsubscribe = window.bedrock?.onNav?.(skip);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="splash" role="status" aria-label="Bedrock is starting">
      <div className="splash__stage">
        <div className="splash__lift">
          <div className="splash__glow" aria-hidden="true" />
          <div className="splash__icon">
            <div className="splash__squish">
              <img src={mascotUrl} alt="" draggable={false} />
              <span className="splash__lid splash__lid--l" aria-hidden="true" />
              <span className="splash__lid splash__lid--r" aria-hidden="true" />
            </div>
          </div>
        </div>
        <div className="splash__text">
          <h1>Bedrock</h1>
          <p>Your laptop, from bed.</p>
        </div>
      </div>
    </div>
  );
}
