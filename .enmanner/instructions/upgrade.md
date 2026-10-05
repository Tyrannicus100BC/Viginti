# Routine upgrades

For an established project, preview the latest recorded upstream release with:

```bash
./.enmanner/scripts/upgrade --check --latest
```

Apply it and run static validation, bounded runtime validation, a conditional
native rebuild, two native launch-and-quit cycles, and Doctor with:

```bash
./.enmanner/scripts/upgrade --latest --verify
```

The command reports the semantic-version and Git-revision transition, file
counts, release notes, schema and migration status, rebuild decision, final app
path, verification evidence, and durable files awaiting commit. Use `--json`
when a caller needs one machine-readable result; progress is written to stderr.

An upgrade never changes `enmanner/enmanner.json` implicitly. Revisit the
initial integration analysis only when the report says it is relevant:

- Re-evaluate the application boundary when a required schema migration changes
  component or application fields.
- Re-check persistence ownership when lifecycle or launch-guard configuration
  changes.
- Re-run browser-origin analysis when endpoint or browser-hostname behavior
  changes.

Without one of those triggers, review the compact upgrade summary and record
the framework changes in the owning repository. Enmanner never stages or
commits them.
