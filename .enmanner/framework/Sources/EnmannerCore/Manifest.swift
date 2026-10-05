import Foundation

public struct EnmannerManifest: Codable, Equatable, Sendable {
    public let version: Int
    public let name: String
    public let identifier: String
    public let executableSearchPaths: [String]
    public let application: Application
    public let components: [String: Component]
    public let window: Window
    public let icon: Icon?
    public let userConfiguration: UserConfiguration?
    public let launchGuard: LaunchGuard?
    public let backup: Backup?
    public let liveUpdates: LiveUpdates?

    public init(
        version: Int,
        name: String,
        identifier: String,
        executableSearchPaths: [String] = [],
        application: Application,
        components: [String: Component] = [:],
        window: Window = Window(),
        icon: Icon? = nil,
        userConfiguration: UserConfiguration? = nil,
        launchGuard: LaunchGuard? = nil,
        backup: Backup? = nil,
        liveUpdates: LiveUpdates? = nil
    ) {
        self.version = version
        self.name = name
        self.identifier = identifier
        self.executableSearchPaths = executableSearchPaths
        self.application = application
        self.components = components
        self.window = window
        self.icon = icon
        self.userConfiguration = userConfiguration
        self.launchGuard = launchGuard
        self.backup = backup
        self.liveUpdates = liveUpdates
    }

    private enum CodingKeys: String, CodingKey {
        case version
        case name
        case identifier
        case executableSearchPaths
        case application
        case components
        case window
        case icon
        case userConfiguration
        case launchGuard
        case backup
        case liveUpdates
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        version = try container.decode(Int.self, forKey: .version)
        name = try container.decode(String.self, forKey: .name)
        identifier = try container.decode(String.self, forKey: .identifier)
        executableSearchPaths = try container.decodeIfPresent(
            [String].self,
            forKey: .executableSearchPaths
        ) ?? []
        application = try container.decode(Application.self, forKey: .application)
        components = try container.decodeIfPresent(
            [String: Component].self,
            forKey: .components
        ) ?? [:]
        window = try container.decodeIfPresent(
            Window.self,
            forKey: .window
        ) ?? Window()
        icon = try container.decodeIfPresent(Icon.self, forKey: .icon)
        userConfiguration = try container.decodeIfPresent(
            UserConfiguration.self,
            forKey: .userConfiguration
        )
        launchGuard = try container.decodeIfPresent(
            LaunchGuard.self,
            forKey: .launchGuard
        )
        backup = try container.decodeIfPresent(Backup.self, forKey: .backup)
        liveUpdates = try container.decodeIfPresent(LiveUpdates.self, forKey: .liveUpdates)
    }

    public struct LiveUpdates: Codable, Equatable, Sendable {
        public let adapter: String

        public init(adapter: String = "vite") {
            self.adapter = adapter
        }
    }

    public struct Icon: Codable, Equatable, Sendable {
        public let modern: String?
        public let legacy: String?

        public init(modern: String? = nil, legacy: String? = nil) {
            self.modern = modern
            self.legacy = legacy
        }

        public init(path: String) {
            if path.lowercased().hasSuffix(".icon") {
                modern = path
                legacy = nil
            } else {
                modern = nil
                legacy = path
            }
        }

        public init(from decoder: Decoder) throws {
            if let container = try? decoder.singleValueContainer(),
               let path = try? container.decode(String.self) {
                self.init(path: path)
                return
            }

            let container = try decoder.container(keyedBy: CodingKeys.self)
            let modern = try container.decodeIfPresent(
                String.self,
                forKey: .modern
            )
            let legacy = try container.decodeIfPresent(
                String.self,
                forKey: .legacy
            )
            if modern == nil && legacy == nil {
                throw DecodingError.dataCorrupted(
                    .init(
                        codingPath: decoder.codingPath,
                        debugDescription: "icon must configure modern, legacy, or both."
                    )
                )
            }
            self.init(modern: modern, legacy: legacy)
        }

        public func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encodeIfPresent(modern, forKey: .modern)
            try container.encodeIfPresent(legacy, forKey: .legacy)
        }

        public func selectedPath(modernToolingAvailable: Bool) -> String? {
            if modernToolingAvailable {
                return modern ?? legacy
            }
            return legacy ?? modern
        }

        public var paths: [String] {
            [modern, legacy].compactMap { $0 }
        }

