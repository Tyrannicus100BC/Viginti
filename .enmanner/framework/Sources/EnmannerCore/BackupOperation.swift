import Foundation

public final class BackupOperation: @unchecked Sendable {
    private let logBuffer: LogBuffer
    private let supervisor: ProcessSupervisor

    public init(logBuffer: LogBuffer) {
        self.logBuffer = logBuffer
        supervisor = ProcessSupervisor(
            logBuffer: logBuffer,
            componentName: "backup"
        )
    }

    public var isRunning: Bool {
        supervisor.isRunning
    }

    public func run(
        backup: EnmannerManifest.Backup,
        plan: RuntimePlan,
        projectURL: URL
    ) async throws {
        let component = EnmannerManifest.Component(
            kind: .task,
            command: backup.command,
            workingDirectory: backup.workingDirectory,
            environment: backup.environment
        )
        let configuration = try ProcessConfigurationBuilder.make(
            componentName: plan.graph.applicationComponent,
            component: component,
            plan: plan,
            projectURL: projectURL
        )
        let exit = try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<ProcessSupervisor.Exit, Error>) in
            supervisor.onExit = { exit in
                continuation.resume(returning: exit)
            }
            do {
                try supervisor.start(configuration)
            } catch {
                continuation.resume(throwing: error)
            }
        }
        guard exit.status == 0 else {
            throw EnmannerError.runtimeFailure(.init(
                code: .backupFailed,
                phase: .backup,
                component: "backup",
                message: "The project backup failed with status \(exit.status).",
                exitStatus: exit.status,
                command: [configuration.executableURL.path] +
                    configuration.arguments,
                workingDirectory: configuration.workingDirectoryURL.path,
                recentLogs: logBuffer.recentEntries(
                    component: "backup",
                    componentOnly: true
                )
            ))
        }
    }

    public func stop() {
        supervisor.stop()
    }
}
