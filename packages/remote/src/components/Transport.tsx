import { Icon } from "./Icon";

interface TransportProps {
  canSeek: boolean;
  canVolume: boolean;
  canNext: boolean;
  onPlayPause: () => void;
  onSeek: (deltaSeconds: number) => void;
  onNext: () => void;
  onVolume: (direction: "up" | "down") => void;
}

/** Playback row + volume rocker (volume is the most-used control at night). */
export function Transport({ canSeek, canVolume, canNext, onPlayPause, onSeek, onNext, onVolume }: TransportProps) {
  const haptic = () => {
    try {
      navigator.vibrate?.(8);
    } catch {
      /* best-effort */
    }
  };
  return (
    <div className="transport">
      <div className="transport__row" role="group" aria-label="Playback">
        <button
          type="button"
          className="round-button"
          aria-label="Back 10 seconds"
          disabled={!canSeek}
          onClick={() => {
            haptic();
            onSeek(-10);
          }}
        >
          <Icon name="gobackward.10" size={30} />
        </button>
        <button
          type="button"
          className="play-button"
          aria-label="Play or pause"
          onClick={() => {
            haptic();
            onPlayPause();
          }}
        >
          <Icon name="playpause.fill" size={34} />
        </button>
        <button
          type="button"
          className="round-button"
          aria-label="Forward 10 seconds"
          disabled={!canSeek}
          onClick={() => {
            haptic();
            onSeek(10);
          }}
        >
          <Icon name="goforward.10" size={30} />
        </button>
        {canNext ? (
          <button
            type="button"
            className="round-button"
            aria-label="Next episode"
            onClick={() => {
              haptic();
              onNext();
            }}
          >
            <Icon name="forward.end.fill" size={26} />
          </button>
        ) : null}
      </div>
      <div className={`rocker${canVolume ? "" : " is-disabled"}`} role="group" aria-label="Volume">
        <button
          type="button"
          className="rocker__half"
          aria-label="Volume down"
          disabled={!canVolume}
          onClick={() => {
            haptic();
            onVolume("down");
          }}
        >
          <Icon name="speaker.minus" size={26} />
        </button>
        <span className="rocker__divider" aria-hidden="true" />
        <button
          type="button"
          className="rocker__half"
          aria-label="Volume up"
          disabled={!canVolume}
          onClick={() => {
            haptic();
            onVolume("up");
          }}
        >
          <Icon name="speaker.plus" size={26} />
        </button>
      </div>
    </div>
  );
}
