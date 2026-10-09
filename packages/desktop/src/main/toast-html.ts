/**
 * Markup for the player-mode toast window (a transparent BrowserWindow over the video).
 * Kept free of Electron imports so the e2e harness can render it in a plain browser.
 * Style matches the launcher HUD: dark material capsule, status icon, system font.
 */
export function toastDataUrl(payload: { message: string; ok: boolean }): string {
  const color = payload.ok ? "#30d158" : "#ff453a";
  const glyph = payload.ok
    ? '<path d="m7.6 12.4 3 3 5.8-6.4"/>'
    : '<path d="m8.6 8.6 6.8 6.8M15.4 8.6l-6.8 6.8"/>';
  const message = escapeHtml(payload.message);
  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  html, body { margin: 0; height: 100%; background: transparent; overflow: hidden; }
  body { display: grid; place-items: center; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .toast {
    pointer-events: none;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    max-width: calc(100vw - 16px);
    padding: 12px 24px 12px 16px;
    border-radius: 999px;
    background: rgba(28, 28, 30, 0.9);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.14);
    color: #fff;
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    animation: in 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .toast svg { width: 28px; height: 28px; flex: none; color: ${color}; }
  .toast span { overflow: hidden; text-overflow: ellipsis; }
  @keyframes in { from { opacity: 0; transform: translateY(14px) scale(0.9); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .toast { animation: fade 150ms linear both; } @keyframes fade { from { opacity: 0; } to { opacity: 1; } } }
</style></head>
<body><div class="toast" role="status"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><g stroke="#fff" stroke-width="2.2">${glyph}</g></svg><span>${message}</span></div></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
