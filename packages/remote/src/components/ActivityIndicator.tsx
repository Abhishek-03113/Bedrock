/** iOS-style 12-spoke activity indicator. */
export function ActivityIndicator({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {Array.from({ length: 12 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 30}deg)`, animationDelay: `${(i - 12) * 100}ms` }} />
      ))}
    </span>
  );
}
