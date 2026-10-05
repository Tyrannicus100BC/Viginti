# Integration sequence

An Enmanner integration is complete only after the finished, distinctive app
has been built and verified. A development-only bundle can prove native
lifecycle behavior earlier, but cannot satisfy completion. Use this order:

1. Before selecting a target, map the complete runtime needed for a useful
   application session. Inspect the current repository root, parent and
   siblings, startup documentation, frontend proxy/API configuration, and
   service definitions. Inventory every browser-facing process, API, worker,
   startup task, datastore, container, and external dependency.
2. Confirm the product has a human-facing local web interface. Ask the user
   before wrapping a headless API, proxy, worker, daemon, CLI, or
   infrastructure service as the application entrypoint. A headless service can
   still be a launcher-owned component when the human-facing application
   depends on it.
3. Decide and state the double-click ownership contract: processes Enmanner
   will start, application services the user must start manually, and separately
   administered infrastructure Enmanner will only observe. Default an existing
   datastore, broker, container, Docker Desktop instance, or other persistent
   infrastructure process to an observed prerequisite without asking when it
   predates the integration, runs independently or detached, uses persistent
   external state, or project docs treat startup as environment setup. State
   that decision non-blockingly. Confirm with the user only if a required
   application service remains manual or contrary evidence makes ownership
   ambiguous. Repository boundaries do not determine process ownership. Do not
   run another copy concurrently when both would mutate the same local data.
4. Choose the integration root: the common directory containing the
   launcher-owned runtime, not necessarily a source repository or the
   application entrypoint. Do not treat the current directory, nearest Git
   root, first package manifest, or first runnable web server as proof that you
   found the whole product. Managed sibling repositories normally use their
   common workspace even when it is unversioned. Select it automatically when
   it contains the cooperating services and no plausible alternative
   application boundary exists. If the installer reports
   `canProceedWithoutProductDecision: true`, use any required mechanical
   acknowledgement such as `--allow-unversioned`, state the decision, and do
   not ask. Ask only when scope remains materially ambiguous. Keep the Enmanner
   source checkout outside every candidate root;
   on default macOS filesystems, `Enmanner/` conflicts with `enmanner/`.
5. Run the installer JSON plan against that integration root and review
   `recommendedIntegrationRoot`, `rootSelectionConfidence`,
   `configurationDurability`, `targetScope`, exact file operations, and
   unresolved checks. If
   `targetScope.reviewRequired` is true, correct the target or use
   `--allow-subproject` only after confirming that the nested service is itself
   the complete user-facing app.
6. Install framework files. When configuration is required, review
   `enmanner/enmanner.json.example`; never treat the draft as verified
   configuration. After writing `enmanner/enmanner.json`, delete the `.example`
   draft so it cannot be mistaken for a second configuration source.
7. Read `development-server.md`, then map the service inventory into one
   component graph. Verify component ownership, foreground execution, endpoint
   references, loopback binding, dependency ordering, readiness, shutdown, and
   preferred-port behavior. The application endpoint is usually the frontend;
   selecting it does not make its backend or other required services optional.
8. Read `persistence.md` and `security.md` when the project has stateful
   services, containers, secrets, uploads, user data, or machine-local settings.
   When adding `userConfiguration`, curate only values a person should edit or
   verify. Use consistent human-facing Title Case independent of dotenv key
   casing. Treat descriptions as compact subtitles: add information the label
   does not, prefer 45 characters or fewer, never exceed 60, and omit one that
   would merely restate the label.
9. Read `reload.md` and write down the update owner for frontend source,
   backend source, and runtime configuration. Distinguish framework HMR from a
   process-restart watcher; the presence of Vite inside a combined process does
   not prove that backend code reloads. Run
   `./.enmanner/scripts/runtime-status --json` before starting any standalone
   server. If the generated app is running, verify through its reported URL or
   explicitly label a parallel process as isolated testing.
10. Run static validation. Review state ownership before opting into runtime
   validation, then use `./.enmanner/scripts/validate --runtime --json` for the
   normal bounded result. Reserve `--json-lines` for active diagnostics where
   streaming component output is intentionally being consumed.
11. When native launcher behavior needs verification before icon work, run
   `build-app --development` and `test-app --development`. Treat the separate
   app, bundle identifier, DEV icon, and doctor evidence as provisional.
12. Only after lifecycle behavior passes, read `icon.md`, create layered artwork
   under `enmanner/icon/`, and use `create-icon --legacy-output` on the
   Xcode-equipped Mac to generate both committed icon formats. Configure them
   as `icon.modern` and `icon.legacy` in `enmanner/enmanner.json`, render all
   appearances with `preview-icon`, and inspect every rendition on the
   generated contact sheet for crop and balance. Open an individual rendition
   when the contact sheet leaves any ambiguity.
13. Run `finish-integration --runtime --json` to repeat lifecycle validation,
    build the finished app, verify two native launch/quit cycles, and collect
    doctor evidence in one result. Use `--open` when the verified app should
    remain running for Finder/Dock inspection. The equivalent individual
    `validate --runtime`, `build-app`, `test-app`, and `doctor` commands remain
    available for diagnosis.
14. Give the user a plain-language handoff after the finished app passes. Name
    the services the app starts and the prerequisites it only observes; explain
    that the app runs this local source checkout; identify which frontend and
    backend edits reload automatically and which require an app restart; point
    to **Window → Runtime Logs**; state what Quit stops; and explain that the
    whole project folder may move together on this Mac but the generated app is
    not a distributable copy for another machine. Report the task complete only
    after this handoff. A development app or development test receipt is never
    final evidence. Report local technical completion separately when durable
    files remain untracked; Enmanner never stages or commits them.

Ordinary web source edits do not require rebuilding the app.
At any point, `./.enmanner/scripts/doctor --next` prints a tailored Markdown
summary of current evidence, remaining actions, and only the focused references
that apply.
