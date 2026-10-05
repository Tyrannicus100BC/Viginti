# Project-local Enmanner

This directory is a vendored Enmanner distribution. Every file inside
`.enmanner/` is framework-owned and should be changed only through Enmanner's
repair or upgrade workflow.

The supported project-facing surface is:

- `../enmanner/enmanner.json` — project-owned configuration;
- `scripts/build-app` — validate and build the final native application, or a
  separately identified development-only lifecycle bundle;
- `scripts/validate` — static or opted-in runtime validation, with optional
  newline-delimited progress and a configurable post-readiness stability soak;
- `scripts/doctor` — validation plus installation, manifest-draft, icon,
  generated-app ownership, disk capacity, workspace ownership, and managed-file
  diagnostics; `doctor --next` prints a tailored Markdown handoff;
- `scripts/runtime-status` — identify the running managed project, endpoint,
  process generations, and configuration freshness as text or JSON;
- `scripts/runtime-restart` — request a dependency-aware full-runtime or
  component restart from the running launcher, optionally waiting for ready;
- `scripts/upgrade` — revision-aware, checksum-verified latest-upstream updates
  with optional end-to-end verification; see `instructions/upgrade.md`;
- `RELEASE_NOTES.json` — local machine-readable release and migration notes;
- `scripts/clean` — remove local Swift build products;
- `scripts/create-icon` — create a layered modern icon package and, with full
  Xcode, its generated legacy fallback from project artwork;
- `scripts/preview-icon` — render a configured or explicitly selected icon
  package in all supported appearances for review;
- `scripts/test-app` — verify final or explicitly selected development app
  launch, readiness, normal quit, and runtime cleanup with separate receipts.

`framework/` is the native implementation. Do not place icons, data, scripts,
or overrides inside `.enmanner/`; keep Enmanner-specific project files in the
visible `../enmanner/` sibling.
