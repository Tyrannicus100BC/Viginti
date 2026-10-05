import Darwin
import Foundation

private actor ProcessExitWaiter {
    private var exit: ProcessSupervisor.Exit?
    private var continuation: CheckedContinuation<ProcessSupervisor.Exit, Never>?

    func record(_ exit: ProcessSupervisor.Exit) {
        if let continuation {
            self.continuation = nil
            continuation.resume(returning: exit)
        } else {
            self.exit = exit
        }
    }

    func wait() async -> ProcessSupervisor.Exit {
        if let exit { return exit }
        return await withCheckedContinuation { continuation = $0 }
    }
}

public final class RuntimeSupervisor: @unchecked Sendable {
    public struct ComponentExit: Equatable, Sendable {
        public let component: String
        public let status: Int32
        public let expected: Bool
        public let command: [String]
        public let workingDirectory: String
        public let recentLogs: [String]
    }

    public struct Launch: Equatable, Sendable {
        public let applicationURL: URL
        public let applicationPort: UInt16
        public let selectedPorts: [RuntimePlan.EndpointKey: UInt16]
        public let ownedPorts: [RuntimePlan.EndpointKey: UInt16]
        public let componentProcessIdentifiers: [String: Int32]
    }

    public struct Recovery: Equatable, Sendable {
        public let launch: Launch
        public let affectedComponents: Set<String>
    }

    private let queue = DispatchQueue(label: "local.enmanner.runtime-supervisor")
    private let logBuffer: LogBuffer
    private let environmentOverrides: [String: String]
    private var supervisors: [String: ProcessSupervisor] = [:]
    private var currentPlan: RuntimePlan?
    private var retainedPorts: [RuntimePlan.EndpointKey: UInt16] = [:]
    private var succeededTasks: Set<String> = []
    private var starting = false
    private var stopping = false
    private var launchComplete = false
    private var startupFailure: ComponentExit?

    public var onExit: (@Sendable (ComponentExit) -> Void)?
    public var onEvent: (@Sendable (RuntimeEvent) -> Void)?

    public init(logBuffer: LogBuffer, environmentOverrides: [String: String] = [:]) {
        self.logBuffer = logBuffer
        self.environmentOverrides = environmentOverrides
    }

    public var isRunning: Bool {
        queue.sync { supervisors.values.contains(where: \.isRunning) }
    }

    public var processIdentifiers: [String: Int32] {
        queue.sync {
            supervisors.compactMapValues(\.processIdentifier)
        }
    }

    public var plan: RuntimePlan? {
        queue.sync { currentPlan }
    }

    public func recoveryComponents(
        for failedComponents: Set<String>
    ) -> Set<String> {
        queue.sync {
            guard let graph = currentPlan?.graph else {
                return failedComponents
            }
            return dependentClosure(of: failedComponents, graph: graph)
        }
    }

