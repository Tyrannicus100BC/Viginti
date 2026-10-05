# Persistence

## MUST

- Separate editable source from runtime data and generated build output.
- Never store live databases, uploads, or user documents inside the `.app`.
- Never commit live user data unless the user explicitly chose a source-owned
  document format.
- Before runtime validation, identify stateful services and confirm their data
  ownership, mount destinations, and stop/start behavior.
- For Docker Compose, inspect the running container rather than assuming an
  image's data directory. Distinguish `stop`, `down`, and `down -v`; never use
  `down -v` in Enmanner lifecycle or validation.
- Preserve or back up existing volumes before changing lifecycle behavior, then
  verify persistence with a controlled stop/start test.
- For a project that is commonly started outside Enmanner, declare
  `launchGuard` evidence for stable application/API endpoints and important
  SQLite or other exclusive data files.

## SHOULD

- Use SQLite for structured local data when appropriate.
- Use plain files for small, document-like datasets.
- Give records stable identifiers.
- Keep database migrations in source control and make them repeatable.
- Back up data before destructive migrations.
- Provide import/export for important user-owned data.
- Keep local data in an explicit project data directory for the MVP and ignore
  it in Git.
- When the project has a trustworthy backup command, declare the single
  manifest `backup` contract so **File → Back Up Now** can run it under normal
supervision. Keep format, destination, retention, and restore logic in the
project.

`doctor --next` may recommend reviewing a launch guard when it finds shallow
SQLite/database paths together with stable endpoints. Treat the listed paths
as evidence to inspect, not fields to copy mechanically: declare only resources
that reliably identify a competing runtime, and omit the guard when the
project's concurrency model makes it unnecessary.

Enmanner can present explicitly declared local settings stored in a Git-ignored
dotenv file. The launcher materializes a configured template only when the
destination is absent and never overwrites an existing local file. This is
configuration, not a replacement for a clear per-project runtime-data and
backup policy.
