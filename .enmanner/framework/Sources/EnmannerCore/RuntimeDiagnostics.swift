import Foundation

public struct RuntimeEvent: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case componentStarting
        case componentStarted
        case componentOutput
        case probeWaiting
        case probePassed
        case taskCompleted
        case componentExited
        case componentStopping
        case recoveryStarting
        case recoveryCompleted
        case runtimeReady
    }

    public let kind: Kind
    public let component: String?
    public let stream: LogBuffer.Stream?
    public let message: String?
    public let status: Int32?
    public let expected: Bool?

    public init(
        kind: Kind,
        component: String? = nil,
        stream: LogBuffer.Stream? = nil,
        message: String? = nil,
        status: Int32? = nil,
        expected: Bool? = nil
    ) {
        self.kind = kind
        self.component = component
        self.stream = stream
        self.message = message
        self.status = status
        self.expected = expected
    }
}

public struct RuntimeFailure: Codable, Equatable, Sendable, LocalizedError {
    public enum Code: String, Codable, Sendable {
        case prerequisiteUnavailable
        case componentLaunchFailed
        case componentExited
        case probeFailed
        case probeTimedOut
        case addressFamilyMismatch
        case taskExited
        case taskLeftProcessesRunning
        case runtimeInterrupted
        case backupFailed
    }

    public enum Phase: String, Codable, Sendable {
        case prerequisite
        case startup
        case readiness
        case stability
        case completion
        case shutdown
        case backup
    }

    public let code: Code
    public let phase: Phase
    public let component: String?
    public let message: String
    public let exitStatus: Int32?
    public let timeoutSeconds: Double?
    public let command: [String]?
    public let workingDirectory: String?
    public let recentLogs: [String]

    public init(
        code: Code,
        phase: Phase,
        component: String? = nil,
        message: String,
        exitStatus: Int32? = nil,
        timeoutSeconds: Double? = nil,
        command: [String]? = nil,
        workingDirectory: String? = nil,
        recentLogs: [String] = []
    ) {
        self.code = code
        self.phase = phase
        self.component = component
        self.message = message
        self.exitStatus = exitStatus
        self.timeoutSeconds = timeoutSeconds
        self.command = command
        self.workingDirectory = workingDirectory
        self.recentLogs = recentLogs
    }

    public var errorDescription: String? {
        message
    }
}
