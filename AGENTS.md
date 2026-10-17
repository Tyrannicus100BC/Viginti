
<!-- enmanner:begin -->
## Enmanner

Enmanner is installed in this project. Read `.enmanner/AGENTS.md` before
changing startup, networking, persistence, secrets, native presentation,
or collaboration. Preserve the repository as the source of truth.
<!-- enmanner:end -->

## Server lifecycle — Enmanner launcher only

- Start and manage this project's application server exclusively through
  `Viginti.app`, the Enmanner launcher. The user must be able to see and manage
  the server lifecycle through the app.
- Before testing in a browser, run
  `./.enmanner/scripts/runtime-status --json`. Use the running app's reported
  URL. If the app is not running, agents may open `Viginti.app` without asking.
- Never start a separate server with `npm run dev`, `npm run preview`, Vite,
  Node, a tool execution session, a detached/background command, or an
  in-process server API. This also prohibits temporary or isolated preview
  servers on alternate ports.
- Use the app's lifecycle controls or Quit to stop or restart its server;
  do not bypass the launcher by managing its child processes directly.
- Finite build, type-check, and test commands are allowed, provided they do not
  leave a server running. If launcher startup fails, diagnose and report the
  failure instead of falling back to an unmanaged server.
- This project rule overrides any framework guidance that permits a standalone
  or isolated test server. Keep project-specific instructions outside the
  vendored `.enmanner/` directory.

## Browser testing — use the fastest relevant entry point

- For mechanics testing, default to `?quickstart=1&skippack=1` on the
  application URL reported by Enmanner. For example:
  `http://127.0.0.1:42236/?quickstart=1&skippack=1`. This bypasses the title and
  initial pack screens and starts an already-dealt first round, with the usual
  $50 ante paid and no opening upgrade. Later pack rewards still work normally.
- For pack or progression testing, use `?quickstart=1` alone. This starts the
  same fresh run as **Start Run**, directly at the opening pack choice.
- Navigate directly to the relevant shortcut instead of inspecting and clicking
  through setup screens. Always use the reported managed URL; do not assume
  its port or start another server. Preserve any existing query parameters.
- Use the plain URL only when testing the title screen itself. Reloading a
  quick-start URL starts a fresh run; returning to the title within the app
  still works normally.
