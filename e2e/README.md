# Bedrock e2e + screenshot harness

Standalone npm project (NOT part of the pnpm workspace). It drives the real
Vite dev servers of the TV launcher and the phone remote with Playwright, using
mocks for the Electron bridge (`window.bedrock`) and the desktop WebSocket.

```bash
cd e2e
npm ci
npx playwright test                    # all projects
npx playwright test --project=tv       # 1920x1080 launcher only
npx playwright test --project=phone    # 390x844 @3x phone remote only
```

Requires workspace deps installed (`pnpm install` at the repo root) and a
Playwright 1.56.1 Chromium (`npx playwright install chromium`, or set
`PLAYWRIGHT_BROWSERS_PATH`). Dev servers start automatically
(TV launcher on :5199, phone remote on :5174) and are reused if already running.

Screenshots are written to `docs/screenshots/<name>.png` via `snap(page, name)`
from `fixtures/snap.ts`.

## Fixtures

- `fixtures/bridge.ts`: `installBridge(page, "withHistory" | "empty" | "remoteError")`
  before `page.goto`, then `emitNav / emitContext / emitToast / getCalls`.
- `fixtures/mock-remote-server.ts`: `test` with a `mockRemote` fixture (mock
  desktop WebSocket on a free port). `mockRemote.phoneUrl` opens the phone UI;
  `mockRemote.commands()` lists received commands. Use
  `test.use({ mockRemoteOptions: { mode: "launcher", requirePairing: "482913" } })`.
