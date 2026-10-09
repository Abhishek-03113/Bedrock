# Release CI — Bedrock

How `.github/workflows/release.yml` builds, signs and publishes Bedrock
installers. Related docs: [widevine-vmp.md](widevine-vmp.md) (what VMP/EVS is),
[windows-release.md](windows-release.md) (local Windows builds).

---

## Pipeline overview

Three signing systems are involved and **their order differs per OS**:

| OS | Order | Why |
|---|---|---|
| macOS | **VMP (EVS)** -> Apple codesign -> notarize -> DMG/ZIP | Castlabs: VMP signing must happen *before* Apple code signing, otherwise Apple's signature is invalidated / the VMP signature breaks. |
| Windows | Authenticode (.exe/.dll) -> **VMP (EVS)** -> NSIS | Castlabs: VMP signing must happen *after* Authenticode; signing a VMP-signed binary afterwards invalidates VMP. |
| Linux | none -> AppImage | Not VMP-signed (hooks skip Linux). |

This maps onto electron-builder (`app-builder-lib@25.1.8`) hooks:

```
                       electron-builder (per OS)
  ┌───────────────────────────────────────────────────────────────────┐
  │ unpack Electron + copy app                                        │
  │        │                                                          │
  │        ▼  afterPack  ── scripts/vmp-after-pack.mjs (darwin only)  │
  │        │                                                          │
  │        ▼  signApp                                                 │
  │           macOS: codesign (hardened runtime) ─► notarize          │
  │           Windows: rcedit + Authenticode (.exe, .dll)             │
  │        │                                                          │
  │        ▼  afterSign ─ scripts/vmp-after-sign.mjs (win32 only)     │
  │        │                                                          │
  │        ▼  targets: NSIS / DMG+ZIP / AppImage                      │
  └───────────────────────────────────────────────────────────────────┘
```

Workflow stages (each matrix row, in order):

```
tag push v* / workflow_dispatch
   │
   ├─ setup ............ emit matrix (win, mac, [linux])
   └─ build (per OS, environment: release)
        1. VMP gate ................ decide BEDROCK_REQUIRE_VMP_SIGNING, fail fast on missing EVS secrets
        2. checkout, pnpm, node 22, python 3.12 (VMP rows), caches
        3. pnpm install --frozen-lockfile
        4. build @bedrock/shared, typecheck, desktop tests, remote tests
        5. pnpm --filter @bedrock/desktop build
        6. electron-rebuild better-sqlite3 against Castlabs ECS ABI
        7. EVS auth (castlabs_evs.account refresh)
        8. electron-builder (hooks do VMP; OS signing; notarize on macOS)
        9. upload artifacts
   └─ release (tags only) ..... gh release create --draft  (or upload --clobber)
```

Tests run **before** the native rebuild on purpose: vitest loads `better-sqlite3`
under Node's ABI, and the rebuild switches it to Electron's ABI.

---

## One-time setup

### 1. Castlabs EVS account

Create an account at <https://github.com/castlabs/electron-releases/wiki/EVS>
(`python -m castlabs_evs.account signup`). CI authenticates non-interactively
with `python -m castlabs_evs.account -n refresh -A $EVS_ACCOUNT_NAME -P $EVS_PASSWD`.

### 2. Apple (macOS)

1. Apple Developer Program membership.
2. A **Developer ID Application** certificate. Export it from Keychain Access as
   a `.p12` (with a password), then `base64 -i cert.p12 | pbcopy`.
3. An **App Store Connect API key** (Users and Access -> Integrations -> Keys,
   role *Developer* or higher). Download `AuthKey_XXXX.p8` once. Note the Key ID
   and the Issuer ID shown on that page.
   *Alternative:* an Apple ID + app-specific password (appleid.apple.com) + Team ID.

### 3. Windows Authenticode certificate

An OV/EV code-signing certificate exported as `.pfx` (with password):
`base64 -i cert.pfx | pbcopy` (Linux: `base64 -w0 cert.pfx`).
Note: cloud/HSM-only EV certificates cannot be exported as a `.pfx` and need a
different signing integration (not covered here).

### 4. GitHub Environment and secrets