        private enum CodingKeys: String, CodingKey {
            case modern
            case legacy
        }
    }

    public struct Application: Codable, Equatable, Sendable {
        public let component: String?
        public let endpoint: String?
        public let path: String
        public let command: [String]?
        public let workingDirectory: String
        public let environment: [String: String]
        public let dependsOn: [String]
        public let preferredPort: UInt16?
        public let readiness: Probe?

        public init(
            component: String,
            endpoint: String,
            path: String = "/"
        ) {
            self.component = component
            self.endpoint = endpoint
            self.path = path
            command = nil
            workingDirectory = "."
            environment = [:]
            dependsOn = []
            preferredPort = nil
            readiness = nil
        }

        public init(
            command: [String],
            workingDirectory: String = ".",
            environment: [String: String] = [:],
            dependsOn: [String] = [],
            preferredPort: UInt16? = nil,
            readiness: Probe
        ) {
            component = nil
            endpoint = nil
            path = readiness.path
            self.command = command
            self.workingDirectory = workingDirectory
            self.environment = environment
            self.dependsOn = dependsOn
            self.preferredPort = preferredPort
            self.readiness = readiness
        }

        private enum CodingKeys: String, CodingKey {
            case component
            case endpoint
            case path
            case command
            case workingDirectory
            case environment
            case dependsOn
            case preferredPort
            case readiness
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            component = try container.decodeIfPresent(String.self, forKey: .component)
            endpoint = try container.decodeIfPresent(String.self, forKey: .endpoint)
            command = try container.decodeIfPresent([String].self, forKey: .command)
            workingDirectory = try container.decodeIfPresent(
                String.self,
                forKey: .workingDirectory
            ) ?? "."
            environment = try container.decodeIfPresent(
                [String: String].self,
                forKey: .environment
            ) ?? [:]
            dependsOn = try container.decodeIfPresent(
                [String].self,
                forKey: .dependsOn
            ) ?? []
            preferredPort = try container.decodeIfPresent(
                UInt16.self,
                forKey: .preferredPort
            )
            readiness = try container.decodeIfPresent(Probe.self, forKey: .readiness)
            path = try container.decodeIfPresent(String.self, forKey: .path) ??
                readiness?.path ?? "/"
        }
    }

    public struct Component: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable {
            case service
            case task
            case prerequisite
        }

        public let kind: Kind
        public let command: [String]?
        public let workingDirectory: String
        public let environment: [String: String]
        public let dependsOn: [String]
        public let endpoints: [String: Endpoint]
        public let readiness: Probe?
        public let completion: Probe?
        public let check: Probe?
        public let failureMessage: String?

        public init(
            kind: Kind = .service,
            command: [String]? = nil,
            workingDirectory: String = ".",
            environment: [String: String] = [:],
            dependsOn: [String] = [],
            endpoints: [String: Endpoint] = [:],
            readiness: Probe? = nil,
            completion: Probe? = nil,
            check: Probe? = nil,
            failureMessage: String? = nil
        ) {
            self.kind = kind
            self.command = command
            self.workingDirectory = workingDirectory
            self.environment = environment
            self.dependsOn = dependsOn
            self.endpoints = endpoints
            self.readiness = readiness
            self.completion = completion
            self.check = check
            self.failureMessage = failureMessage
        }

        private enum CodingKeys: String, CodingKey {
            case kind
            case command
            case workingDirectory
            case environment
            case dependsOn
            case endpoints
            case readiness
            case completion
            case check
            case failureMessage
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            kind = try container.decodeIfPresent(Kind.self, forKey: .kind) ?? .service
            command = try container.decodeIfPresent([String].self, forKey: .command)
            workingDirectory = try container.decodeIfPresent(
                String.self,
                forKey: .workingDirectory
            ) ?? "."
            environment = try container.decodeIfPresent(
                [String: String].self,
                forKey: .environment
            ) ?? [:]
            dependsOn = try container.decodeIfPresent(
                [String].self,
                forKey: .dependsOn
            ) ?? []
            endpoints = try container.decodeIfPresent(
                [String: Endpoint].self,
                forKey: .endpoints
            ) ?? [:]
            readiness = try container.decodeIfPresent(Probe.self, forKey: .readiness)
            completion = try container.decodeIfPresent(
                Probe.self,
                forKey: .completion
            )
            check = try container.decodeIfPresent(Probe.self, forKey: .check)
            failureMessage = try container.decodeIfPresent(
                String.self,
                forKey: .failureMessage
            )
        }
    }

    public struct Endpoint: Codable, Equatable, Sendable {
        public enum ProtocolKind: String, Codable, Sendable {
            case http
            case https
            case tcp
        }

        public struct Port: Codable, Equatable, Sendable {
            public let fixed: UInt16?
            public let preferred: UInt16?

            public init(fixed: UInt16? = nil, preferred: UInt16? = nil) {
                self.fixed = fixed
                self.preferred = preferred
            }
        }

        public let `protocol`: ProtocolKind
        public let host: String
        public let port: Port

        public init(
            protocol: ProtocolKind,
            host: String = "127.0.0.1",
            port: Port = Port()
        ) {
            self.protocol = `protocol`
            self.host = host
            self.port = port
        }

        private enum CodingKeys: String, CodingKey {
            case `protocol`
            case host
            case port
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            `protocol` = try container.decode(ProtocolKind.self, forKey: .protocol)
            host = try container.decodeIfPresent(String.self, forKey: .host) ??
                "127.0.0.1"
            port = try container.decodeIfPresent(Port.self, forKey: .port) ?? Port()
        }
    }

    public struct Probe: Codable, Equatable, Sendable {
        public enum ProbeType: String, Codable, Sendable {
            case http
            case tcp
            case command
            case process
        }

        public struct Success: Codable, Equatable, Sendable {
            public let stdoutEquals: String?
            public let stdoutContains: String?

            public init(
                stdoutEquals: String? = nil,
                stdoutContains: String? = nil
            ) {
                self.stdoutEquals = stdoutEquals
                self.stdoutContains = stdoutContains
            }
        }

        public let type: ProbeType
        public let endpoint: String?
        public let path: String
        public let command: [String]?
        public let timeoutSeconds: Double
        public let acceptableStatusCodes: [Int]?
        public let contentTypeContains: String?
        public let bodyContains: String?
        public let success: Success?
        public let minimumUptimeSeconds: Double?

        public init(
            type: ProbeType = .http,
            endpoint: String? = "http",
            path: String = "/",
            command: [String]? = nil,
            timeoutSeconds: Double = 30,
            acceptableStatusCodes: [Int]? = nil,
            contentTypeContains: String? = nil,
            bodyContains: String? = nil,
            success: Success? = nil,
            minimumUptimeSeconds: Double? = nil
        ) {
            self.type = type
            self.endpoint = endpoint
            self.path = path
            self.command = command
            self.timeoutSeconds = timeoutSeconds
            self.acceptableStatusCodes = acceptableStatusCodes
            self.contentTypeContains = contentTypeContains
            self.bodyContains = bodyContains
            self.success = success
            self.minimumUptimeSeconds = minimumUptimeSeconds
        }

        private enum CodingKeys: String, CodingKey {
            case type
            case endpoint
            case path
            case command
            case timeoutSeconds
            case acceptableStatusCodes
            case contentTypeContains
            case bodyContains
            case success
            case minimumUptimeSeconds
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            type = try container.decodeIfPresent(ProbeType.self, forKey: .type) ?? .http
            endpoint = try container.decodeIfPresent(String.self, forKey: .endpoint) ??
                (type == .command || type == .process ? nil : "http")
            path = try container.decodeIfPresent(String.self, forKey: .path) ?? "/"
            command = try container.decodeIfPresent([String].self, forKey: .command)
            timeoutSeconds = try container.decodeIfPresent(
                Double.self,
                forKey: .timeoutSeconds
            ) ?? 30
            acceptableStatusCodes = try container.decodeIfPresent(
                [Int].self,
                forKey: .acceptableStatusCodes
            )
            contentTypeContains = try container.decodeIfPresent(
                String.self,
                forKey: .contentTypeContains
            )
            bodyContains = try container.decodeIfPresent(
                String.self,
                forKey: .bodyContains
            )
            success = try container.decodeIfPresent(Success.self, forKey: .success)
            minimumUptimeSeconds = try container.decodeIfPresent(
                Double.self,
                forKey: .minimumUptimeSeconds
            )
        }
    }

    public struct Window: Codable, Equatable, Sendable {
        public let width: Double
        public let height: Double
        public let resizable: Bool

        public init(
            width: Double = 1200,
            height: Double = 800,
            resizable: Bool = true
        ) {
            self.width = width
            self.height = height
            self.resizable = resizable
        }
    }

    public struct UserConfiguration: Codable, Equatable, Sendable {
        public struct Field: Codable, Equatable, Sendable {
            public enum FieldType: String, Codable, Sendable {
                case string
                case secret
                case boolean
                case file
                case directory
            }

            public let key: String
            public let label: String
            public let type: FieldType
            public let required: Bool
            public let description: String?

            public init(
                key: String,
                label: String,
                type: FieldType = .string,
                required: Bool = false,
                description: String? = nil
            ) {
                self.key = key
                self.label = label
                self.type = type
                self.required = required
                self.description = description
            }

            private enum CodingKeys: String, CodingKey {
                case key
                case label
                case type
                case required
                case description
            }

            public init(from decoder: Decoder) throws {
                let container = try decoder.container(keyedBy: CodingKeys.self)
                key = try container.decode(String.self, forKey: .key)
                label = try container.decode(String.self, forKey: .label)
                type = try container.decodeIfPresent(
                    FieldType.self,
                    forKey: .type
                ) ?? .string
                required = try container.decodeIfPresent(
                    Bool.self,
                    forKey: .required
                ) ?? false
                description = try container.decodeIfPresent(
                    String.self,
                    forKey: .description
                )
            }
        }

        public let file: String
        public let template: String?
        public let fields: [Field]

        public init(
            file: String = ".env",
            template: String? = nil,
            fields: [Field]
        ) {
            self.file = file
            self.template = template
            self.fields = fields
        }

        private enum CodingKeys: String, CodingKey {
            case file
            case template
            case fields
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            file = try container.decodeIfPresent(
                String.self,
                forKey: .file
            ) ?? ".env"
            template = try container.decodeIfPresent(
                String.self,
                forKey: .template
            )
            fields = try container.decode([Field].self, forKey: .fields)
        }
    }

    public struct LaunchGuard: Codable, Equatable, Sendable {
        public let applicationEndpoint: Bool
        public let endpoints: [String]
        public let exclusivePaths: [String]

        public init(
            applicationEndpoint: Bool = false,
            endpoints: [String] = [],
            exclusivePaths: [String] = []
        ) {
            self.applicationEndpoint = applicationEndpoint
            self.endpoints = endpoints
            self.exclusivePaths = exclusivePaths
        }

        private enum CodingKeys: String, CodingKey {
            case applicationEndpoint
            case endpoints
            case exclusivePaths
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            applicationEndpoint = try container.decodeIfPresent(
                Bool.self,
                forKey: .applicationEndpoint
            ) ?? false
            endpoints = try container.decodeIfPresent(
                [String].self,
                forKey: .endpoints
            ) ?? []
            exclusivePaths = try container.decodeIfPresent(
                [String].self,
                forKey: .exclusivePaths
            ) ?? []
        }
    }

    public struct Backup: Codable, Equatable, Sendable {
        public let command: [String]
        public let workingDirectory: String
        public let environment: [String: String]

        public init(
            command: [String],
            workingDirectory: String = ".",
            environment: [String: String] = [:]
        ) {
            self.command = command
            self.workingDirectory = workingDirectory
            self.environment = environment
        }

        private enum CodingKeys: String, CodingKey {
            case command
            case workingDirectory
            case environment
        }

        public init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            command = try container.decode([String].self, forKey: .command)
            workingDirectory = try container.decodeIfPresent(
                String.self,
                forKey: .workingDirectory
            ) ?? "."
            environment = try container.decodeIfPresent(
                [String: String].self,
                forKey: .environment
            ) ?? [:]
        }
    }

}

