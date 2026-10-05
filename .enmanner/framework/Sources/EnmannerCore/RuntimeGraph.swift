import Foundation

public struct RuntimeGraph: Equatable, Sendable {
    public static let inlineApplicationComponent = "__application"

    public let components: [String: EnmannerManifest.Component]
    public let applicationComponent: String
    public let applicationEndpoint: String
    public let applicationPath: String
    public let startupOrder: [String]

    public static func make(from manifest: EnmannerManifest) throws -> RuntimeGraph {
        var components = manifest.components
        let applicationComponent: String
        let applicationEndpoint: String
        let applicationPath: String

        if let command = manifest.application.command {
            guard manifest.application.component == nil,
                  manifest.application.endpoint == nil else {
                throw EnmannerError.invalidManifest([
                    "application must use either inline command fields or a component reference."
                ])
            }
            guard let readiness = manifest.application.readiness else {
                throw EnmannerError.invalidManifest([
                    "application.readiness is required for an inline application."
                ])
            }
            guard components[inlineApplicationComponent] == nil else {
                throw EnmannerError.invalidManifest([
                    "components may not use the reserved inline application name."
                ])
            }
            let endpoint = EnmannerManifest.Endpoint(
                protocol: .http,
                port: .init(preferred: manifest.application.preferredPort)
            )
            components[inlineApplicationComponent] = .init(
                kind: .service,
                command: command,
                workingDirectory: manifest.application.workingDirectory,
                environment: manifest.application.environment,
                dependsOn: manifest.application.dependsOn,
                endpoints: ["http": endpoint],
                readiness: readiness
            )
            applicationComponent = inlineApplicationComponent
            applicationEndpoint = "http"
            applicationPath = readiness.path
        } else {
            guard let component = manifest.application.component,
                  let endpoint = manifest.application.endpoint,
                  manifest.application.readiness == nil else {
                throw EnmannerError.invalidManifest([
                    "application component references require component and endpoint."
                ])
            }
            applicationComponent = component
            applicationEndpoint = endpoint
            applicationPath = manifest.application.path
        }

        let order = try topologicalOrder(components: components)
        return RuntimeGraph(
            components: components,
            applicationComponent: applicationComponent,
            applicationEndpoint: applicationEndpoint,
            applicationPath: applicationPath,
            startupOrder: order
        )
    }

    public var applicationCommand: [String] {
        components[applicationComponent]?.command ?? []
    }

    public var applicationPreferredPort: UInt16? {
        components[applicationComponent]?
            .endpoints[applicationEndpoint]?
            .port.preferred
    }

    public var applicationHasStablePort: Bool {
        guard let port = components[applicationComponent]?
            .endpoints[applicationEndpoint]?
            .port else { return false }
        return port.fixed != nil || port.preferred != nil
    }

    public var environments: [[String: String]] {
        components.values.map(\.environment)
    }

    private static func topologicalOrder(
        components: [String: EnmannerManifest.Component]
    ) throws -> [String] {
        enum Visit {
            case active
            case complete
        }

        var visits: [String: Visit] = [:]
        var result: [String] = []

        func visit(_ name: String, path: [String]) throws {
            if visits[name] == .complete { return }
            if visits[name] == .active {
                throw EnmannerError.invalidManifest([
                    "components contain a dependency cycle: " +
                        (path + [name]).joined(separator: " → ") + "."
                ])
            }
            guard let component = components[name] else {
                throw EnmannerError.invalidManifest([
                    "component \(path.last ?? name) depends on unknown component \(name)."
                ])
            }
            visits[name] = .active
            for dependency in component.dependsOn {
                try visit(dependency, path: path + [name])
            }
            visits[name] = .complete
            result.append(name)
        }

        for name in components.keys.sorted() {
            try visit(name, path: [])
        }
        return result
    }
}

public struct ResolvedEndpoint: Equatable, Sendable {
    public let protocolKind: EnmannerManifest.Endpoint.ProtocolKind
    public let host: String
    public let port: UInt16

