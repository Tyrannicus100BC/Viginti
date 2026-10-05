# Reload and recovery

## MUST

- Do not make ordinary source edits require a launcher rebuild.
- Ensure a full browser reload is safe after a server restart.
- Before runtime validation, record the update owner for frontend source,
  backend source, and runtime configuration. For each class, identify
  framework HMR, a command-provided process watcher, Enmanner configuration
  restart, or a supported manual restart. Do not infer backend watching from an
  embedded frontend development server.
- Before starting a separate development server, run
  `./.enmanner/scripts/runtime-status --json`. Verify changes through the
  reported managed application URL when an instance is running. A parallel
  server is isolated testing and is not evidence about the generated app.

By default Enmanner does not replace Vite or another framework's HMR channel.
While a server is healthy, the framework owns fine-grained updates. If a
previously-ready server exits, Enmanner shows a reconnecting state, restarts the
configured command with bounded backoff, waits for readiness, and loads the app
again.

When `userConfiguration.file` is declared, Enmanner watches that one file.
External stable edits receive the same restart behavior as **Save & Restart**.
Invalid edits stop the old runtime and open Project Settings instead of leaving
stale values active. Enmanner does not watch arbitrary source or configuration
paths.

For a healthy non-watching component, use:

```text
./.enmanner/scripts/runtime-restart --component COMPONENT --wait --json
```

Omit `--component` to restart the complete managed runtime. The returned status
identifies the canonical project, managed URL, and new process generation.

## SHOULD

- Preserve framework-native source watching, HMR, and browser refresh when the
  project already supports them.
- Add a restart watcher only when it is safe for the project's state and
  established development behavior.
- Preserve durable user data while development processes restart.
- Avoid watcher configurations that include generated `.app`, `.enmanner/.build`,
  database, upload, or cache directories.

## Optional Vite pause control

For projects whose HTML is served through Vite, the integration MAY enable the
native **View → Pause Live Updates** control. Add top-level
`"liveUpdates": { "adapter": "vite" }` to `enmanner/enmanner.json`, and import
`enmannerLiveUpdates` from `.enmanner/adapters/vite-live-updates.mjs` into the
project-owned Vite configuration, adding `enmannerLiveUpdates()` to its plugins.
Preserve existing plugins. Rebuild the launcher after upgrading its sources.

Verify source edits, HTML/CSS changes, error overlays, and a Vite restart while
paused through the managed URL, then resume and verify one reload with current
source. The pause applies to frontend updates only; it does not isolate backend
code, configuration, navigation, or data. The browser bridge needs Vite HTML
transforms and permission to run under the project's CSP. Do not infer support
for arbitrary SSR pipelines or other frameworks. The native menu stays disabled
until the server adapter acknowledges the session; that acknowledgement alone
does not prove the project's browser integration works.