public enum ManifestLoader {
    public static func load(from url: URL) throws -> EnmannerManifest {
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw EnmannerError.manifestMissing(url)
        }

        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .useDefaultKeys
            return try decoder.decode(EnmannerManifest.self, from: data)
        } catch let error as EnmannerError {
            throw error
        } catch let error as DecodingError {
            throw decodingError(error)
        } catch {
            throw EnmannerError.malformedManifest(
                path: nil,
                detail: error.localizedDescription
            )
        }
    }

    private static func decodingError(_ error: DecodingError) -> EnmannerError {
        let path: String?
        let detail: String

        switch error {
        case .keyNotFound(let key, let context):
            path = codingPath(context.codingPath + [key])
            detail = "Missing required field."
        case .typeMismatch(let type, let context):
            path = codingPath(context.codingPath)
            detail = "Expected \(String(describing: type)). \(context.debugDescription)"
        case .valueNotFound(let type, let context):
            path = codingPath(context.codingPath)
            detail = "Expected \(String(describing: type)); found null."
        case .dataCorrupted(let context):
            path = codingPath(context.codingPath)
            detail = context.debugDescription
        @unknown default:
            path = nil
            detail = error.localizedDescription
        }

        return .malformedManifest(path: path, detail: detail)
    }

    private static func codingPath(_ keys: [CodingKey]) -> String? {
        let components = keys.map {
            $0.intValue.map(String.init) ?? $0.stringValue
        }
        return components.isEmpty ? nil : components.joined(separator: ".")
    }
}

