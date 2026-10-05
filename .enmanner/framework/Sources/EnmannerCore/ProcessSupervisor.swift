import Darwin
import Foundation

public struct ProcessConfiguration: Equatable, Sendable {
    public let executableURL: URL
    public let arguments: [String]
    public let workingDirectoryURL: URL
    public let environment: [String: String]

    public init(
        executableURL: URL,
        arguments: [String],
        workingDirectoryURL: URL,
        environment: [String: String]
    ) {
        self.executableURL = executableURL
        self.arguments = arguments
        self.workingDirectoryURL = workingDirectoryURL
        self.environment = environment
    }
}

public enum ProcessConfigurationBuilder {
    public static func make(
        componentName: String,
        component: EnmannerManifest.Component,
        plan: RuntimePlan,
        projectURL: URL,
        baseEnvironment: [String: String] = ProcessInfo.processInfo.environment
    ) throws -> ProcessConfiguration {
        let expandedCommand = try (component.command ?? []).map {
            try ManifestInterpolator.expand(
                $0,
                componentName: componentName,
                plan: plan,
                projectURL: projectURL
            )
        }
        guard let executable = expandedCommand.first else {
            throw EnmannerError.invalidManifest([
                "component \(componentName) command is empty."
            ])
        }
        let workingDirectoryURL = try ProjectPaths.resolve(
            component.workingDirectory,
            inside: projectURL
        )
        let configuredEnvironment = try ManifestInterpolator.expand(
            component.environment,
            componentName: componentName,
            plan: plan,
            projectURL: projectURL
        )
        var environment = baseEnvironment
        environment.merge(configuredEnvironment) { _, configured in configured }
        environment = environmentForGUIApplication(
            environment,
            additionalSearchPaths: plan.executableSearchPaths
        )
        let executableURL = try resolveExecutable(
            executable,
            environment: environment,
            workingDirectoryURL: workingDirectoryURL,
            projectURL: projectURL
        )
        environment["ENMANNER_COMPONENT"] = componentName
        environment["ENMANNER_PROJECT_DIR"] = projectURL.path

        return ProcessConfiguration(
            executableURL: executableURL,
            arguments: Array(expandedCommand.dropFirst()),
            workingDirectoryURL: workingDirectoryURL,
            environment: environment
        )
    }

    public static func environmentForGUIApplication(
        _ environment: [String: String],
        additionalSearchPaths: [String] = []
    ) -> [String: String] {
        var result = environment
        let homeDirectory = environment["HOME"].flatMap {
            $0.isEmpty ? nil : $0
        } ?? NSHomeDirectory()
        func expandingHome(_ value: String) -> String {
            if value == "~" {
                return homeDirectory
            }
            if value.hasPrefix("~/") {
                return homeDirectory + String(value.dropFirst())
            }
            return value
        }
        let configured = additionalSearchPaths.map(expandingHome)
        let inherited = environment["PATH", default: ""]
            .split(separator: ":")
            .map { expandingHome(String($0)) }
        let commonRuntimeDirectories = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin"
        ]
        var directories: [String] = []
        for directory in configured + inherited + commonRuntimeDirectories
            where !directory.isEmpty && !directories.contains(directory) {
            directories.append(directory)
        }
        result["PATH"] = directories.joined(separator: ":")
        return result
    }

    public static func resolveExecutable(
        _ executable: String,
        environment: [String: String],
        workingDirectoryURL: URL? = nil,
        projectURL: URL? = nil
    ) throws -> URL {
        let fileManager = FileManager.default
        if executable.contains("/") {
            let url: URL
            if executable.hasPrefix("/") {
                url = URL(fileURLWithPath: executable).standardizedFileURL
            } else {
                guard let workingDirectoryURL, let projectURL else {
                    throw EnmannerError.executableNotFound(executable)
                }
                let candidate = workingDirectoryURL
                    .appendingPathComponent(executable)
                    .standardizedFileURL
                    .resolvingSymlinksInPath()
                let root = projectURL.standardizedFileURL.resolvingSymlinksInPath()
                let rootPath = root.path.hasSuffix("/") ? root.path : root.path + "/"
                guard candidate.path == root.path ||
                        candidate.path.hasPrefix(rootPath) else {
                    throw EnmannerError.invalidManifest([
                        "The configured executable must stay inside the project."
                    ])
                }
                url = candidate
            }
            guard fileManager.isExecutableFile(atPath: url.path) else {
                throw EnmannerError.executableNotFound(executable)
            }
            return url
        }

        let fallbackPath = "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        for directory in environment["PATH", default: fallbackPath].split(separator: ":") {
            let candidate = URL(fileURLWithPath: String(directory))
                .appendingPathComponent(executable)
            if fileManager.isExecutableFile(atPath: candidate.path) {
                return candidate
            }
        }
        throw EnmannerError.executableNotFound(executable)
    }
}

public final class ProcessSupervisor: @unchecked Sendable {
    public struct Exit: Equatable, Sendable {
        public let status: Int32
        public let expected: Bool
    }