    public func start(
        manifest: EnmannerManifest,
        projectURL: URL,
        reallocateEndpoints: Bool = false
    ) async throws -> Launch {
        let ports = try queue.sync { () throws -> [RuntimePlan.EndpointKey: UInt16] in
            guard !starting &&
                    !supervisors.values.contains(where: \.isRunning) else {
                throw EnmannerError.processAlreadyRunning
            }
            starting = true
            if reallocateEndpoints {
                retainedPorts = [:]
            }
            return retainedPorts
        }
        defer {
            queue.sync { starting = false }
        }

        let plan = try RuntimePlan.make(
            manifest: manifest,
            retainedPorts: ports
        )
        queue.sync {
            currentPlan = plan
            retainedPorts = plan.ports
            stopping = false
            launchComplete = false
            startupFailure = nil
        }
        logBuffer.append(
            "Resolved \(plan.graph.components.count) runtime component" +
                (plan.graph.components.count == 1 ? "." : "s.")
        )

        do {
            for name in plan.graph.startupOrder {
                try Task.checkCancellation()
                guard let component = plan.graph.components[name] else { continue }
                switch component.kind {
                case .prerequisite:
                    try await checkPrerequisite(
                        name: name,
                        component: component,
                        plan: plan,
                        projectURL: projectURL
                    )
                case .task:
                    if queue.sync(execute: { succeededTasks.contains(name) }) {
                        logBuffer.append(
                            "Startup task already succeeded in this launcher session.",
                            component: name
                        )
                    } else {
                        try await runTask(
                            name: name,
                            component: component,
                            plan: plan,
                            projectURL: projectURL
                        )
                        queue.sync {
                            _ = succeededTasks.insert(name)
                        }
                    }
                case .service:
                    try await startService(
                        name: name,
                        component: component,
                        plan: plan,
                        projectURL: projectURL
                    )
                }
            }

            let failure = queue.sync { () -> ComponentExit? in
                if let startupFailure {
                    return startupFailure
                }
                if let stopped = supervisors.first(
                    where: { !$0.value.isRunning }
                ) {
                    return ComponentExit(
                        component: stopped.key,
                        status: -1,
                        expected: false,
                        command: [],
                        workingDirectory: "",
                        recentLogs: logBuffer.recentEntries(
                            component: stopped.key,
                            componentOnly: true
                        )
                    )
                }
                launchComplete = true
                return nil
            }
            if let failure {
                throw runtimeFailure(
                    code: .componentExited,
                    phase: .startup,
                    component: failure.component,
                    message: "Component \(failure.component) exited during startup" +
                        (failure.status >= 0
                            ? " with status \(failure.status)."
                            : "."),
                    exitStatus: failure.status >= 0 ? failure.status : nil,
                    command: failure.command.isEmpty ? nil : failure.command,
                    workingDirectory: failure.workingDirectory.isEmpty
                        ? nil
                        : failure.workingDirectory
                )
            }
        } catch {
            stop()
            throw error
        }

        logBuffer.append(
            "Application runtime is ready at \(plan.applicationURL.absoluteString)."
        )
        emit(.init(
            kind: .runtimeReady,
            message: plan.applicationURL.absoluteString
        ))
        return Launch(
            applicationURL: plan.applicationURL,
            applicationPort: plan.applicationPort,
            selectedPorts: plan.ports,
            ownedPorts: plan.ownedPorts,
            componentProcessIdentifiers: processIdentifiers
        )
    }

    public func stop(gracePeriod: TimeInterval = 2) {
        let values: [(String, ProcessSupervisor)] = queue.sync {
            stopping = true
            let order = currentPlan?.graph.startupOrder.reversed() ?? []
            return order.compactMap { name in
                supervisors[name].map { (name, $0) }
            }
        }
        for (name, supervisor) in values {
            emit(.init(kind: .componentStopping, component: name))
            supervisor.stop(gracePeriod: gracePeriod)
        }
        queue.sync {
            supervisors.removeAll()
            stopping = false
            launchComplete = false
            startupFailure = nil
        }
    }

