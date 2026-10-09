# Backend review: remote input path and main process

Scope: `packages/desktop/src/main/**` (remote-server, ws-server, pairing,
source-host, source-input, virtual-pointer, remote-cursor, toast-overlay, ipc,
db, sources) and `packages/shared/**` (ws-protocol, input-commands, commands).
The phone client is reviewed only where it sits on the input streaming path
(`packages/remote/src/ws-client.ts`, `pointer-coalesce.ts`, `Clickpad.tsx`,
`KeyboardInput.tsx`, `MoreSheet.tsx`).

Baseline: `main` at `4a63f7f`. Line references point to that commit.

Status legend: **Fixed** means fixed in the `fix/remote-input-hardening` PR.
**Open** means it's a recommendation that needs a decision, usually because
the fix is architectural.

## Input path at a glance

```
Phone (PWA)                       Desktop main process                     Source page
───────────                       ────────────────────                     ───────────
touchmove ─► pointer-coalesce ─►  ws "message" ─► handleMessage ─►         WebContentsView
            (1 msg / frame)       (sync for input; await for command)      sendInputEvent /
tap/keys ─► ws-client.sendInput   SourceHost.handleInput                   insertText
                                  └► VirtualPointerController
                                     ├► applyInputCommand (source-input)
                                     └► RemoteCursorOverlay.update (IPC)
◄─ command-result (every input) ◄─┘   + toast broadcast for labelled input
```

Ordering is sound for raw input. WebSocket delivery is ordered, and the
`input` branch of `handleMessage` makes no `await` before
`host.handleInput()`, so input messages are applied in arrival order. Commands
(`kind: "command"`) await `handleCommand` and can finish out of order. That is
fine because results are matched by `requestId`. The ordering bugs below are
all on the producer side (phone) or at disconnect time.

---

## Critical

### C1. A web page can take over the remote: no Origin check and the pairing code can be brute-forced — **Fixed**
`remote-server.ts:106`, `remote-server.ts:202-215`, `pairing.ts:5-11`

- Browsers don't apply CORS to WebSockets. The upgrade handler accepts any
  `Origin`, so any web page can open `ws://127.0.0.1:17832` or
  `ws://<lan-ip>:17832` and start sending `hello`. That includes a page in the
  user's normal browser on the laptop, a page on another LAN device, and the
  streaming sites that Bedrock itself loads in its WebContentsViews.
- Pairing is a 6-digit code (10⁶ values). There's no limit on attempts per
  socket, per IP or globally. Failed sockets stay open forever, and the code
  never rotates. Over localhost a script can try every code in minutes.
- After pairing, the attacker's `clientId` is trusted permanently. That gives
  them full pointer, keyboard and `text-input` control over logged-in
  streaming sessions and the launcher.
- `randomDigits` uses `Math.random()`, which isn't a CSPRNG.

Fix: an Origin/Host allowlist on upgrade. Host must be an IP literal,
`localhost` or `*.local`, which blocks DNS rebinding. Origin, when present,
must match Host's hostname. Also added: an auth deadline, a limit of 5 wrong codes per socket and 10
wrong codes per IP per minute, and `crypto.randomInt`. Only hellos that carry
a code count as guesses. The deadline is 10 s for a socket that hasn't sent a
hello, and 5 minutes for one waiting on the pairing screen.

Trade-offs: a phone on the same IP or NAT as an attacker can be locked out for
up to a minute. Hostnames other than an IP, `localhost` or `*.local` (for
example Tailscale MagicDNS) now get a 403 on the WebSocket upgrade.

## High

### H1. Unauthenticated requests can crash the main process or exhaust its memory — **Fixed**
- `remote-static.ts:37`: `decodeURIComponent` runs on the raw path without a
  guard. `GET /%E0%A4%A` throws a `URIError` inside the HTTP request handler.
  That's an uncaught exception in the Electron main process, caused by one
  unauthenticated request.
- `remote-server.ts:125,196`: `JSON.parse("null")` (or `"1"`) passes the
  parse, then `message.kind` throws. The `void handleMessage(...)` call turns
  that into an unhandled promise rejection, before auth.
- `remote-server.ts:106`: no `maxPayload`, so the `ws` default of 100 MiB
  applies. A client that hasn't authenticated can make the main process
  buffer and `JSON.parse` 100 MB frames.

Fix: guard the decode (respond 400) and wrap the HTTP handler (respond 500).
Check the message shape (non-null object with a string `kind`). Add `.catch`
on the handler promise, and set `maxPayload: 64 KiB`.