public enum ManifestValidator {
    private static let identifierPattern =
        #"^[A-Za-z0-9][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)+$"#
    private static let componentNamePattern = #"^[a-z][a-z0-9-]{0,62}$"#
    private static let endpointNamePattern = #"^[a-z][a-z0-9-]{0,62}$"#
    private static let secretKeyPattern =
        #"(?i)(secret|token|password|api[_-]?key|private[_-]?key)"#
    private static let environmentKeyPattern = #"^[A-Za-z_][A-Za-z0-9_]*$"#

    public static func validate(_ manifest: EnmannerManifest, projectURL: URL) -> [String] {
        var issues: [String] = []
        let fileManager = FileManager.default

        if let liveUpdates = manifest.liveUpdates, liveUpdates.adapter != "vite" {
            issues.append("liveUpdates.adapter must be vite.")
        }
        if manifest.version != 3 {
            issues.append("version must be 3.")
        }
        if manifest.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            issues.append("name must not be empty.")
        }
        if manifest.name == "." || manifest.name == ".." ||
            manifest.name.contains("/") || manifest.name.contains(":") ||
            manifest.name.rangeOfCharacter(from: .controlCharacters) != nil {
            issues.append("name contains characters that cannot be used for an app bundle.")
        }
        if manifest.identifier.range(
            of: identifierPattern,
            options: .regularExpression
        ) == nil {
            issues.append("identifier must look like a reverse-DNS identifier.")
        }
        if !(320...4096).contains(Int(manifest.window.width)) ||
            !(240...2160).contains(Int(manifest.window.height)) {
            issues.append("window dimensions are outside the supported range.")
        }

        validateRuntime(
            manifest,
            projectURL: projectURL,
            fileManager: fileManager,
            issues: &issues
        )

        if let icon = manifest.icon {
            for (style, path, requiredExtension) in [
                ("modern", icon.modern, "icon"),
                ("legacy", icon.legacy, "icns")
            ] {
                guard let path else { continue }
                do {
                    let iconURL = try ProjectPaths.resolve(path, inside: projectURL)
                    let integrationURL = try ProjectPaths.resolve(
                        ProjectPaths.integrationDirectoryName,
                        inside: projectURL
                    )
                    let integrationPath = integrationURL.path.hasSuffix("/")
                        ? integrationURL.path
                        : integrationURL.path + "/"
                    if !iconURL.path.hasPrefix(integrationPath) {
                        issues.append(
                            "icon must stay inside the project-owned enmanner/ directory."
                        )
                    }
                    if iconURL.pathExtension.lowercased() != requiredExtension {
                        issues.append(
                            "icon.\(style) must be an .\(requiredExtension) \(style) icon."
                        )
                    } else if !fileManager.fileExists(atPath: iconURL.path) {
                        issues.append("icon.\(style) does not exist at \(path).")
                    }
                } catch {
                    issues.append("icon.\(style) must stay inside the project.")
                }
            }
        }

