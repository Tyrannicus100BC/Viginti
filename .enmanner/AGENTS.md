# Enmanner compatibility

Enmanner is installed in this repository. The repository is the editable source of
truth; the generated `.app` is only a reproducible native front door.

Start with `instructions/integration.md`. It defines the required sequence and
routes to the focused rules below only when they apply.
The installer plan's `requiredInstructions` array records this routing with a
reason for each selected reference.

Before installing or configuring, establish the product root and inventory the
whole user-facing workflow. A frontend, backend, or other service repository is
not automatically the application boundary merely because it has a runnable
development server. Cooperating sibling repositories normally belong to one
component graph rooted at their common workspace.

Every file inside `.enmanner/` is vendored, framework-owned code. Do not add
project overrides there or edit native internals during an integration. Keep
the manifest, icon package, and icon source artwork in the visible, project-owned
`enmanner/` sibling.
Spell both `enmanner/` and `.enmanner/` exactly in lowercase. Do not adapt their
casing to the repository's naming style.

Read focused rules only when the plan or current task selects them:

- `core.md` — required compatibility contract
- `icon.md` — app icon selection, generation, and configuration
- `development-server.md` — startup, ports, readiness, and shutdown
- `reload.md` — hot reload and restart recovery
- `persistence.md` — project source versus runtime data
- `security.md` — secrets, local networking, dependencies, and trust
- `collaboration.md` — why sharing is an architecture change

Treat **MUST** as required, **SHOULD** as the safe default, and **MAY** as
optional. `./.enmanner/scripts/doctor --next` produces a project-specific
Markdown summary. Rebuild the `.app` only when native configuration or launcher
files change; ordinary web source edits do not require it.