### H2. A command that fails or is malformed never gets a reply, so the phone waits forever — **Fixed**
`remote-server.ts:260`, `ws-client.ts:278,299`

- `message.command` reaches `source.handleCommand` without validation. An
  object like `{type:"search"}` (no `query`) throws on `query.trim()`.
- `page.navigate` → `webContents.loadURL` rejects with `ERR_ABORTED`
  whenever an SPA redirects or replaces the navigation, which is common on
  search pages. So a real search can reject too.
- Either way, `handleMessage` rejects, no `command-result` is sent and no
  toast shows. The client's `pending` map has no timeout, so the
  `sendCommand` promise never settles.
- `nav.action` isn't validated either. Unknown actions go to the renderer,
  and `describeNav` returns `undefined`, which then appears as the toast
  text.

Fix: `parseRemoteCommand` and `parseNavAction` in `@bedrock/shared`, and a
try/catch around `handleCommand` so a `command-result` is always sent. On the
client, pending requests now time out after 10 s.

## Medium

### M1. A disconnect between key-down and key-up leaves the key or button held — **Fixed**
`KeyboardInput.tsx`, `MoreSheet.tsx` and the server's close handling

The phone sends `key-down`, awaits the reply, then sends `key-up`. The same
pattern would apply to `pointer-down`/`pointer-up` drags. If the socket drops
between the two, `sendInput` returns `no-active-session` locally and the
`up` event is never sent. The page keeps a logically held key or mouse
button: drag-selects stick, and keydown-driven players keep seeking.

Fix: the server tracks down keys and buttons per socket and sends the
matching `key-up`/`pointer-up` when the socket closes.

### M2. Keyboard sheet: overlapping edits can type the wrong text, and each change waits for a round trip — **Fixed**
`KeyboardInput.tsx:31-49`

- `handleChange` is async and awaits each `sendInput`. Change events from
  fast typing overlap. If one change is running a multi-character Backspace
  loop, another change's `text-input` can land between those Backspaces.
  Characters then get deleted out of order, and the TV field differs from
  the phone field.
- The diff only compares lengths. Mid-string edits, autocorrect and
  predictive-text replacements of the same length are sent wrong or not at
  all.
- Each Backspace waits for 2 round trips.

Fix: compute a common-prefix diff synchronously and send every operation in
order with no awaits in between (WebSocket order is the queue). Then await
all the results together for error toasts. Return and More-sheet keys do the
same.

### M3. Pointer streaming has no backpressure, so lag builds up on weak Wi-Fi — **Fixed**
`pointer-coalesce.ts:44-67`, `ws-client.ts:264`

The coalescer sends one `pointer-move` per frame whether or not the socket is
draining. On a congested link, frames pile up in `bufferedAmount`, and the
TV cursor drifts further behind the finger the longer the user drags.