        if let configuration = manifest.userConfiguration {
            validateUserConfiguration(
                configuration,
                projectURL: projectURL,
                issues: &issues
            )
        }

        if let guardConfiguration = manifest.launchGuard {
            validateLaunchGuard(
                guardConfiguration,
                manifest: manifest,
                projectURL: projectURL,
                issues: &issues
            )
        }

        if let backup = manifest.backup {
            validateCommand(
                backup.command,
                path: "backup.command",
                issues: &issues
            )
            validateWorkingDirectory(
                backup.workingDirectory,
                path: "backup.workingDirectory",
                projectURL: projectURL,
                fileManager: fileManager,
                issues: &issues
            )
            validateEnvironment(
                backup.environment,
                path: "backup.environment",
                issues: &issues
            )
        }

        for (index, path) in manifest.executableSearchPaths.enumerated() {
            let field = "executableSearchPaths[\(index)]"
            if path.isEmpty {
                issues.append("\(field) must not be empty.")
            } else if path.contains(":") {
                issues.append("\(field) must be one directory, not a PATH list.")
            } else if !path.hasPrefix("/") && !path.hasPrefix("~/") {
                issues.append("\(field) must be absolute or home-relative (~/…).")
            }
        }

        return issues
    }

    private static func validateLaunchGuard(
        _ guardConfiguration: EnmannerManifest.LaunchGuard,
        manifest: EnmannerManifest,
        projectURL: URL,
        issues: inout [String]
    ) {
        guard guardConfiguration.applicationEndpoint ||
                !guardConfiguration.endpoints.isEmpty ||
                !guardConfiguration.exclusivePaths.isEmpty else {
            issues.append("launchGuard must guard an endpoint or exclusive path.")
            return
        }
        guard let graph = try? RuntimeGraph.make(from: manifest) else { return }
        var endpointReferences = guardConfiguration.endpoints
        if guardConfiguration.applicationEndpoint {
            endpointReferences.append(
                "\(graph.applicationComponent).\(graph.applicationEndpoint)"
            )
        }
        for reference in endpointReferences {
            let parts = reference.split(separator: ".", omittingEmptySubsequences: false)
            guard parts.count == 2 else {
                issues.append("launchGuard endpoint \(reference) must use component.endpoint.")
                continue
            }
            let componentName = String(parts[0])
            let endpointName = String(parts[1])
            guard let endpoint = graph.components[componentName]?
                .endpoints[endpointName] else {
                issues.append("launchGuard references unknown endpoint \(reference).")
                continue
            }
            if endpoint.port.preferred == nil && endpoint.port.fixed == nil {
                issues.append(
                    "launchGuard endpoint \(reference) needs a preferred or fixed port."
                )
            }
        }
        for (index, path) in guardConfiguration.exclusivePaths.enumerated() {
            do {
                _ = try ProjectPaths.resolve(path, inside: projectURL)
            } catch {
                issues.append(
                    "launchGuard.exclusivePaths[\(index)] must stay inside the project."
                )
            }
        }
    }

    private static func validateRuntime(
        _ manifest: EnmannerManifest,
        projectURL: URL,
        fileManager: FileManager,
        issues: inout [String]
    ) {
        let graph: RuntimeGraph
        do {
            graph = try RuntimeGraph.make(from: manifest)
        } catch let error as EnmannerError {
            if case .invalidManifest(let graphIssues) = error {
                issues.append(contentsOf: graphIssues)
            } else {
                issues.append(error.localizedDescription)
            }
            return
        } catch {
            issues.append(error.localizedDescription)
            return
        }

        if let command = manifest.application.command {
            validateCommand(command, path: "application.command", issues: &issues)
            if let preferred = manifest.application.preferredPort, preferred < 1024 {
                issues.append(
                    "application.preferredPort must be between 1024 and 65535."
                )
            }
            if manifest.application.readiness == nil {
                issues.append("application.readiness is required for an inline application.")
            }
        } else if manifest.application.component == nil ||
                    manifest.application.endpoint == nil {
            issues.append(
                "application must define an inline command or reference a component endpoint."
            )
        }

        for name in manifest.components.keys.sorted() {
            if name.range(
                of: componentNamePattern,
                options: .regularExpression
            ) == nil {
                issues.append(
                    "component name \(name) must use lowercase letters, digits, and hyphens."
                )
            }
        }

        for name in graph.startupOrder {
            guard let component = graph.components[name] else { continue }
            let displayPath = name == RuntimeGraph.inlineApplicationComponent
                ? "application"
                : "components.\(name)"

            switch component.kind {
            case .service, .task:
                if let command = component.command {
                    validateCommand(
                        command,
                        path: "\(displayPath).command",
                        issues: &issues
                    )
                } else {
                    issues.append("\(displayPath).command is required.")
                }
            case .prerequisite:
                if component.check == nil {
                    issues.append("\(displayPath).check is required.")
                }
                if component.command != nil {
                    issues.append(
                        "\(displayPath).command is not valid for a prerequisite; put command probes inside check."
                    )
                }
            }

            if component.kind != .service && component.readiness != nil {
                issues.append("\(displayPath).readiness is valid only for services.")
            }
            if component.kind != .task && component.completion != nil {
                issues.append("\(displayPath).completion is valid only for tasks.")
            }
            if component.kind != .prerequisite && component.check != nil {
                issues.append("\(displayPath).check is valid only for prerequisites.")
            }
            if component.kind == .service && component.readiness == nil {
                issues.append(
                    "\(displayPath).readiness is required; use a process probe for workers without a network endpoint."
                )
            }
            if component.kind == .task && !component.endpoints.isEmpty &&
                component.completion == nil {
                issues.append(
                    "\(displayPath).endpoints require a completion probe."
                )
            }
            if component.kind == .prerequisite {
                for (endpointName, endpoint) in component.endpoints
                    where endpoint.port.fixed == nil {
                    issues.append(
                        "\(displayPath).endpoints.\(endpointName).port.fixed is required because prerequisites are not owned by Enmanner."
                    )
                }
            }
            if component.kind != .prerequisite &&
                component.failureMessage != nil {
                issues.append(
                    "\(displayPath).failureMessage is valid only for prerequisites."
                )
            }
            if Set(component.dependsOn).count != component.dependsOn.count {
                issues.append("\(displayPath).dependsOn must not contain duplicates.")
            }

            validateWorkingDirectory(
                component.workingDirectory,
                path: "\(displayPath).workingDirectory",
                projectURL: projectURL,
                fileManager: fileManager,
                issues: &issues
            )
            validateEnvironment(
                component.environment,
                path: "\(displayPath).environment",
                issues: &issues
            )
            validateEndpoints(
                component.endpoints,
                path: "\(displayPath).endpoints",
                issues: &issues
            )
            if let readiness = component.readiness {
                validateProbe(
                    readiness,
                    component: component,
                    path: "\(displayPath).readiness",
                    issues: &issues
                )
            }
            if let check = component.check {
                validateProbe(
                    check,
                    component: component,
                    path: "\(displayPath).check",
                    issues: &issues
                )
            }
            if let completion = component.completion {
                validateProbe(
                    completion,
                    component: component,
                    path: "\(displayPath).completion",
                    issues: &issues
                )
            }
        }

        guard let applicationComponent = graph.components[
            graph.applicationComponent
        ], applicationComponent.kind == .service else {
            issues.append("application must reference a service component.")
            return
        }
        guard let applicationEndpoint = applicationComponent.endpoints[
            graph.applicationEndpoint
        ] else {
            issues.append(
                "application references unknown endpoint \(graph.applicationEndpoint) on component \(graph.applicationComponent)."
            )
            return
        }
        if applicationEndpoint.protocol != .http &&
            applicationEndpoint.protocol != .https {
            issues.append("application must reference an HTTP or HTTPS endpoint.")
        }
        if let readiness = applicationComponent.readiness {
            if readiness.type != .http {
                issues.append(
                    "the application component requires HTTP readiness for the page Enmanner opens."
                )
            } else if readiness.endpoint != graph.applicationEndpoint {
                issues.append(
                    "the application component readiness probe must use the endpoint referenced by application."
                )
            }
        }

        validateInterpolation(
            graph: graph,
            projectURL: projectURL,
            issues: &issues
        )
    }

    private static func validateCommand(
        _ command: [String],
        path: String,
        issues: inout [String]
    ) {
        if command.isEmpty ||
            command.first?.trimmingCharacters(in: .whitespaces).isEmpty != false {
            issues.append("\(path) must contain an executable.")
        }
        if command.contains("-g") || command.contains("--global") {
            issues.append("\(path) must not depend on a global package installation.")
        }
    }

    private static func validateWorkingDirectory(
        _ workingDirectory: String,
        path: String,
        projectURL: URL,
        fileManager: FileManager,
        issues: inout [String]
    ) {
        do {
            let workingURL = try ProjectPaths.resolve(
                workingDirectory,
                inside: projectURL
            )
            var isDirectory: ObjCBool = false
            if !fileManager.fileExists(
                atPath: workingURL.path,
                isDirectory: &isDirectory
            ) || !isDirectory.boolValue {
                issues.append("\(path) does not exist or is not a directory.")
            }
        } catch {
            issues.append("\(path) must stay inside the project.")
        }
    }

    private static func validateEnvironment(
        _ environment: [String: String],
        path: String,
        issues: inout [String]
    ) {
        for (key, value) in environment {
            if key.range(
                of: environmentKeyPattern,
                options: .regularExpression
            ) == nil {
                issues.append("\(path) key \(key) is not a valid environment variable.")
            }
            if key.range(
                of: secretKeyPattern,
                options: .regularExpression
            ) != nil && !value.contains("${") {
                issues.append(
                    "\(path) appears to contain a secret in \(key); keep secrets out of enmanner/enmanner.json."
                )
            }
        }
    }

    private static func validateEndpoints(
        _ endpoints: [String: EnmannerManifest.Endpoint],
        path: String,
        issues: inout [String]
    ) {
        for (name, endpoint) in endpoints {
            if name.range(
                of: endpointNamePattern,
                options: .regularExpression
            ) == nil {
                issues.append(
                    "\(path) endpoint \(name) must use lowercase letters, digits, and hyphens."
                )
            }
            let host = endpoint.host.lowercased()
            if host != "127.0.0.1" && host != "localhost" && host != "::1" {
                issues.append("\(path).\(name).host must use a loopback host.")
            }
            if endpoint.port.fixed != nil && endpoint.port.preferred != nil {
                issues.append(
                    "\(path).\(name).port may set fixed or preferred, not both."
                )
            }
            if let fixed = endpoint.port.fixed, fixed < 1024 {
                issues.append(
                    "\(path).\(name).port.fixed must be between 1024 and 65535."
                )
            }
            if let preferred = endpoint.port.preferred, preferred < 1024 {
                issues.append(
                    "\(path).\(name).port.preferred must be between 1024 and 65535."
                )
            }
        }
    }

    private static func validateProbe(
        _ probe: EnmannerManifest.Probe,
        component: EnmannerManifest.Component,
        path: String,
        issues: inout [String]
    ) {
        if probe.timeoutSeconds <= 0 || probe.timeoutSeconds > 86_400 {
            issues.append("\(path).timeoutSeconds must be between 1 and 86400.")
        }
        switch probe.type {
        case .http:
            guard let endpointName = probe.endpoint,
                  let endpoint = component.endpoints[endpointName] else {
                issues.append("\(path).endpoint must reference a declared endpoint.")
                return
            }
            if endpoint.protocol != .http && endpoint.protocol != .https {
                issues.append("\(path) HTTP probes require an HTTP or HTTPS endpoint.")
            }
            if probe.command != nil {
                issues.append("\(path).command is valid only for command probes.")
            }
            if probe.success != nil {
                issues.append("\(path).success is valid only for command probes.")
            }
        case .tcp:
            guard let endpointName = probe.endpoint,
                  component.endpoints[endpointName] != nil else {
                issues.append("\(path).endpoint must reference a declared endpoint.")
                return
            }
            if probe.command != nil {
                issues.append("\(path).command is valid only for command probes.")
            }
            if probe.acceptableStatusCodes != nil ||
                probe.contentTypeContains != nil ||
                probe.bodyContains != nil {
                issues.append(
                    "\(path) HTTP response matchers are valid only for HTTP probes."
                )
            }
            if probe.success != nil {
                issues.append("\(path).success is valid only for command probes.")
            }
        case .command:
            guard let command = probe.command else {
                issues.append("\(path).command is required for a command probe.")
                return
            }
            validateCommand(command, path: "\(path).command", issues: &issues)
            if probe.endpoint != nil {
                issues.append("\(path).endpoint is not valid for a command probe.")
            }
            if probe.acceptableStatusCodes != nil ||
                probe.contentTypeContains != nil ||
                probe.bodyContains != nil {
                issues.append(
                    "\(path) HTTP response matchers are valid only for HTTP probes."
                )
            }
        case .process:
            if component.kind == .prerequisite {
                issues.append(
                    "\(path) process probes require an Enmanner-owned task or service."
                )
            }
            if probe.endpoint != nil {
                issues.append("\(path).endpoint is not valid for a process probe.")
            }
            if probe.command != nil {
                issues.append("\(path).command is valid only for command probes.")
            }
            if probe.acceptableStatusCodes != nil ||
                probe.contentTypeContains != nil ||
                probe.bodyContains != nil {
                issues.append(
                    "\(path) HTTP response matchers are valid only for HTTP probes."
                )
            }
            if probe.success != nil {
                issues.append("\(path).success is valid only for command probes.")
            }
            let minimumUptime = probe.minimumUptimeSeconds ?? 2
            if minimumUptime <= 0 || minimumUptime > probe.timeoutSeconds {
                issues.append(
                    "\(path).minimumUptimeSeconds must be greater than 0 and no greater than timeoutSeconds."
                )
            }
        }
        if probe.type != .process && probe.minimumUptimeSeconds != nil {
            issues.append(
                "\(path).minimumUptimeSeconds is valid only for process probes."
            )
        }
        if let statusCodes = probe.acceptableStatusCodes,
           statusCodes.isEmpty ||
            statusCodes.contains(where: { !(100...599).contains($0) }) {
            issues.append(
                "\(path).acceptableStatusCodes must contain HTTP status codes from 100 through 599."
            )
        }
        if probe.contentTypeContains == "" {
            issues.append("\(path).contentTypeContains must not be empty.")
        }
        if probe.bodyContains == "" {
            issues.append("\(path).bodyContains must not be empty.")
        }
        if probe.success?.stdoutEquals != nil &&
            probe.success?.stdoutContains != nil {
            issues.append(
                "\(path).success may set stdoutEquals or stdoutContains, not both."
            )
        }
    }

    private static func validateInterpolation(
        graph: RuntimeGraph,
        projectURL: URL,
        issues: inout [String]
    ) {
        var endpoints: [RuntimePlan.EndpointKey: ResolvedEndpoint] = [:]
        var samplePort: UInt16 = 49152
        for componentName in graph.startupOrder {
            guard let component = graph.components[componentName] else { continue }
            for endpointName in component.endpoints.keys.sorted() {
                guard let endpoint = component.endpoints[endpointName] else { continue }
                endpoints[
                    .init(component: componentName, endpoint: endpointName)
                ] = .init(
                    protocolKind: endpoint.protocol,
                    host: endpoint.host,
                    port: samplePort
                )
                samplePort += 1
            }
        }
        let applicationKey = RuntimePlan.EndpointKey(
            component: graph.applicationComponent,
            endpoint: graph.applicationEndpoint
        )
        guard let applicationEndpoint = endpoints[applicationKey],
              let applicationURL = applicationEndpoint.url(
                path: graph.applicationPath
              ) else {
            return
        }
        let plan = RuntimePlan(
            graph: graph,
            endpoints: endpoints,
            applicationURL: applicationURL
        )

        for componentName in graph.startupOrder {
            guard let component = graph.components[componentName] else { continue }
            var values: [String] = component.command ?? []
            values.append(contentsOf: component.environment.values)
            values.append(contentsOf: component.readiness?.command ?? [])
            values.append(contentsOf: component.completion?.command ?? [])
            values.append(contentsOf: component.check?.command ?? [])
            for value in values {
                do {
                    _ = try ManifestInterpolator.expand(
                        value,
                        componentName: componentName,
                        plan: plan,
                        projectURL: projectURL
                    )
                } catch {
                    issues.append(
                        "component \(componentName) uses an invalid reference in \(value)."
                    )
                }
                for reference in ManifestInterpolator.references(in: value) {
                    if let target = reference.targetComponent,
                       target != componentName,
                       !component.dependsOn.contains(target) {
                        issues.append(
                            "component \(componentName) references \(target) without declaring it in dependsOn."
                        )
                    }
                }
            }
        }
    }

    private static func validateUserConfiguration(
        _ configuration: EnmannerManifest.UserConfiguration,
        projectURL: URL,
        issues: inout [String]
    ) {
        let fileManager = FileManager.default
        if configuration.fields.isEmpty {
            issues.append("userConfiguration.fields must not be empty.")
        }
        if configuration.fields.count > 50 {
            issues.append("userConfiguration.fields may contain at most 50 fields.")
        }

        var keys: Set<String> = []
        for field in configuration.fields {
            if field.key.range(
                of: environmentKeyPattern,
                options: .regularExpression
            ) == nil {
                issues.append(
                    "userConfiguration field key \(field.key) is not a valid environment variable name."
                )
            }
            if !keys.insert(field.key).inserted {
                issues.append(
                    "userConfiguration field key \(field.key) is duplicated."
                )
            }
            if field.label.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty {
                issues.append(
                    "userConfiguration field \(field.key) must have a label."
                )
            }
        }

        do {
            let fileURL = try ProjectPaths.resolve(
                configuration.file,
                inside: projectURL
            )
            if configuration.file.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty {
                issues.append("userConfiguration.file must not be empty.")
            }
            let relativeComponents = URL(
                fileURLWithPath: configuration.file
            ).standardized.pathComponents
            if configuration.file == "enmanner/enmanner.json" ||
                configuration.file == "enmanner.json" ||
                relativeComponents.contains(".enmanner") {
                issues.append(
                    "userConfiguration.file must be a project-owned file outside .enmanner."
                )
            }
            let parentURL = fileURL.deletingLastPathComponent()
            var isDirectory: ObjCBool = false
            if !fileManager.fileExists(
                atPath: parentURL.path,
                isDirectory: &isDirectory
            ) || !isDirectory.boolValue {
                issues.append(
                    "userConfiguration.file parent directory does not exist."
                )
            }
            if fileManager.fileExists(
                atPath: fileURL.path,
                isDirectory: &isDirectory
            ) && isDirectory.boolValue {
                issues.append("userConfiguration.file must not be a directory.")
            }
            if isGitTracked(configuration.file, projectURL: projectURL) {
                issues.append(
                    "userConfiguration.file is tracked by Git; remove it from Git before storing local values."
                )
            }
        } catch {
            issues.append("userConfiguration.file must stay inside the project.")
        }

        if let template = configuration.template {
            if template == configuration.file {
                issues.append(
                    "userConfiguration.template must differ from userConfiguration.file."
                )
            }
            do {
                let templateURL = try ProjectPaths.resolve(
                    template,
                    inside: projectURL
                )
                let templateComponents = URL(
                    fileURLWithPath: template
                ).standardized.pathComponents
                if templateComponents.contains(".enmanner") {
                    issues.append(
                        "userConfiguration.template must be a project-owned file outside .enmanner."
                    )
                }
                var isDirectory: ObjCBool = false
                if !fileManager.fileExists(
                    atPath: templateURL.path,
                    isDirectory: &isDirectory
                ) || isDirectory.boolValue {
                    issues.append(
                        "userConfiguration.template does not exist or is not a file."
                    )
                }
            } catch {
                issues.append(
                    "userConfiguration.template must stay inside the project."
                )
            }
        }
    }

    private static func isGitTracked(
        _ relativePath: String,
        projectURL: URL
    ) -> Bool {
        guard FileManager.default.isExecutableFile(
            atPath: "/usr/bin/git"
        ) else {
            return false
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        process.arguments = [
            "-C", projectURL.path,
            "ls-files", "--error-unmatch", "--", relativePath
        ]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }
}