    public func recover(
        components failedComponents: Set<String>,
        projectURL: URL
    ) async throws -> Recovery {
        let plan = try queue.sync { () throws -> RuntimePlan in
            guard !starting, !stopping, launchComplete,
                  let currentPlan else {
                throw EnmannerError.processAlreadyRunning
            }
            let unknown = failedComponents.filter {
                currentPlan.graph.components[$0] == nil
            }
            guard unknown.isEmpty else {
                throw EnmannerError.invalidManifest([
                    "Cannot recover unknown component" +
                        (unknown.count == 1 ? " " : "s ") +
                        unknown.sorted().joined(separator: ", ") + "."
                ])
            }
            starting = true
            launchComplete = false
            startupFailure = nil
            return currentPlan
        }
        defer {
            queue.sync { starting = false }
        }

        let affected = dependentClosure(
            of: failedComponents,
            graph: plan.graph
        )
        emit(.init(
            kind: .recoveryStarting,
            message: affected.sorted().joined(separator: ",")
        ))
        logBuffer.append(
            "Recovering component set: " +
                affected.sorted().joined(separator: ", ") + "."
        )

        do {
            stopComponents(
                affected,
                plan: plan,
                gracePeriod: 2
            )
            for name in plan.graph.startupOrder where affected.contains(name) {
                try Task.checkCancellation()
                guard let component = plan.graph.components[name] else { continue }
                switch component.kind {
                case .prerequisite:
                    try await checkPrerequisite(
                        name: name,
                        component: component,
                        plan: plan,
                        projectURL: projectURL
                    )
                case .task:
                    if queue.sync(execute: { succeededTasks.contains(name) }) {
                        logBuffer.append(
                            "Startup task remains satisfied for this launcher session.",
                            component: name
                        )
                    } else {
                        try await runTask(
                            name: name,
                            component: component,
                            plan: plan,
                            projectURL: projectURL
                        )
                        queue.sync {
                            _ = succeededTasks.insert(name)
                        }
                    }
                case .service:
                    try await startService(
                        name: name,
                        component: component,
                        plan: plan,
                        projectURL: projectURL
                    )
                }
            }

            let failure = queue.sync { () -> ComponentExit? in
                if let startupFailure {
                    return startupFailure
                }
                for name in affected {
                    guard plan.graph.components[name]?.kind == .service else {
                        continue
                    }
                    if supervisors[name]?.isRunning != true {
                        return ComponentExit(
                            component: name,
                            status: -1,
                            expected: false,
                            command: [],
                            workingDirectory: "",
                            recentLogs: logBuffer.recentEntries(
                                component: name,
                                componentOnly: true
                            )
                        )
                    }
                }
                launchComplete = true
                return nil
            }
            if let failure {
                throw runtimeFailure(
                    code: .componentExited,
                    phase: .startup,
                    component: failure.component,
                    message: "Component \(failure.component) exited during recovery" +
                        (failure.status >= 0
                            ? " with status \(failure.status)."
                            : "."),
                    exitStatus: failure.status >= 0 ? failure.status : nil,
                    command: failure.command.isEmpty ? nil : failure.command,
                    workingDirectory: failure.workingDirectory.isEmpty
                        ? nil
                        : failure.workingDirectory
                )
            }
        } catch {
            stop()
            throw error
        }

        emit(.init(
            kind: .recoveryCompleted,
            message: affected.sorted().joined(separator: ",")
        ))
        logBuffer.append("Component recovery completed.")
        return Recovery(
            launch: Launch(
                applicationURL: plan.applicationURL,
                applicationPort: plan.applicationPort,
                selectedPorts: plan.ports,
                ownedPorts: plan.ownedPorts,
                componentProcessIdentifiers: processIdentifiers
            ),
            affectedComponents: affected
        )
    }

