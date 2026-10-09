import type { PlaybackHistoryItem } from "@bedrock/shared";

/** "23 min left" / "1 hr 5 min left"; null when position or duration is unknown. */
export function timeLeftLabel(item: Pick<PlaybackHistoryItem, "positionSeconds" | "durationSeconds">): string | null {
  const { positionSeconds: pos, durationSeconds: dur } = item;
  if (pos == null || dur == null || dur <= 0 || pos < 0) return null;
  const left = Math.max(0, dur - pos);
  const minutes = Math.max(1, Math.ceil(left / 60));
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr left` : `${h} hr ${m} min left`;
}

/** 0..1 watched fraction; null when unknown. */
export function progressFraction(item: Pick<PlaybackHistoryItem, "positionSeconds" | "durationSeconds">): number | null {
  const { positionSeconds: pos, durationSeconds: dur } = item;
  if (pos == null || dur == null || dur <= 0) return null;
  return Math.min(1, Math.max(0, pos / dur));
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "Last watched today" / "yesterday" / "Mon" / "Oct 4". */
export function lastWatchedLabel(lastPlayedAt: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(lastPlayedAt)) / 86_400_000);
  if (days <= 0) return "Last watched today";
  if (days === 1) return "Last watched yesterday";
  const date = new Date(lastPlayedAt);
  if (days < 7) return `Last watched ${date.toLocaleDateString("en-US", { weekday: "short" })}`;
  return `Last watched ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function greeting(now = new Date()): { hello: string; question: string } {
  const h = now.getHours();
  if (h >= 5 && h < 12) return { hello: "Good morning", question: "What are we watching today?" };
  if (h >= 12 && h < 17) return { hello: "Good afternoon", question: "What are we watching today?" };
  return { hello: "Good evening", question: "What are we watching tonight?" };
}

export function clockLabel(now = new Date()): string {
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
