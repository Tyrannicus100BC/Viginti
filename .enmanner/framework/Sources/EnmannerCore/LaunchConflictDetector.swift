import Foundation

public struct LaunchConflict: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case endpointInUse
        case exclusivePathOpen
    }

    public let kind: Kind
    public let resource: String
    public let processes: [String]

    public init(kind: Kind, resource: String, processes: [String]) {
        self.kind = kind
        self.resource = resource
        self.processes = processes
    }
}

public enum LaunchConflictDetector {
    public static func detect(
        manifest: EnmannerManifest,
        projectURL: URL
    ) -> [LaunchConflict] {
        guard let configuration = manifest.launchGuard,
              let graph = try? RuntimeGraph.make(from: manifest) else {
            return []
        }
        var conflicts: [LaunchConflict] = []
        var references = configuration.endpoints
        if configuration.applicationEndpoint {
            references.append(
                "\(graph.applicationComponent).\(graph.applicationEndpoint)"
            )
        }
        for reference in Set(references).sorted() {
            let parts = reference.split(separator: ".")
            guard parts.count == 2,
                  let endpoint = graph.components[String(parts[0])]?
                    .endpoints[String(parts[1])],
                  let port = endpoint.port.fixed ?? endpoint.port.preferred,
                  PortAllocator.isLoopbackPortListening(port) else {
                continue
            }
            conflicts.append(.init(
                kind: .endpointInUse,
                resource: "\(reference) on port \(port)",
                processes: processDescriptions(
                    arguments: ["-nP", "-iTCP:\(port)", "-sTCP:LISTEN", "-Fpc"]
                )
            ))
        }
        for path in configuration.exclusivePaths {
            guard let url = try? ProjectPaths.resolve(path, inside: projectURL),
                  FileManager.default.fileExists(atPath: url.path) else {
                continue
            }
            let processes = processDescriptions(
                arguments: ["-nP", "-Fpc", "--", url.path]
            )
            guard !processes.isEmpty else { continue }
            conflicts.append(.init(
                kind: .exclusivePathOpen,
                resource: path,
                processes: processes
            ))
        }
        return conflicts
    }

    private static func processDescriptions(arguments: [String]) -> [String] {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
        process.arguments = arguments
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
        } catch {
            return []
        }
        process.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let output = String(data: data, encoding: .utf8) else { return [] }
        var currentPID: String?
        var descriptions: [String] = []
        for line in output.split(separator: "\n").map(String.init) {
            if line.hasPrefix("p") {
                currentPID = String(line.dropFirst())
            } else if line.hasPrefix("c"), let currentPID {
                descriptions.append("\(line.dropFirst()) (pid \(currentPID))")
            }
        }
        return Array(Set(descriptions)).sorted()
    }
}
