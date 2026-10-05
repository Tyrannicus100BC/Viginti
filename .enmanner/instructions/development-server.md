# Runtime components

## MUST

- Start from a product-level service inventory. Inspect the target's repository
  root, parent, and siblings for cooperating frontends, APIs, workers, startup
  tasks, datastores, containers, and external prerequisites before choosing
  inline `application` configuration.
- Use a component graph whenever the user-facing workflow requires more than
  one project-owned process, startup task, or observed prerequisite. Choosing a
  frontend as the application endpoint does not exclude its dependencies from
  the graph.
- Classify by intended lifecycle ownership, not repository location. Use a
  `service` when opening the app should start the process; use a `prerequisite`
  only for separately administered infrastructure that should remain running
  independently. A required HTTP API is usually a service, even when its code
  lives in a sibling repository.
- Put each executable and argument in a JSON command array. Do not rely on shell
  parsing.
- Treat requested startup commands as intent. Verify every executable,
  argument, working directory, and build target against current project source.
- Keep every component working directory and relative executable inside the
  project.
- Use `${self.endpoints.<name>.port}` when a service must bind an allocated
  endpoint.
- Bind the listener to the exact host and address family declared by its
  endpoint, normally IPv4 `127.0.0.1`. IPv6 `::1` is also loopback, but it is
  not interchangeable with `127.0.0.1`. Never listen on all interfaces by
  default.
- Keep managed services in the foreground. Do not daemonize, launch through
  Terminal, or leave unsupervised descendants.
- Declare `dependsOn` for startup ordering and for every cross-component
  endpoint reference.
- Use `service` for long-running owned processes, `task` for one-shot startup
  commands, and `prerequisite` for infrastructure Enmanner observes but does
  not own.
- Give every service a readiness probe. Use `type: "process"` with a short
  `minimumUptimeSeconds` for a worker that has no meaningful network endpoint.
- When a startup task must temporarily run a server, declare its endpoints and
  a `completion` probe. Do not write a supervisor script solely to start, poll,
  and kill that process. Give expensive preparation a finite timeout and emit
  useful progress on stdout or stderr; JSON Lines validation streams it with
  the task's component label.
- Return a successful HTTP readiness response only when the component can
  provide the capability its dependents need.
- Treat `bodyContains` as a raw HTTP-response assertion; do not use text that
  exists only after client-side JavaScript renders.
## SHOULD

- Use commands already present in the project's dependency system. Do not
  unwrap package-manager commands in ways that skip lifecycle hooks.
- Give the application endpoint a preferred port so
  origin-scoped state stays stable when possible.
- Before starting a stateful application, confirm that a separately
  terminal-started copy is not already using the same project data.
- Exit cleanly after `SIGTERM` and close database and file handles.
- Make repeated start and stop cycles safe.
- Use longer finite probe timeouts for genuinely expensive first-run work;
  timeouts may be as long as 86400 seconds.

Enmanner allocates named endpoints, expands only documented endpoint and project
references, traverses the dependency graph, captures labelled output, and owns
each managed service's process group until the native app quits.

## Replacing a supervisor script

A project may begin with a convenient shell script that owns several servers:

```sh
#!/bin/sh
trap 'kill 0' EXIT INT TERM
API_PORT=8123 uv run uvicorn app.main:app --host 127.0.0.1 --port 8123 &
VITE_PORT=5173 npm run dev -- --host 127.0.0.1 --port 5173 &
uv run python worker.py &
wait
```

Do not wrap that script. Preserve its intent as independently supervised
components, replacing hard-coded coordination with endpoint references:

```json
{
  "components": {
    "api": {
      "command": ["uv", "run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "${self.endpoints.http.port}"],
      "endpoints": {"http": {"protocol": "http", "port": {"preferred": 8123}}},
      "readiness": {"type": "http", "endpoint": "http", "path": "/health"}
    },
    "worker": {
      "command": ["uv", "run", "python", "worker.py"],
      "readiness": {"type": "process", "minimumUptimeSeconds": 2}
    },
    "web": {
      "dependsOn": ["api"],
      "command": ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "${self.endpoints.http.port}", "--strictPort"],
      "environment": {"API_PORT": "${components.api.endpoints.http.port}"},
      "endpoints": {"http": {"protocol": "http", "port": {"preferred": 5173}}},
      "readiness": {"type": "http", "endpoint": "http", "path": "/"}
    }
  },
  "application": {"component": "web", "endpoint": "http"}
}
```

Keep the original script for direct development if it remains useful. The
manifest replaces only its backgrounding, signal traps, startup ordering, and
fixed-port coordination when the native app owns the session.

Runtime validation checks all launched process trees, the application endpoint,
every Enmanner-owned port, tracked descendants, non-loopback listeners, and the
Git-status delta after shutdown. Fixed prerequisite ports are observed and are
not expected to close.
