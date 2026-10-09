import mascotUrl from "@static/icons/bedrock-mascot-512.png";

interface MascotProps {
  size?: number;
  breathing?: boolean;
  className?: string;
}

/** The Bedrock remote mascot in an iOS-style squircle (22.37% radius). */
export function Mascot({ size = 112, breathing = true, className = "" }: MascotProps) {
  return (
    <div
      className={`mascot${breathing ? " mascot--breathing" : ""} ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <img src={mascotUrl} alt="" width={size} height={size} draggable={false} />
    </div>
  );
}