    private let queue = DispatchQueue(label: "local.enmanner.process-supervisor")
    private var process: Process?
    private var processGroupIdentifier: Int32?
    private var expectedExitProcessIdentifiers: Set<Int32> = []
    private let logBuffer: LogBuffer
    private let componentName: String

    public var onExit: (@Sendable (Exit) -> Void)?
    public var onOutput: (@Sendable (LogBuffer.Stream, String) -> Void)?

    public init(logBuffer: LogBuffer, componentName: String = "application") {
        self.logBuffer = logBuffer
        self.componentName = componentName
    }

    public var isRunning: Bool {
        queue.sync { process?.isRunning == true }
    }

    public var processIdentifier: Int32? {
        queue.sync {
            guard let process, process.isRunning else { return nil }
            return process.processIdentifier
        }
    }

    public var hasLiveProcessGroup: Bool {
        queue.sync {
            processGroupIdentifier.map(Self.processGroupExists) ?? false
        }
    }

    public func start(_ configuration: ProcessConfiguration) throws {
        try queue.sync {
            guard process?.isRunning != true,
                  processGroupIdentifier.map(Self.processGroupExists) != true else {
                throw EnmannerError.processAlreadyRunning
            }

            let process = Process()
            let outputPipe = Pipe()
            let errorPipe = Pipe()
            process.executableURL = configuration.executableURL
            process.arguments = configuration.arguments
            process.currentDirectoryURL = configuration.workingDirectoryURL
            process.environment = configuration.environment
            process.standardOutput = outputPipe
            process.standardError = errorPipe

            attach(pipe: outputPipe, stream: .stdout)
            attach(pipe: errorPipe, stream: .stderr)
            process.terminationHandler = { [weak self] completed in
                guard let self else { return }
                let expected = self.queue.sync {
                    let pid = completed.processIdentifier
                    let expected =
                        self.expectedExitProcessIdentifiers.remove(pid) != nil
                    if self.process === completed {
                        self.process = nil
                    }
                    if !Self.processGroupExists(pid) &&
                        self.processGroupIdentifier == pid {
                        self.processGroupIdentifier = nil
                    }
                    return expected
                }
                self.logBuffer.append(
                    "Process exited with status \(completed.terminationStatus).",
                    component: self.componentName
                )
                self.onExit?(
                    Exit(status: completed.terminationStatus, expected: expected)
                )
            }

            do {
                try process.run()
                Darwin.setpgid(process.processIdentifier, process.processIdentifier)
                self.process = process
                processGroupIdentifier = process.processIdentifier
                logBuffer.append(
                    "Started process \(process.processIdentifier): " +
                    ([configuration.executableURL.path] + configuration.arguments)
                        .joined(separator: " "),
                    component: componentName
                )
            } catch {
                outputPipe.fileHandleForReading.readabilityHandler = nil
                errorPipe.fileHandleForReading.readabilityHandler = nil
                throw EnmannerError.processLaunchFailed(error.localizedDescription)
            }
        }
    }

    public func stop(gracePeriod: TimeInterval = 2) {
        let processToStop: (process: Process?, group: Int32)? = queue.sync {
            guard let group = processGroupIdentifier,
                  Self.processGroupExists(group) else {
                processGroupIdentifier = nil
                return nil
            }
            if let process, process.isRunning {
                expectedExitProcessIdentifiers.insert(
                    process.processIdentifier
                )
                return (process, group)
            }
            return (nil, group)
        }
        guard let processToStop else { return }

        let pid = processToStop.group
        logBuffer.append(
            "Stopping process \(pid).",
            component: componentName
        )
        Darwin.kill(-pid, SIGTERM)

        let deadline = Date().addingTimeInterval(gracePeriod)
        while ((processToStop.process?.isRunning ?? false) ||
                Self.processGroupExists(pid)) &&
                Date() < deadline {
            Thread.sleep(forTimeInterval: 0.05)
        }
        if (processToStop.process?.isRunning ?? false) ||
            Self.processGroupExists(pid) {
            logBuffer.append(
                "Process did not stop gracefully; forcing shutdown.",
                component: componentName
            )
            Darwin.kill(-pid, SIGKILL)
            if processToStop.process?.isRunning == true {
                processToStop.process?.waitUntilExit()
            }
        }
        queue.sync {
            if processGroupIdentifier == pid {
                processGroupIdentifier = nil
            }
        }
    }

    private static func processGroupExists(_ identifier: Int32) -> Bool {
        if Darwin.kill(-identifier, 0) == 0 {
            return true
        }
        return errno == EPERM
    }

    private func attach(pipe: Pipe, stream: LogBuffer.Stream) {
        pipe.fileHandleForReading.readabilityHandler = {
            [weak logBuffer, weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }
            guard let text = String(data: data, encoding: .utf8) else {
                return
            }
            for line in text.split(whereSeparator: \.isNewline) {
                let message = logBuffer?.redact(String(line)) ?? String(line)
                logBuffer?.append(
                    message,
                    stream: stream,
                    component: self?.componentName
                )
                self?.onOutput?(stream, message)
            }
        }
    }
}