    private func checkPrerequisite(
        name: String,
        component: EnmannerManifest.Component,
        plan: RuntimePlan,
        projectURL: URL
    ) async throws {
        guard let check = component.check else {
            throw EnmannerError.invalidManifest([
                "component \(name) has no prerequisite check."
            ])
        }
        logBuffer.append("Checking prerequisite.", component: name)
        emit(.init(kind: .probeWaiting, component: name, message: "check"))
        let ready: Bool
        do {
            ready = try await ProbeRunner.wait(
                probe: check,
                componentName: name,
                component: component,
                plan: plan,
                projectURL: projectURL
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as ProbeConfigurationError {
            throw runtimeFailure(
                code: .addressFamilyMismatch,
                phase: .prerequisite,
                component: name,
                message: error.localizedDescription
            )
        } catch {
            throw runtimeFailure(
                code: .probeFailed,
                phase: .prerequisite,
                component: name,
                message: "Prerequisite \(name) check failed: \(error.localizedDescription)"
            )
        }
        guard ready else {
            let detail = component.failureMessage ??
                "Prerequisite \(name) did not become available."
            throw runtimeFailure(
                code: .prerequisiteUnavailable,
                phase: .prerequisite,
                component: name,
                message: detail,
                timeoutSeconds: check.timeoutSeconds
            )
        }
        logBuffer.append("Prerequisite is available.", component: name)
        emit(.init(kind: .probePassed, component: name, message: "check"))
    }

    private func runTask(
        name: String,
        component: EnmannerManifest.Component,
        plan: RuntimePlan,
        projectURL: URL
    ) async throws {
        let configuration: ProcessConfiguration
        do {
            configuration = try ProcessConfigurationBuilder.make(
                componentName: name,
                component: component,
                plan: plan,
                projectURL: projectURL
            )
        } catch {
            throw runtimeFailure(
                code: .componentLaunchFailed,
                phase: .startup,
                component: name,
                message: "Could not configure task \(name): \(error.localizedDescription)",
                command: component.command,
                workingDirectory: component.workingDirectory
            )
        }
        let diagnosticCommand = [configuration.executableURL.path] +
            configuration.arguments
        let diagnosticWorkingDirectory = configuration.workingDirectoryURL.path
        let supervisor = ProcessSupervisor(
            logBuffer: logBuffer,
            componentName: name
        )
        let waiter = ProcessExitWaiter()
        supervisor.onExit = { exit in
            self.emit(.init(
                kind: .componentExited,
                component: name,
                status: exit.status,
                expected: exit.expected
            ))
            Task { await waiter.record(exit) }
        }
        observeOutput(from: supervisor, component: name)
        queue.sync { supervisors[name] = supervisor }
        logBuffer.append("Running startup task.", component: name)
        emit(.init(kind: .componentStarting, component: name))
        do {
            try supervisor.start(configuration)
        } catch {
            queue.sync { supervisors[name] = nil }
            throw runtimeFailure(
                code: .componentLaunchFailed,
                phase: .startup,
                component: name,
                message: "Could not start task \(name): \(error.localizedDescription)",
                command: diagnosticCommand,
                workingDirectory: diagnosticWorkingDirectory
            )
        }
        emit(.init(kind: .componentStarted, component: name))

        let exit: ProcessSupervisor.Exit
        if let completion = component.completion {
            logBuffer.append("Waiting for task completion.", component: name)
            emit(.init(
                kind: .probeWaiting,
                component: name,
                message: "completion"
            ))
            let completed: Bool
            do {
                completed = try await ProbeRunner.wait(
                    probe: completion,
                    componentName: name,
                    component: component,
                    plan: plan,
                    projectURL: projectURL,
                    processIsRunning: { supervisor.isRunning }
                )
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                throw runtimeFailure(
                    code: .probeFailed,
                    phase: .completion,
                    component: name,
                    message: "Task \(name) completion probe failed: \(error.localizedDescription)",
                    command: diagnosticCommand,
                    workingDirectory: diagnosticWorkingDirectory
                )
            }
            if completed {
                emit(.init(
                    kind: .probePassed,
                    component: name,
                    message: "completion"
                ))
                emit(.init(kind: .componentStopping, component: name))
                supervisor.stop()
                exit = await waiter.wait()
            } else {
                let exitedBeforeCompletion = !supervisor.isRunning
                if !exitedBeforeCompletion {
                    emit(.init(kind: .componentStopping, component: name))
                    supervisor.stop()
                }
                exit = await waiter.wait()
                queue.sync { supervisors[name] = nil }
                if exitedBeforeCompletion {
                    throw runtimeFailure(
                        code: .taskExited,
                        phase: .completion,
                        component: name,
                        message: "Task \(name) exited with status \(exit.status) before its completion probe passed.",
                        exitStatus: exit.status,
                        command: diagnosticCommand,
                        workingDirectory: diagnosticWorkingDirectory
                    )
                }
                throw runtimeFailure(
                    code: .probeTimedOut,
                    phase: .completion,
                    component: name,
                    message: "Task \(name) did not complete within \(Int(completion.timeoutSeconds)) seconds.",
                    timeoutSeconds: completion.timeoutSeconds,
                    command: diagnosticCommand,
                    workingDirectory: diagnosticWorkingDirectory
                )
            }
        } else {
            exit = await waiter.wait()
        }
        let leftDescendants = supervisor.hasLiveProcessGroup
        if leftDescendants {
            supervisor.stop(gracePeriod: 0.2)
        }
        queue.sync { supervisors[name] = nil }
        guard !leftDescendants else {
            throw runtimeFailure(
                code: .taskLeftProcessesRunning,
                phase: .shutdown,
                component: name,
                message: "Task \(name) left processes running after its command exited.",
                command: diagnosticCommand,
                workingDirectory: diagnosticWorkingDirectory
            )
        }
        guard component.completion != nil || exit.status == 0 else {
            throw runtimeFailure(
                code: .taskExited,
                phase: .startup,
                component: name,
                message: "Task \(name) exited with status \(exit.status).",
                exitStatus: exit.status,
                command: diagnosticCommand,
                workingDirectory: diagnosticWorkingDirectory
            )
        }
        logBuffer.append("Startup task succeeded.", component: name)
        emit(.init(kind: .taskCompleted, component: name))
    }

    private func startService(
        name: String,
        component: EnmannerManifest.Component,
        plan: RuntimePlan,
        projectURL: URL
    ) async throws {
        let configuration: ProcessConfiguration
        do {
            configuration = try ProcessConfigurationBuilder.make(
                componentName: name,
                component: component,
                plan: plan,
                projectURL: projectURL,
                baseEnvironment: ProcessInfo.processInfo.environment.merging(environmentOverrides) { _, value in value }
            )
        } catch {
            throw runtimeFailure(
                code: .componentLaunchFailed,
                phase: .startup,
                component: name,
                message: "Could not configure component \(name): \(error.localizedDescription)",
                command: component.command,
                workingDirectory: component.workingDirectory
            )
        }
        let diagnosticCommand = [configuration.executableURL.path] +
            configuration.arguments
        let diagnosticWorkingDirectory = configuration.workingDirectoryURL.path
        let supervisor = ProcessSupervisor(
            logBuffer: logBuffer,
            componentName: name
        )
        supervisor.onExit = { [weak self, weak supervisor] exit in
            guard let self else { return }
            let componentExit = ComponentExit(
                component: name,
                status: exit.status,
                expected: exit.expected,
                command: [configuration.executableURL.path] +
                    configuration.arguments,
                workingDirectory: configuration.workingDirectoryURL.path,
                recentLogs: self.logBuffer.recentEntries(
                    component: name,
                    componentOnly: true
                )
            )
            let shouldReport = self.queue.sync {
                guard !self.stopping, !exit.expected else { return false }
                if self.launchComplete {
                    return true
                }
                self.startupFailure = componentExit
                return false
            }
            self.emit(.init(
                kind: .componentExited,
                component: name,
                status: exit.status,
                expected: exit.expected
            ))
            if shouldReport {
                self.onExit?(componentExit)
            }
            if supervisor?.isRunning == false &&
                supervisor?.hasLiveProcessGroup == false {
                self.queue.async {
                    if self.supervisors[name] === supervisor {
                        self.supervisors[name] = nil
                    }
                }
            }
        }
        observeOutput(from: supervisor, component: name)
        queue.sync { supervisors[name] = supervisor }
        emit(.init(kind: .componentStarting, component: name))
        do {
            try supervisor.start(configuration)
        } catch {
            queue.sync { supervisors[name] = nil }
            throw runtimeFailure(
                code: .componentLaunchFailed,
                phase: .startup,
                component: name,
                message: "Could not start component \(name): \(error.localizedDescription)",
                command: diagnosticCommand,
                workingDirectory: diagnosticWorkingDirectory
            )
        }
        emit(.init(kind: .componentStarted, component: name))

        guard let readiness = component.readiness else {
            logBuffer.append(
                "Service is running; no readiness probe is configured.",
                component: name
            )
            return
        }
        logBuffer.append("Waiting for readiness.", component: name)
        emit(.init(
            kind: .probeWaiting,
            component: name,
            message: "readiness"
        ))
        let ready: Bool
        do {
            ready = try await ProbeRunner.wait(
                probe: readiness,
                componentName: name,
                component: component,
                plan: plan,
                projectURL: projectURL,
                processIsRunning: { supervisor.isRunning }
            )
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as ProbeConfigurationError {
            throw runtimeFailure(
                code: .addressFamilyMismatch,
                phase: .readiness,
                component: name,
                message: error.localizedDescription,
                command: diagnosticCommand,
                workingDirectory: diagnosticWorkingDirectory
            )
        } catch {
            throw runtimeFailure(
                code: .probeFailed,
                phase: .readiness,
                component: name,
                message: "Component \(name) readiness probe failed: \(error.localizedDescription)",
                command: diagnosticCommand,
                workingDirectory: diagnosticWorkingDirectory
            )
        }
        guard ready else {
            if supervisor.isRunning {
                throw runtimeFailure(
                    code: .probeTimedOut,
                    phase: .readiness,
                    component: name,
                        message: "Component \(name) did not become ready within " +
                            "\(Int(readiness.timeoutSeconds)) seconds.",
                        timeoutSeconds: readiness.timeoutSeconds,
                        command: diagnosticCommand,
                        workingDirectory: diagnosticWorkingDirectory
                )
            }
            let exit = queue.sync {
                startupFailure?.component == name ? startupFailure : nil
            }
            throw runtimeFailure(
                code: .componentExited,
                phase: .readiness,
                component: name,
                message: "Component \(name) exited before becoming ready" +
                    (exit.map { " with status \($0.status)." } ?? "."),
                exitStatus: exit?.status,
                command: diagnosticCommand,
                workingDirectory: diagnosticWorkingDirectory
            )
        }
        logBuffer.append("Service is ready.", component: name)
        emit(.init(
            kind: .probePassed,
            component: name,
            message: "readiness"
        ))
    }

    private func observeOutput(
        from supervisor: ProcessSupervisor,
        component: String
    ) {
        supervisor.onOutput = { [weak self] stream, message in
            self?.emit(.init(
                kind: .componentOutput,
                component: component,
                stream: stream,
                message: message
            ))
        }
    }

    private func dependentClosure(
        of roots: Set<String>,
        graph: RuntimeGraph
    ) -> Set<String> {
        var affected = roots
        var changed = true
        while changed {
            changed = false
            for (name, component) in graph.components
                where !affected.contains(name) &&
                    !affected.isDisjoint(with: component.dependsOn) {
                affected.insert(name)
                changed = true
            }
        }
        return affected
    }

    private func stopComponents(
        _ names: Set<String>,
        plan: RuntimePlan,
        gracePeriod: TimeInterval
    ) {
        let values: [(String, ProcessSupervisor)] = queue.sync {
            plan.graph.startupOrder.reversed().compactMap { name in
                guard names.contains(name), let supervisor = supervisors[name] else {
                    return nil
                }
                return (name, supervisor)
            }
        }
        for (name, supervisor) in values {
            emit(.init(kind: .componentStopping, component: name))
            supervisor.stop(gracePeriod: gracePeriod)
        }
        queue.sync {
            for name in names {
                supervisors[name] = nil
            }
        }
    }

    private func emit(_ event: RuntimeEvent) {
        onEvent?(event)
    }

    private func runtimeFailure(
        code: RuntimeFailure.Code,
        phase: RuntimeFailure.Phase,
        component: String?,
        message: String,
        exitStatus: Int32? = nil,
        timeoutSeconds: Double? = nil,
        command: [String]? = nil,
        workingDirectory: String? = nil
    ) -> EnmannerError {
        .runtimeFailure(.init(
            code: code,
            phase: phase,
            component: component,
            message: message,
            exitStatus: exitStatus,
            timeoutSeconds: timeoutSeconds,
            command: command,
            workingDirectory: workingDirectory,
            recentLogs: logBuffer.recentEntries(
                component: component,
                componentOnly: component != nil
            )
        ))
    }
}

private enum ProbeRunner {
    static func wait(
        probe: EnmannerManifest.Probe,
        componentName: String,
        component: EnmannerManifest.Component,
        plan: RuntimePlan,
        projectURL: URL,
        processIsRunning: (@Sendable () -> Bool)? = nil
    ) async throws -> Bool {
        if probe.type == .process {
            guard let processIsRunning else { return false }
            let minimumUptime = probe.minimumUptimeSeconds ?? 2
            let started = Date()
            let deadline = started.addingTimeInterval(probe.timeoutSeconds)
            while !Task.isCancelled && Date() < deadline {
                guard processIsRunning() else { return false }
                if Date().timeIntervalSince(started) >= minimumUptime {
                    return true
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
            try Task.checkCancellation()
            return false
        }
        let deadline = Date().addingTimeInterval(probe.timeoutSeconds)
        while !Task.isCancelled && Date() < deadline {
            if let processIsRunning, !processIsRunning() {
                return false
            }
            if try await check(
                probe: probe,
                componentName: componentName,
                component: component,
                plan: plan,
                projectURL: projectURL
            ) {
                return true
            }
            if let mismatch = await addressFamilyMismatch(
                probe: probe,
                componentName: componentName,
                component: component,
                plan: plan
            ) {
                throw mismatch
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
        try Task.checkCancellation()
        return false
    }

    private static func check(
        probe: EnmannerManifest.Probe,
        componentName: String,
        component: EnmannerManifest.Component,
        plan: RuntimePlan,
        projectURL: URL
    ) async throws -> Bool {
        switch probe.type {
        case .http:
            guard let endpointName = probe.endpoint,
                  let endpoint = plan.endpoints[
                    .init(component: componentName, endpoint: endpointName)
                  ],
                  let url = endpoint.url(path: probe.path) else {
                return false
            }
            return await ReadinessChecker.checkHTTP(
                url: url,
                acceptableStatusCodes: probe.acceptableStatusCodes,
                contentTypeContains: probe.contentTypeContains,
                bodyContains: probe.bodyContains
            )
        case .tcp:
            guard let endpointName = probe.endpoint,
                  let endpoint = plan.endpoints[
                    .init(component: componentName, endpoint: endpointName)
                  ] else {
                return false
            }
            return TCPProbe.canConnect(host: endpoint.host, port: endpoint.port)
        case .command:
            guard let command = probe.command else { return false }
            var probeComponent = component
            probeComponent = .init(
                kind: .task,
                command: command,
                workingDirectory: component.workingDirectory,
                environment: component.environment
            )
            let configuration = try ProcessConfigurationBuilder.make(
                componentName: componentName,
                component: probeComponent,
                plan: plan,
                projectURL: projectURL
            )
            let result = try await OneShotProbe.run(
                configuration: configuration,
                timeout: min(probe.timeoutSeconds, 10)
            )
            guard result.status == 0 else { return false }
            let stdout = result.stdout.trimmingCharacters(
                in: .whitespacesAndNewlines
            )
            if let expected = probe.success?.stdoutEquals {
                return stdout == expected
            }
            if let contained = probe.success?.stdoutContains {
                return stdout.contains(contained)
            }
            return true
        case .process:
            return false
        }
    }

    private static func addressFamilyMismatch(
        probe: EnmannerManifest.Probe,
        componentName: String,
        component: EnmannerManifest.Component,
        plan: RuntimePlan
    ) async -> ProbeConfigurationError? {
        guard let endpointName = probe.endpoint,
              let declared = plan.endpoints[
                .init(component: componentName, endpoint: endpointName)
              ] else {
            return nil
        }
        let alternateHost: String
        switch declared.host {
        case "127.0.0.1": alternateHost = "::1"
        case "::1": alternateHost = "127.0.0.1"
        default: return nil
        }

        let answers: Bool
        switch probe.type {
        case .http:
            answers = TCPProbe.canConnect(
                host: alternateHost,
                port: declared.port
            )
        case .tcp:
            answers = TCPProbe.canConnect(
                host: alternateHost,
                port: declared.port
            )
        case .command, .process:
            return nil
        }
        guard answers else { return nil }
        return .addressFamilyMismatch(
            component: componentName,
            declaredHost: declared.host,
            listeningHost: alternateHost,
            port: declared.port
        )
    }
}

private enum ProbeConfigurationError: LocalizedError {
    case addressFamilyMismatch(
        component: String,
        declaredHost: String,
        listeningHost: String,
        port: UInt16
    )

    var errorDescription: String? {
        switch self {
        case .addressFamilyMismatch(
            let component,
            let declaredHost,
            let listeningHost,
            let port
        ):
            return "Component \(component) listens on \(listeningHost):\(port), but its endpoint declares \(declaredHost). Bind the service to \(declaredHost) or change the endpoint host so the address family matches."
        }
    }
}

private enum TCPProbe {
    static func canConnect(host: String, port: UInt16) -> Bool {
        var hints = addrinfo(
            ai_flags: AI_NUMERICSERV,
            ai_family: AF_UNSPEC,
            ai_socktype: SOCK_STREAM,
            ai_protocol: IPPROTO_TCP,
            ai_addrlen: 0,
            ai_canonname: nil,
            ai_addr: nil,
            ai_next: nil
        )
        var result: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo(host, String(port), &hints, &result) == 0,
              let first = result else {
            return false
        }
        defer { freeaddrinfo(first) }

        var cursor: UnsafeMutablePointer<addrinfo>? = first
        while let info = cursor?.pointee {
            let descriptor = socket(
                info.ai_family,
                info.ai_socktype,
                info.ai_protocol
            )
            if descriptor >= 0 {
                let connected = Darwin.connect(
                    descriptor,
                    info.ai_addr,
                    info.ai_addrlen
                ) == 0
                close(descriptor)
                if connected { return true }
            }
            cursor = info.ai_next
        }
        return false
    }
}

private enum OneShotProbe {
    struct Result: Sendable {
        let status: Int32
        let stdout: String
    }

    static func run(
        configuration: ProcessConfiguration,
        timeout: TimeInterval
    ) async throws -> Result {
        let process = Process()
        let outputPipe = Pipe()
        process.executableURL = configuration.executableURL
        process.arguments = configuration.arguments
        process.currentDirectoryURL = configuration.workingDirectoryURL
        process.environment = configuration.environment
        process.standardOutput = outputPipe
        process.standardError = FileHandle.nullDevice

        let output = ProbeOutput()
        let outputTask = Task.detached {
            while true {
                let data = outputPipe.fileHandleForReading.availableData
                guard !data.isEmpty else { return }
                output.append(data)
            }
        }
        do {
            try process.run()
        } catch {
            outputPipe.fileHandleForWriting.closeFile()
            await outputTask.value
            throw error
        }
        outputPipe.fileHandleForWriting.closeFile()
        Darwin.setpgid(process.processIdentifier, process.processIdentifier)

        let deadline = Date().addingTimeInterval(timeout)
        while process.isRunning && Date() < deadline && !Task.isCancelled {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        if process.isRunning {
            Darwin.kill(-process.processIdentifier, SIGTERM)
            try? await Task.sleep(nanoseconds: 100_000_000)
            if process.isRunning {
                Darwin.kill(-process.processIdentifier, SIGKILL)
            }
        }
        let exitDeadline = Date().addingTimeInterval(2)
        while process.isRunning && Date() < exitDeadline {
            try? await Task.sleep(nanoseconds: 50_000_000)
        }
        guard !process.isRunning else {
            outputPipe.fileHandleForReading.closeFile()
            outputTask.cancel()
            throw EnmannerError.processLaunchFailed(
                "Command probe process did not exit after SIGKILL."
            )
        }
        await outputTask.value
        return Result(
            status: process.terminationStatus,
            stdout: output.string
        )
    }
}

private final class ProbeOutput: @unchecked Sendable {
    private static let maximumBytes = 65_536
    private let lock = NSLock()
    private var data = Data()

    func append(_ newData: Data) {
        lock.lock()
        defer { lock.unlock() }
        let remaining = Self.maximumBytes - data.count
        guard remaining > 0 else { return }
        data.append(newData.prefix(remaining))
    }

    var string: String {
        lock.lock()
        defer { lock.unlock() }
        return String(data: data, encoding: .utf8) ?? ""
    }
}
