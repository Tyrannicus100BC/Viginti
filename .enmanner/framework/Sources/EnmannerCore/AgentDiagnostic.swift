import Foundation

public enum AgentDiagnostic {
    public static func make(
        projectURL: URL,
        failure: RuntimeFailure?,
        message: String,
        selectedPorts: [RuntimePlan.EndpointKey: UInt16] = [:],
        fallbackLogs: [String] = []
    ) -> String {
        var lines = [
            "Diagnose and fix this Enmanner launch failure.",
            "Read .enmanner/AGENTS.md before changing startup or lifecycle behavior.",
            "",
            "Project: \(projectURL.path)",
            "Error: \(message)"
        ]
        if let failure {
            lines.append("Code: \(failure.code.rawValue)")
            lines.append("Phase: \(failure.phase.rawValue)")
            if let component = failure.component {
                lines.append("Component: \(component)")
            }
            if let command = failure.command {
                let encoded = (try? JSONEncoder().encode(command))
                    .flatMap { String(data: $0, encoding: .utf8) } ??
                    command.joined(separator: " ")
                lines.append("Resolved command: \(encoded)")
            }
            if let directory = failure.workingDirectory {
                lines.append("Working directory: \(directory)")
            }
            if let status = failure.exitStatus {
                lines.append("Exit status: \(status)")
            }
            if let timeout = failure.timeoutSeconds {
                lines.append("Timeout: \(timeout) seconds")
            }
        }
        if !selectedPorts.isEmpty {
            lines.append("")
            lines.append("Resolved endpoints:")
            for (key, port) in selectedPorts.sorted(by: {
                ($0.key.component, $0.key.endpoint) <
                    ($1.key.component, $1.key.endpoint)
            }) {
                lines.append("- \(key.component).\(key.endpoint): \(port)")
            }
        }
        let logs = failure?.recentLogs.isEmpty == false
            ? failure?.recentLogs ?? []
            : fallbackLogs
        if !logs.isEmpty {
            lines.append("")
            lines.append("Recent output:")
            lines.append(contentsOf: logs.suffix(40))
        }
        return lines.joined(separator: "\n")
    }

    public static func make(
        projectURL: URL,
        conflicts: [LaunchConflict]
    ) -> String {
        var lines = [
            "Diagnose this Enmanner duplicate-runtime warning and determine which process should own the project data.",
            "Read .enmanner/AGENTS.md before changing startup or lifecycle behavior.",
            "",
            "Project: \(projectURL.path)",
            "Conflicts:"
        ]
        for conflict in conflicts {
            let processes = conflict.processes.isEmpty
                ? "unknown process"
                : conflict.processes.joined(separator: ", ")
            lines.append("- \(conflict.kind.rawValue): \(conflict.resource) — \(processes)")
        }
        return lines.joined(separator: "\n")
    }
}