Create the environment: **Settings -> Environments -> New environment -> `release`**.
Recommended protection: *Required reviewers* (you), and *Deployment branches and
tags* restricted to tags matching `v*` (plus a tag-protection ruleset so only
maintainers can push `v*`). The build job declares `environment: release`, so the
secrets below are only exposed to jobs that pass those rules. (If the environment
does not exist, GitHub auto-creates it without protections on first run; secrets
then have to be repository-level secrets instead. Environment secrets are
preferred.) With required reviewers each matrix job asks for approval; they can
be approved together.

Add these as **environment secrets** of `release`:

| Secret | Required for | Value |
|---|---|---|
| `EVS_ACCOUNT_NAME` | VMP (Win, mac) | EVS account name |
| `EVS_PASSWD` | VMP (Win, mac) | EVS password |
| `WIN_CSC_LINK` | Windows Authenticode | base64 of the `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | Windows Authenticode | `.pfx` password |
| `MAC_CSC_LINK` | macOS signing | base64 of the Developer ID Application `.p12` |
| `MAC_CSC_KEY_PASSWORD` | macOS signing | `.p12` password |
| `APPLE_API_KEY_P8` | macOS notarization (preferred) | full text of `AuthKey_XXXX.p8` including BEGIN/END lines |
| `APPLE_API_KEY_ID` | macOS notarization (preferred) | Key ID |
| `APPLE_API_ISSUER` | macOS notarization (preferred) | Issuer ID (UUID) |
| `APPLE_ID` | notarization alternative | Apple ID e-mail |
| `APPLE_APP_SPECIFIC_PASSWORD` | notarization alternative | app-specific password |
| `APPLE_TEAM_ID` | notarization alternative | 10-char Team ID |

The Apple ID trio is only used when the API-key trio is incomplete. Missing OS
signing secrets are *not* a hard failure (see the gate table); only VMP is.

---

## Cutting a release

1. Bump `version` in `packages/desktop/package.json` and merge to `main`.
2. `git tag v0.2.0 && git push origin v0.2.0` (the workflow warns if the tag and
   package version differ; installer file names use the package version).
3. Approve the `release` environment if reviewers are configured.
4. When all rows are green, the `release` job creates a **draft** release
   (`gh release create --draft --generate-notes`; tags containing `-`, e.g.
   `v0.2.0-rc.1`, are marked prerelease). If the release already exists, files
   are uploaded with `--clobber`.
5. Review the draft (download and smoke-test installers), then publish it in the
   GitHub UI.

### Dry runs (`workflow_dispatch`)

Actions -> Release -> *Run workflow*. Inputs:

- `require_vmp` (default **true**): enforce VMP like a tag build.
  Set to `false` to dry-run without EVS secrets (dev-signed runtime).
- `include_linux` (default false): also build the AppImage.

Dispatch runs upload workflow artifacts (14 days) but never create a release.

---

## `BEDROCK_REQUIRE_VMP_SIGNING` gate

Applies to the Windows and macOS rows only. Linux rows always run with it off.

| Trigger | `require_vmp` | EVS secrets | Result |
|---|---|---|---|
| tag push | n/a (always required) | present | Auth, sign, **verify-pkg**; any failure fails the build |
| tag push | n/a | absent | **Fails early** with `::error::` |
| dispatch | true | present | same as tag push |
| dispatch | true | absent | **Fails early** with `::error::` |
| dispatch | false | present | Auth + sign; failures only warn (dev-signed runtime shipped) |
| dispatch | false | absent | `::warning::`, no EVS auth, dev-signed runtime |

OS-level signing is intentionally *not* a hard gate: without `WIN_CSC_LINK` the
Windows build is unsigned (SmartScreen), without `MAC_CSC_LINK` the macOS build
is unsigned and un-notarized (`CSC_IDENTITY_AUTO_DISCOVERY=false` is set so no
random runner identity gets used), and a signed macOS build without notarization
credentials is signed but not notarized. Each case emits a `::warning::`.
Treat unsigned tag builds as test builds; do not publish them.

When signing is required, `vmp-sign.mjs` runs `castlabs_evs.vmp verify-pkg` on the
same directory after `sign-pkg`. Set `BEDROCK_VMP_PERSISTENT=1` (hook env) to use
`sign-pkg --persistent` / `verify-pkg -p`. `BEDROCK_PYTHON` forces the
interpreter (CI sets `python` from setup-python).

---

## macOS notarization semantics (electron-builder 25.1.8)

- `mac.notarize` is **not** required: in `macPackager.js` `notarizeIfProvided`,
  only an explicit `notarize: false` skips; otherwise credentials come from env.
  `getNotarizeOptions` checks, in order: `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD`
  + `APPLE_TEAM_ID`; then `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER`;
  then `APPLE_KEYCHAIN_PROFILE`. With none set it skips silently (warn log
  "notarization options were unable to be generated"). A *partial* set throws
  `InvalidConfigurationError`. That is why the workflow only exports complete
  sets and never exports both families (Apple ID would win).
- Notarization only happens if the app was actually code-signed (it runs at the
  end of the signing step), so unsigned local builds stay unsigned.
- Config: `hardenedRuntime: true`, `gatekeeperAssess: false`, and
  `build/entitlements.mac.plist` (JIT, unsigned executable memory, disable
  library validation — required because the Widevine CDM is downloaded at
  runtime by the component updater and is not signed with our Team ID).

---

## Caching

- `pnpm` store: `actions/setup-node` `cache: pnpm`.
- `pip`: `actions/setup-python` `cache: pip`, keyed on
  `packages/desktop/scripts/requirements-evs.txt`.
- Electron + electron-builder downloads: `actions/cache` for
  `.cache/electron` and `.cache/electron-builder` (set through `ELECTRON_CACHE`
  and `ELECTRON_BUILDER_CACHE`), key `<os>-<arch>-electron-<hash pnpm-lock.yaml>`.
- **Never cached:** the EVS config directory / tokens. Runners are ephemeral and
  each run authenticates fresh.

---

## Linux

An AppImage (`electron-builder --linux AppImage --x64`) is built on tag pushes
and when `include_linux` is set. It is **never VMP-signed** and ECS Linux
Widevine support is partial, so treat it as a convenience build. Local:
`pnpm --filter @bedrock/desktop package:linux`.

---

## Native modules (better-sqlite3)

`npmRebuild: false` in electron-builder.yml, so CI runs `electron-rebuild`
explicitly. The `rebuild-native` script and the workflow use
`-d https://github.com/castlabs/electron-releases/releases/download` — node-gyp
appends `/v<version>/node-v<version>-headers.tar.gz`, so the old trailing `/v` in
the script produced `download/v/v42...`. **Unverified assumption:** castlabs
publishes headers at that location. The workflow probes it and, if unreachable,
falls back to upstream Electron headers for the same base version
(`42.8.0`), which share the same Node ABI.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `::error title=EVS credentials missing::` | Add `EVS_ACCOUNT_NAME` / `EVS_PASSWD` to the `release` environment, or dispatch with `require_vmp=false` for a dry run. |
| `castlabs_evs.account refresh` fails | Check name/password locally with `python -m castlabs_evs.account signin`; confirm secrets have no trailing newline. |
| `[vmp] castlabs_evs Python package not installed` | `BEDROCK_PYTHON` points at a Python without the package; ensure the pip step ran on that interpreter. |
| `EVS VMP verification FAILED` | Something modified binaries after signing. On macOS ensure nothing runs before afterPack that touches the runtime; on Windows ensure Authenticode config did not move after afterSign (e.g. custom `sign` hooks running later, or `signAndEditExecutable: false` — electron-builder then *skips afterSign entirely*). |
| Notarization failed / `Invalid` | `xcrun notarytool log <id>`; typically missing hardened runtime, or an unsigned nested binary. Check entitlements and certificate type (Developer ID Application). |
| `Env vars APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER need to be set` | Partial credential set; supply all three secrets (or none). |
| `NODE_MODULE_VERSION` mismatch at app start | Native rebuild used the wrong headers; inspect the "Rebuild native modules" step output and rebuild for the ECS version. |
| SmartScreen warning on Windows | Expected for unsigned or low-reputation certs. EV certs get reputation immediately; OV certs build it over time. |
| Gatekeeper "damaged" / "cannot be opened" | App not signed/notarized — check the macOS warnings in the build log. |