    public var url: String {
        switch protocolKind {
        case .http, .https:
            return "\(protocolKind.rawValue)://\(formattedHost):\(port)"
        case .tcp:
            return "tcp://\(formattedHost):\(port)"
        }
    }

    public func url(path: String) -> URL? {
        guard protocolKind == .http || protocolKind == .https else { return nil }
        var components = URLComponents()
        components.scheme = protocolKind.rawValue
        components.host = host
        components.port = Int(port)
        components.path = path.hasPrefix("/") ? path : "/" + path
        return components.url
    }

    private var formattedHost: String {
        host.contains(":") ? "[\(host)]" : host
    }
}

public struct RuntimePlan: Equatable, Sendable {
    public struct EndpointKey: Hashable, Sendable {
        public let component: String
        public let endpoint: String

        public init(component: String, endpoint: String) {
            self.component = component
            self.endpoint = endpoint
        }
    }

    public let graph: RuntimeGraph
    public let endpoints: [EndpointKey: ResolvedEndpoint]
    public let applicationURL: URL
    public let executableSearchPaths: [String]

    public init(
        graph: RuntimeGraph,
        endpoints: [EndpointKey: ResolvedEndpoint],
        applicationURL: URL,
        executableSearchPaths: [String] = []
    ) {
        self.graph = graph
        self.endpoints = endpoints
        self.applicationURL = applicationURL
        self.executableSearchPaths = executableSearchPaths
    }

    public static func make(
        manifest: EnmannerManifest,
        retainedPorts: [EndpointKey: UInt16] = [:]
    ) throws -> RuntimePlan {
        let graph = try RuntimeGraph.make(from: manifest)
        var endpoints: [EndpointKey: ResolvedEndpoint] = [:]
        var usedPorts: Set<UInt16> = []

        for componentName in graph.startupOrder {
            guard let component = graph.components[componentName] else { continue }
            for endpointName in component.endpoints.keys.sorted() {
                guard let endpoint = component.endpoints[endpointName] else { continue }
                let key = EndpointKey(
                    component: componentName,
                    endpoint: endpointName
                )
                let port: UInt16
                if let retained = retainedPorts[key] {
                    port = retained
                } else if let fixed = endpoint.port.fixed {
                    port = fixed
                } else {
                    port = try allocateUniquePort(
                        preferred: endpoint.port.preferred,
                        excluding: usedPorts
                    )
                }
                guard usedPorts.insert(port).inserted else {
                    throw EnmannerError.invalidManifest([
                        "components assign loopback port \(port) to more than one endpoint."
                    ])
                }
                endpoints[key] = ResolvedEndpoint(
                    protocolKind: endpoint.protocol,
                    host: endpoint.host,
                    port: port
                )
            }
        }

        let applicationKey = EndpointKey(
            component: graph.applicationComponent,
            endpoint: graph.applicationEndpoint
        )
        guard let applicationEndpoint = endpoints[applicationKey],
              let applicationURL = applicationEndpoint.url(
                path: graph.applicationPath
              ) else {
            throw EnmannerError.invalidManifest([
                "application must reference an HTTP or HTTPS endpoint."
            ])
        }
        return RuntimePlan(
            graph: graph,
            endpoints: endpoints,
            applicationURL: applicationURL,
            executableSearchPaths: manifest.executableSearchPaths
        )
    }

    public var ports: [EndpointKey: UInt16] {
        endpoints.mapValues(\.port)
    }

    public var ownedPorts: [EndpointKey: UInt16] {
        ports.filter { key, _ in
            graph.components[key.component]?.kind != .prerequisite
        }
    }

    public var observedPorts: [EndpointKey: UInt16] {
        ports.filter { key, _ in
            graph.components[key.component]?.kind == .prerequisite
        }
    }

    public var applicationPort: UInt16 {
        endpoints[
            .init(
                component: graph.applicationComponent,
                endpoint: graph.applicationEndpoint
            )
        ]!.port
    }

