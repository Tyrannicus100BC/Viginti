# Core compatibility rules

## MUST

- Keep deterministic, noninteractive component commands in
  `enmanner/enmanner.json`.
- Keep every managed service in the foreground so Enmanner can supervise its
  process group.
- Bind declared endpoints to loopback and use their allocated endpoint values.
- Declare dependencies explicitly, including every cross-component endpoint
  reference.
- Give the user-facing application component meaningful startup readiness.
- Treat shared or already-running infrastructure as observed prerequisites,
  never adopted services. Do this without asking when independent lifecycle
  evidence is clear; report the choice non-blockingly.
- Treat a headless API or worker required by the human-facing application as a
  managed component when the expected double-click experience should start it;
  being headless or living in another repository does not make it an external
  prerequisite.
- Make browser clients recover after a managed-service restart.
- Keep runtime data outside generated build output.
- Keep secrets out of source, Git, logs, and `enmanner/enmanner.json`.
- Keep project dependencies inside this repository; do not install them
  system-wide.
- Treat the repository, never the generated `.app`, as editable source.
- Ensure ordinary web-source changes work without rebuilding the `.app`.

## SHOULD

- Make startup idempotent and shutdown graceful.
- Use one-shot task components for migrations that must precede services.
- Preserve framework-native hot reload when the project already supports it.
- Add a restart watcher only when it is safe and appropriate for the project.
- Show useful user-facing errors.
- Preserve user-entered state across safe upgrades.
- Keep generated files reproducible and disposable.
- Let the coding agent create quiet Git checkpoints before risky changes and
  after working milestones. Never overwrite uncommitted user work.
- Give the app a distinctive icon. Follow the preflight and acceptance gates in
  `icon.md`.

## MAY

- Extend the app with project-local tools that do not change the compatibility
  contract.