Fix: the coalescer takes a `canSend()` predicate. Clickpad passes
`bufferedAmount < 4 KiB`. While it's false, deltas keep accumulating
(they're additive, so nothing is lost) and go out in the next frame that can
send.

Related (**Open**): the server sends a `command-result` for every
`pointer-move` and `pointer-scroll`, about 60 per second, and the client
throws them away (`awaitResult: false`). Dropping acks for successful
high-frequency input would halve the packet rate. That changes the protocol,
so it needs your decision.

### M4. Moving the cursor resizes the overlay window on every frame — **Fixed**
`remote-cursor.ts:34`

`RemoteCursorOverlay.update()` calls `positionWindow()`, which calls
`BrowserWindow.setBounds`. `update()` runs for every input command, so that's
an OS window operation about 60 times a second. Listeners on the parent's
move, resize and fullscreen events already keep the overlay aligned.

Fix: reposition only when the parent moves or resizes, when the overlay is
created, and when it goes from hidden to visible.

### M5. Reconnect can multiply sockets — **Fixed**
`ws-client.ts:249-252, 313-327`

`setPairingCode()` opens a new socket when the current one is `CLOSED`, but
it doesn't cancel a pending `reconnectTimer`. The timer then opens a third
socket. Listeners on the orphaned sockets are still attached and each closes
into another reconnect. The result is duplicate `hello`s, duplicate toasts,
and status updates from stale sockets. Reconnect also uses a fixed 1.5 s
delay with no backoff or jitter.

Fix: ignore events from sockets that aren't current, clear the timer before
a manual reconnect, and use capped exponential backoff with jitter (reset on
`hello-ack`).

### M6. Half-open connections aren't detected — **Fixed**
`remote-server.ts` (no heartbeat)

When a phone sleeps or roams off Wi-Fi, its TCP connection can stay
half-open for minutes or hours. The server keeps it in `clients` and keeps
writing broadcasts into it.

Fix: ping every 15 s and terminate clients that miss a pong.

### M7. Keys stop working after the TV window loses focus — **Fixed**
`source-input.ts:101`

`focusForInput` caches `cursor.focused = true` after the first focus and
never focuses again. If the Bedrock window loses OS focus (alt-tab, a
notification, a click on another app), `sendInputEvent` keys and
`insertText` go nowhere until the source changes.

Fix: focus again whenever the window or the WebContents isn't focused.
This happens on click, key and text input. A bare pointer move after alt-tab
still doesn't refocus (see `VirtualPointerController.handleInput`). That's a
minor follow-up.

### M8. Detached source views keep running after their window closes (macOS) — **Fixed**
`source-host.ts:57-77`

`dispose()` detaches views but never closes their `webContents`. The views
include pre-warmed ones that were never attached. On macOS the app outlives
its window. Closing the window and re-activating from the dock builds a new
`SourceHost` with new views, while the old ones keep their pages, audio and
DRM sessions alive.

Fix: call `webContents.close()` on each view in `dispose()`.

### M9. Quitting can hang for up to 30 s when a phone stops responding — **Fixed**
`remote-server.ts:152-168`, `index.ts` `shutdown()`

`close()` closes each socket gracefully, then `httpServer.close()` waits for
those connections to finish. If a phone never answers the close handshake,
the wait lasts until ws's 30 s `closeTimeout`. All that time,
`before-quit` is held with `preventDefault()`.

Fix: close gracefully, then `terminate()` any socket still open after
about 1 s, and clear the heartbeat and auth timers.

## Low

### L1. A tap can be applied before the last pending move — **Fixed**
`Clickpad.tsx:202`

`pointer-click` is sent directly, while up to 16 ms of moves can still be
waiting in the coalescer. The click then goes out first and lands at the
stale position. Fix: `flush()` before the click.

### L2. Return may not submit forms — **Open**
`source-input.ts:222-233`

`key-down`/`key-up` send only `keyDown`/`keyUp` input events, with no
`char` event. Chromium's implicit form submission and `keypress` listeners
need the `char` event for Enter. Handlers that listen for `keydown` (most
SPAs) work. Classic `<form>`s may not. Sending
`{type:"char", keyCode:"\r"}` after `keyDown` for Enter is a likely fix, but
it needs checking against the real sites before it ships.

### L3. Each toast reloads its overlay page — **Open**
`toast-overlay.ts:32`

Every toast calls `loadURL(data:...)`, a full navigation, in a separate
window. Server toasts are also broadcast to every phone for each "Typing…"
keystroke and each Click. The Clickpad also shows its own local "Click"
label, so the phone shows that toast twice. Recommendation: load the toast
page once and push updates over IPC, and debounce "Typing…".

### L4. No way to expire or revoke trusted phones — **Open (architectural)**
`pairing.ts`

`trusted_clients` grows forever and has no expiry or revoke UI. The
`clientId` acts as a bearer token, and it's chosen by the client. On iOS
over `http://` (an insecure context) it falls back to a
`Math.random`-based id. All traffic, including that id and typed text, is
plaintext `ws://` on the LAN. Options: server-issued random device tokens
returned in `hello-ack`, a "forget devices" action on the TV, and rotating
the pairing code after each successful pairing. TLS on the LAN is harder
because it needs self-signed certificates and trust prompts on the phone.

### L5. Wide-open CORS on static files — **Info**
`remote-static.ts:24-33`

`Access-Control-Allow-Origin: *` covers only the static remote UI and
`/health`. No data is exposed, so this is acceptable. It no longer matters
for WebSockets now that C1 checks Origin on upgrade.

## Checked and found sound
- Input parsing (`parseInputCommand`): finite numbers, key and button enums,
  `text-input` limited to 512 characters. Pointer deltas aren't bounded but
  are clamped to the view.
- The input branch runs synchronously, so input order matches arrival order.
- Path traversal in `remote-static.safeJoin` (apart from the decode crash in
  H1).
- `resumePlayback` checks URLs per source (host and path allowlist) before
  navigating.
- Search URLs use `encodeURIComponent`. No `executeJavaScript` call takes
  remote input.
- SQLite access uses prepared statements throughout.
- Shutdown order in `index.ts` (discovery, then server, then host, then
  overlay, then DB) is correct apart from M9.