    private static func allocateUniquePort(
        preferred: UInt16?,
        excluding: Set<UInt16>
    ) throws -> UInt16 {
        if let preferred,
           !excluding.contains(preferred),
           PortAllocator.isLoopbackPortAvailable(preferred) {
            return preferred
        }
        for _ in 0..<32 {
            let port = try PortAllocator.allocateLoopbackPort()
            if !excluding.contains(port) {
                return port
            }
        }
        throw EnmannerError.portAllocationFailed
    }
}

public enum ManifestInterpolator {
    private static let tokenPattern = #"\$\{([^}]+)\}"#

    public struct Reference: Equatable, Sendable {
        public let token: String
        public let targetComponent: String?
    }

    public static func expand(
        _ value: String,
        componentName: String,
        plan: RuntimePlan,
        projectURL: URL
    ) throws -> String {
        let replacements = try replacementValues(
            in: value,
            componentName: componentName,
            plan: plan,
            projectURL: projectURL
        )
        var result = value
        for (token, replacement) in replacements.reversed() {
            guard let range = result.range(of: token) else { continue }
            result.replaceSubrange(range, with: replacement)
        }
        if result.contains("${") {
            throw EnmannerError.invalidInterpolation(result)
        }
        return result
    }

    public static func expand(
        _ values: [String: String],
        componentName: String,
        plan: RuntimePlan,
        projectURL: URL
    ) throws -> [String: String] {
        try values.mapValues {
            try expand(
                $0,
                componentName: componentName,
                plan: plan,
                projectURL: projectURL
            )
        }
    }

    public static func references(in value: String) -> [Reference] {
        guard let regex = try? NSRegularExpression(pattern: tokenPattern) else {
            return []
        }
        let range = NSRange(value.startIndex..., in: value)
        return regex.matches(in: value, range: range).compactMap { match in
            guard let tokenRange = Range(match.range(at: 0), in: value),
                  let bodyRange = Range(match.range(at: 1), in: value) else {
                return nil
            }
            let body = String(value[bodyRange])
            let parts = body.split(separator: ".").map(String.init)
            let target = parts.count == 5 && parts[0] == "components"
                ? parts[1]
                : nil
            return Reference(
                token: String(value[tokenRange]),
                targetComponent: target
            )
        }
    }

    private static func replacementValues(
        in value: String,
        componentName: String,
        plan: RuntimePlan,
        projectURL: URL
    ) throws -> [(String, String)] {
        guard let regex = try? NSRegularExpression(pattern: tokenPattern) else {
            return []
        }
        let range = NSRange(value.startIndex..., in: value)
        return try regex.matches(in: value, range: range).map { match in
            guard let tokenRange = Range(match.range(at: 0), in: value),
                  let bodyRange = Range(match.range(at: 1), in: value) else {
                throw EnmannerError.invalidInterpolation(value)
            }
            let token = String(value[tokenRange])
            let body = String(value[bodyRange])
            if body == "project.directory" {
                return (token, projectURL.path)
            }

            let parts = body.split(separator: ".").map(String.init)
            let targetComponent: String
            let endpointName: String
            let property: String
            if parts.count == 4,
               parts[0] == "self",
               parts[1] == "endpoints" {
                targetComponent = componentName
                endpointName = parts[2]
                property = parts[3]
            } else if parts.count == 5,
                      parts[0] == "components",
                      parts[2] == "endpoints" {
                targetComponent = parts[1]
                endpointName = parts[3]
                property = parts[4]
            } else {
                throw EnmannerError.invalidInterpolation(token)
            }

            let key = RuntimePlan.EndpointKey(
                component: targetComponent,
                endpoint: endpointName
            )
            guard let endpoint = plan.endpoints[key] else {
                throw EnmannerError.invalidInterpolation(token)
            }
            let replacement: String
            switch property {
            case "host":
                replacement = endpoint.host
            case "port":
                replacement = String(endpoint.port)
            case "url":
                replacement = endpoint.url
            default:
                throw EnmannerError.invalidInterpolation(token)
            }
            return (token, replacement)
        }
    }
}
