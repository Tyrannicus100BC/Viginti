import Darwin
import Foundation
import EnmannerCore

private let jsonLineLock = NSLock()

private actor RuntimeInterruptWaiter {
    private var signal: Int32?
    private var cancelled = false
    private var continuation: CheckedContinuation<Int32?, Never>?

    func record(_ signal: Int32) {
        guard self.signal == nil else { return }
        if let continuation {
            self.continuation = nil
            continuation.resume(returning: signal)
        } else {
            self.signal = signal
        }
    }

    func cancel() {
        cancelled = true
        if let continuation {
            self.continuation = nil
            continuation.resume(returning: nil)
        }
    }

    func wait() async -> Int32? {
        if let signal { return signal }
        if cancelled || Task.isCancelled { return nil }
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                if self.cancelled || Task.isCancelled {
                    continuation.resume(returning: nil)
                } else {
                    self.continuation = continuation
                }
            }
        } onCancel: {
            Task { await self.cancel() }
        }
    }

    var recordedSignal: Int32? {
        signal
    }
}

private actor RuntimeExitRecorder {
    private var exit: RuntimeSupervisor.ComponentExit?

    func record(_ exit: RuntimeSupervisor.ComponentExit) {
        self.exit = self.exit ?? exit
    }

    var recordedExit: RuntimeSupervisor.ComponentExit? {
        exit
    }
}

private enum RuntimeValidationOutcome {
    case launched(RuntimeSupervisor.Launch)
    case interrupted(Int32)
    case cancelledSignalWait
}

private struct RuntimeReport: Codable {
    struct Startup: Codable {
        let readinessURL: String
        let readinessPassed: Bool
        let soakSeconds: Double
        let soakPassed: Bool
        let componentProcessIdentifiers: [String: Int32]
    }

    struct Shutdown: Codable {
        let supervisorExited: Bool
        let processGroupsStopped: Bool
        let applicationEndpointUnavailable: Bool
        let ownedPortsReleased: Bool
        let nonLoopbackListeners: [String]
        let remainingProcesses: [String]
    }

    let applicationPort: UInt16
    let selectedPorts: [String: UInt16]
    let ownedPorts: [String: UInt16]
    let observedPorts: [String: UInt16]
    let startup: Startup
    let shutdown: Shutdown
    let gitStatusMutations: [String]
    let interrupted: Bool
    let interruptSignal: Int32?

    var passed: Bool {
        !interrupted && startup.readinessPassed && startup.soakPassed &&
            shutdown.supervisorExited && shutdown.processGroupsStopped &&
            shutdown.applicationEndpointUnavailable &&
            shutdown.ownedPortsReleased &&
            shutdown.nonLoopbackListeners.isEmpty &&
            shutdown.remainingProcesses.isEmpty
    }
}

private struct ValidationReport: Codable {
    let valid: Bool
    let project: String
    let resolvedExecutable: String
    let arguments: [String]
    let workingDirectory: String
    let effectivePath: String
    let envFileLoading: String
    let swiftVersion: String
    let modernIconToolingAvailable: Bool
    let warnings: [String]
    let runtime: RuntimeReport?
    let doctor: DoctorReport?
}

private struct DoctorReport: Codable {
    struct Recommendation: Codable {
        let id: String
        let message: String
        let evidence: [String]
        let suggestedChange: String
    }

    struct InstallationHistory: Codable {
        let initialManifestStatus: String?
    }

    struct CurrentStatus: Codable {
        let configuration: String
        let integration: String
    }

    struct CompletionEvidence: Codable {
        let manifestValid: Bool
        let installationProvenance: Bool
        let managedAgentGuidance: Bool
        let managedGitignore: Bool
        let iconConfigured: Bool
        let iconSourceExists: Bool
        let appBuilt: Bool
        let appOwnershipMatches: Bool
        let developmentAppBuilt: Bool
        let developmentAppOwnershipMatches: Bool
        let developmentNativeLaunchVerified: Bool
        let nativeLaunchVerified: Bool
    }

    struct Milestones: Codable {
        let installed: Bool
        let configured: Bool
        let lifecycleVerified: Bool
        let developmentNativeVerified: Bool
        let presentationReady: Bool
        let finalNativeVerified: Bool
        let repositoryReady: Bool
    }

    struct Disk: Codable {
        let status: String
        let availableBytes: UInt64
        let frameworkBuildCacheBytes: UInt64
        let cleanupCommand: String
        let externalStatePolicy: String
    }

    struct Workspace: Codable {
        let status: String
        let projectGitRoot: String?
        let nestedRepositoryCount: Int
        let manifestTracked: Bool
        let frameworkTracked: Bool
        let durablePathsTracked: Bool
        let modifiedFrameworkPaths: [String]
        let addedFrameworkPaths: [String]
        let missingFrameworkPaths: [String]
        let uncommittedDurablePaths: [String]
        let unversionedAcknowledged: Bool
        let recommendation: String?
    }

    let complete: Bool
    let localIntegrationComplete: Bool
    let milestones: Milestones
    let installationHistory: InstallationHistory
    let currentStatus: CurrentStatus
    @available(*, deprecated, message: "Use currentStatus.configuration.")
    let currentConfigurationStatus: String
    @available(*, deprecated, message: "Use currentStatus.integration.")
    let integrationStatus: String
    let installationRecordPresent: Bool
    let installationVersion: String?
    @available(*, deprecated, message: "Use installationHistory.initialManifestStatus.")
    let initialManifestStatus: String?
    @available(*, deprecated, message: "Use installationHistory.initialManifestStatus.")
    let installationManifestStatus: String?
    let staleDraftManifest: Bool
    let iconConfigured: Bool
    let iconPath: String?
    let iconSourceExists: Bool
    let appPath: String
    let appExists: Bool
    let appOwnershipMatches: Bool
    let developmentAppPath: String
    let developmentAppExists: Bool
    let developmentAppOwnershipMatches: Bool
    let agentsManagedSectionPresent: Bool
    let gitignoreManagedSectionPresent: Bool
    let otherAgentInstructions: [String]
    let agentInstructions: [String: String]
    let disk: Disk
    let workspace: Workspace
    let completionEvidence: CompletionEvidence
    let recommendations: [Recommendation]
}

private struct ErrorReport: Encodable {
    struct Diagnostic: Encodable {
        let code: String
        let path: String?
        let message: String
        let runtimeFailure: RuntimeFailure?
    }

    let valid = false
    let error: Diagnostic
}

@main
struct EnmannerValidatorCommand {
    static func main() async {
        let json = CommandLine.arguments.contains("--json")
        let jsonLines = CommandLine.arguments.contains("--json-lines")
        if json && jsonLines {
            FileHandle.standardError.write(
                Data("Error: --json and --json-lines are mutually exclusive.\n".utf8)
            )
            Foundation.exit(64)
        }
        do {
            try await run(json: json, jsonLines: jsonLines)
        } catch {
            if json || jsonLines {
                let enmannerError = error as? EnmannerError
                let report = ErrorReport(
                    error: .init(
                        code: enmannerError?.diagnosticCode ?? "unexpectedError",
                        path: enmannerError?.diagnosticPath,
                        message: error.localizedDescription,
                        runtimeFailure: enmannerError?.runtimeFailure
                    )
                )
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.sortedKeys]
                if let data = try? encoder.encode(report),
                   let output = String(data: data, encoding: .utf8) {
                    if jsonLines,
                       let object = try? JSONSerialization.jsonObject(with: data) {
                        printJSONLine(event: "error", fields: ["report": object])
                    } else {
                        print(output)
                    }
                }
            } else {
                FileHandle.standardError.write(
                    Data(("Error: \(error.localizedDescription)\n").utf8)
                )
            }
            Foundation.exit(1)
        }
    }

    private static func run(json: Bool, jsonLines: Bool) async throws {
        let arguments = Array(CommandLine.arguments.dropFirst())
        let projectPath = value(after: "--project", in: arguments) ??
            FileManager.default.currentDirectoryPath
        let runtime = arguments.contains("--runtime")
        let runtimeSoakSeconds = Double(
            value(after: "--runtime-soak-seconds", in: arguments) ?? "5"
        ) ?? -1
        if runtime && !(0...300).contains(runtimeSoakSeconds) {
            throw EnmannerError.processLaunchFailed(
                "--runtime-soak-seconds must be between 0 and 300."
            )
        }
        let doctor = arguments.contains("--doctor")
        let next = arguments.contains("--next")
        if next && (!doctor || json || jsonLines || runtime) {
            throw EnmannerError.processLaunchFailed(
                "--next requires --doctor and plain, non-runtime output."
            )
        }
        let printField = value(after: "--print", in: arguments)
        let projectURL = URL(fileURLWithPath: projectPath, isDirectory: true)
            .standardizedFileURL
        let manifestURL = ProjectPaths.manifestURL(forProjectURL: projectURL)
        let manifest = try ManifestLoader.load(from: manifestURL)
        let issues = ManifestValidator.validate(manifest, projectURL: projectURL)
        guard issues.isEmpty else {
            throw EnmannerError.invalidManifest(issues)
        }
        let modernIconToolingAvailable = !processOutput(
            executable: "/usr/bin/xcrun",
            arguments: ["--find", "actool"]
        ).isEmpty

        if let printField {
            switch printField {
            case "name": print(manifest.name)
            case "identifier": print(manifest.identifier)
            case "icon":
                print(
                    manifest.icon?.selectedPath(
                        modernToolingAvailable: modernIconToolingAvailable
                    ) ?? ""
                )
            case "icon-modern": print(manifest.icon?.modern ?? "")
            case "icon-legacy": print(manifest.icon?.legacy ?? "")
            case "readiness-timeout":
                let graph = try RuntimeGraph.make(from: manifest)
                print(
                    graph.components[graph.applicationComponent]?
                        .readiness?.timeoutSeconds ?? 30
                )
            case "managed-components":
                let graph = try RuntimeGraph.make(from: manifest)
                print(
                    graph.startupOrder.filter {
                        graph.components[$0]?.kind != .prerequisite
                    }.joined(separator: ", ")
                )
            case "prerequisites":
                let graph = try RuntimeGraph.make(from: manifest)
                print(
                    graph.startupOrder.filter {
                        graph.components[$0]?.kind == .prerequisite
                    }.joined(separator: ", ")
                )
            default:
                throw EnmannerError.invalidManifest(
                    ["Unknown build field \(printField)."]
                )
            }
            return
        }

        let diagnosticPlan = try RuntimePlan.make(manifest: manifest)
        guard let applicationComponent = diagnosticPlan.graph.components[
            diagnosticPlan.graph.applicationComponent
        ] else {
            throw EnmannerError.invalidManifest([
                "application component could not be resolved."
            ])
        }
        let configuration = try ProcessConfigurationBuilder.make(
            componentName: diagnosticPlan.graph.applicationComponent,
            component: applicationComponent,
            plan: diagnosticPlan,
            projectURL: projectURL
        )
        let runtimeReport = runtime
            ? try await validateRuntime(
                manifest: manifest,
                projectURL: projectURL,
                jsonLines: jsonLines,
                soakSeconds: runtimeSoakSeconds
            )
            : nil
        let doctorReport = doctor
            ? inspectProject(manifest: manifest, projectURL: projectURL)
            : nil
        if next, let doctorReport {
            printNextBrief(
                manifest: manifest,
                projectURL: projectURL,
                report: doctorReport,
                graph: diagnosticPlan.graph
            )
            return
        }
        var warnings = !diagnosticPlan.graph.applicationHasStablePort
            ? ["application endpoint has no preferred port; origin-scoped state may move between launches"]
            : []
        if doctorReport?.staleDraftManifest == true {
            warnings.append(
                "enmanner/enmanner.json.example remains beside the live manifest; remove the stale draft when it is no longer needed"
            )
        }
        if let agentInstructions = doctorReport?.agentInstructions,
           agentInstructions.values.contains("needsMirroring") {
            warnings.append(
                "other agent instruction files exist; mirror Enmanner guidance there when one is authoritative"
            )
        }
        if let disk = doctorReport?.disk, disk.status != "healthy" {
            warnings.append(
                "project filesystem disk space is \(disk.status); " +
                "\(disk.availableBytes) bytes remain and the Enmanner build " +
                "cache uses \(disk.frameworkBuildCacheBytes) bytes"
            )
        }
        if let doctorReport,
           !doctorReport.milestones.repositoryReady {
            warnings.append(
                doctorReport.workspace.recommendation ??
                    "enmanner/enmanner.json is not tracked by the project workspace"
            )
        }
        warnings.append(contentsOf: dotenvEnvironmentWarnings(
            manifest: manifest,
            projectURL: projectURL
        ))
        let report = ValidationReport(
            valid: runtimeReport?.passed ?? true,
            project: projectURL.path,
            resolvedExecutable: configuration.executableURL.path,
            arguments: configuration.arguments,
            workingDirectory: configuration.workingDirectoryURL.path,
            effectivePath: configuration.environment["PATH", default: ""],
            envFileLoading: "project-managed",
            swiftVersion: processOutput(
                executable: "/usr/bin/xcrun",
                arguments: ["swift", "--version"]
            ).trimmingCharacters(in: .whitespacesAndNewlines),
            modernIconToolingAvailable: modernIconToolingAvailable,
            warnings: warnings,
            runtime: runtimeReport,
            doctor: doctorReport
        )

        if json || jsonLines {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(report)
            if jsonLines,
               let object = try? JSONSerialization.jsonObject(with: data) {
                printJSONLine(event: "complete", fields: ["report": object])
            } else {
                print(String(data: data, encoding: .utf8)!)
            }
        } else {
            print("✓ enmanner/enmanner.json is valid")
            print("✓ configured paths stay inside the project")
            print("✓ readiness is limited to loopback")
            print("✓ no obvious secrets or global-install flags were found")
            print("✓ executable resolves to \(configuration.executableURL.path)")
            print("  Effective GUI PATH: \(report.effectivePath)")
            print("  .env loading: project-managed (Enmanner does not load it)")
            report.warnings.forEach { print("! \($0)") }
            if let doctorReport {
                printDoctorReport(doctorReport)
            }
            if let runtimeReport {
                printRuntimeReport(runtimeReport)
            }
        }

        if let runtimeReport, !runtimeReport.passed {
            if json || jsonLines {
                Foundation.exit(1)
            }
            throw EnmannerError.processLaunchFailed(
                "Shutdown postconditions failed; inspect the runtime report."
            )
        }
    }

    private static func inspectProject(
        manifest: EnmannerManifest,
        projectURL: URL
    ) -> DoctorReport {
        let fileManager = FileManager.default
        let graph = try? RuntimeGraph.make(from: manifest)
        var stableEndpoints: [String] = []
        if let graph {
            for (componentName, component) in graph.components {
                for (endpointName, endpoint) in component.endpoints
                    where endpoint.port.fixed != nil ||
                        endpoint.port.preferred != nil {
                    stableEndpoints.append("\(componentName).\(endpointName)")
                }
            }
        }
        stableEndpoints.sort()
        var statefulEvidence = statefulProjectPaths(
            projectURL: projectURL,
            fileManager: fileManager
        )
        if manifest.backup != nil {
            statefulEvidence.append("project-declared backup command")
        }
        let recommendations: [DoctorReport.Recommendation]
        if manifest.launchGuard == nil &&
            !stableEndpoints.isEmpty && !statefulEvidence.isEmpty {
            recommendations = [.init(
                id: "considerLaunchGuard",
                message:
                    "This project has local state and stable endpoints but no launch guard.",
                evidence: statefulEvidence + stableEndpoints.map {
                    "stable endpoint \($0)"
                },
                suggestedChange:
                    "Review .enmanner/instructions/persistence.md and declare only the stable endpoints or data paths that reliably identify a competing project runtime."
            )]
        } else {
            recommendations = []
        }
        let installationURL = projectURL
            .appendingPathComponent(".enmanner/INSTALLATION.json")
        let installation = jsonObject(at: installationURL)
        let modernIconToolingAvailable = !processOutput(
            executable: "/usr/bin/xcrun",
            arguments: ["--find", "actool"]
        ).isEmpty
        let selectedIconPath = manifest.icon?.selectedPath(
            modernToolingAvailable: modernIconToolingAvailable
        )
        let iconURL = selectedIconPath.map {
            projectURL.appendingPathComponent($0)
        }
        let appURL = projectURL.appendingPathComponent("\(manifest.name).app")
        let developmentAppURL = projectURL.appendingPathComponent(
            "\(manifest.name) Development.app"
        )
        let appExecutableURL = appURL.appendingPathComponent(
            "Contents/MacOS/EnmannerLauncher"
        )
        let developmentAppExecutableURL = developmentAppURL.appendingPathComponent(
            "Contents/MacOS/EnmannerLauncher"
        )
        let ownershipURL = appURL.appendingPathComponent(
            "Contents/Resources/EnmannerOwnership.plist"
        )
        let ownership = plistObject(at: ownershipURL)
        let developmentOwnership = plistObject(
            at: developmentAppURL.appendingPathComponent(
                "Contents/Resources/EnmannerOwnership.plist"
            )
        )
        let agentsText = text(at: projectURL.appendingPathComponent("AGENTS.md"))
        let gitignoreText = text(at: projectURL.appendingPathComponent(".gitignore"))
        let installationRecordPresent = installation != nil
        let staleDraftManifest = fileManager.fileExists(
            atPath: projectURL.appendingPathComponent(
                "enmanner/enmanner.json.example"
            ).path
        )
        let iconSourceExists = iconURL.map {
            fileManager.fileExists(atPath: $0.path)
        } ?? false
        let appExists = fileManager.fileExists(atPath: appURL.path)
        let appOwnershipMatches =
            ownership?["bundleIdentifier"] as? String == manifest.identifier &&
            ownership?["buildKind"] as? String == "final"
        let developmentBundleIdentifier = "\(manifest.identifier).development"
        let developmentAppExists = fileManager.fileExists(
            atPath: developmentAppURL.path
        )
        let developmentAppOwnershipMatches =
            developmentOwnership?["bundleIdentifier"] as? String ==
                developmentBundleIdentifier &&
            developmentOwnership?["manifestBundleIdentifier"] as? String ==
                manifest.identifier &&
            developmentOwnership?["buildKind"] as? String == "development"
        let agentsManagedSectionPresent =
            agentsText?.contains("<!-- enmanner:begin -->") == true &&
            agentsText?.contains("<!-- enmanner:end -->") == true
        let gitignoreManagedSectionPresent =
            gitignoreText?.contains("# enmanner:begin") == true &&
            gitignoreText?.contains("# enmanner:end") == true
        let otherAgentInstructions = [
            "CLAUDE.md",
            "GEMINI.md",
            ".github/copilot-instructions.md"
        ].filter {
            fileManager.fileExists(
                atPath: projectURL.appendingPathComponent($0).path
            )
        } + (
            fileManager.fileExists(
                atPath: projectURL.appendingPathComponent(".cursor/rules").path
            ) ? [".cursor/rules/"] : []
        )
        var agentInstructions: [String: String] = [
            "AGENTS.md": agentsManagedSectionPresent ? "managed" : "missingManagedSection"
        ]
        for path in otherAgentInstructions {
            let managed: Bool
            if path == ".cursor/rules/" {
                let directoryURL = projectURL.appendingPathComponent(path)
                let files = (
                    try? fileManager.contentsOfDirectory(
                        at: directoryURL,
                        includingPropertiesForKeys: nil
                    )
                ) ?? []
                managed = files.contains {
                    text(at: $0)?.contains("<!-- enmanner:begin -->") == true &&
                        text(at: $0)?.contains("<!-- enmanner:end -->") == true
                }
            } else {
                let content = text(at: projectURL.appendingPathComponent(path))
                managed = content?.contains("<!-- enmanner:begin -->") == true &&
                    content?.contains("<!-- enmanner:end -->") == true
            }
            agentInstructions[path] = managed ? "managed" : "needsMirroring"
        }
        let launchReceipt = jsonObject(
            at: projectURL.appendingPathComponent(
                ".enmanner/.build/app-test.json"
            )
        )
        let developmentLaunchReceipt = jsonObject(
            at: projectURL.appendingPathComponent(
                ".enmanner/.build/development-app-test.json"
            )
        )
        let appModificationDate = (
            try? fileManager.attributesOfItem(atPath: appURL.path)[
                .modificationDate
            ] as? Date
        ) ?? nil
        let nativeLaunchVerified =
            launchReceipt?["valid"] as? Bool == true &&
            launchReceipt?["buildKind"] as? String == "final" &&
            launchReceipt?["bundleIdentifier"] as? String == manifest.identifier &&
            launchReceipt?["manifestBundleIdentifier"] as? String ==
                manifest.identifier &&
            launchReceipt?["appModificationEpoch"] as? Int ==
                appModificationDate.map { Int($0.timeIntervalSince1970) } &&
            launchReceipt?["appExecutableSHA256"] as? String ==
                processOutput(
                    executable: "/usr/bin/shasum",
                    arguments: ["-a", "256", appExecutableURL.path]
                ).split(whereSeparator: \.isWhitespace).first.map(String.init)
        let developmentAppModificationDate = (
            try? fileManager.attributesOfItem(atPath: developmentAppURL.path)[
                .modificationDate
            ] as? Date
        ) ?? nil
        let developmentNativeLaunchVerified =
            developmentLaunchReceipt?["valid"] as? Bool == true &&
            developmentLaunchReceipt?["buildKind"] as? String == "development" &&
            developmentLaunchReceipt?["bundleIdentifier"] as? String ==
                developmentBundleIdentifier &&
            developmentLaunchReceipt?["manifestBundleIdentifier"] as? String ==
                manifest.identifier &&
            developmentLaunchReceipt?["appModificationEpoch"] as? Int ==
                developmentAppModificationDate.map { Int($0.timeIntervalSince1970) } &&
            developmentLaunchReceipt?["appExecutableSHA256"] as? String ==
                processOutput(
                    executable: "/usr/bin/shasum",
                    arguments: ["-a", "256", developmentAppExecutableURL.path]
                ).split(whereSeparator: \.isWhitespace).first.map(String.init)
        let completionEvidence = DoctorReport.CompletionEvidence(
            manifestValid: true,
            installationProvenance: installationRecordPresent,
            managedAgentGuidance: agentsManagedSectionPresent,
            managedGitignore: gitignoreManagedSectionPresent,
            iconConfigured: manifest.icon != nil,
            iconSourceExists: iconSourceExists,
            appBuilt: appExists,
            appOwnershipMatches: appOwnershipMatches,
            developmentAppBuilt: developmentAppExists,
            developmentAppOwnershipMatches: developmentAppOwnershipMatches,
            developmentNativeLaunchVerified: developmentNativeLaunchVerified,
            nativeLaunchVerified: nativeLaunchVerified
        )
        let localIntegrationComplete =
            installationRecordPresent &&
            !staleDraftManifest &&
            manifest.icon != nil &&
            iconSourceExists &&
            appExists &&
            appOwnershipMatches &&
            agentsManagedSectionPresent &&
            gitignoreManagedSectionPresent &&
            nativeLaunchVerified
        let fileSystemAttributes = (
            try? fileManager.attributesOfFileSystem(
                forPath: projectURL.path
            )
        ) ?? [:]
        let availableBytes = (
            fileSystemAttributes[.systemFreeSize] as? NSNumber
        )?.uint64Value ?? 0
        let buildCacheBytes = allocatedSize(
            at: projectURL.appendingPathComponent(
                ".enmanner/framework/.build"
            )
        )
        let diskStatus: String
        if availableBytes < 1_073_741_824 {
            diskStatus = "critical"
        } else if availableBytes < 5_368_709_120 {
            diskStatus = "warning"
        } else {
            diskStatus = "healthy"
        }
        let gitRootOutput = processOutput(
            executable: "/usr/bin/git",
            arguments: [
                "-C", projectURL.path, "rev-parse", "--show-toplevel"
            ]
        ).trimmingCharacters(in: .whitespacesAndNewlines)
        let projectGitRoot = gitRootOutput.isEmpty ? nil : gitRootOutput
        func gitTracks(_ path: String) -> Bool {
            !processOutput(
                executable: "/usr/bin/git",
                arguments: [
                    "-C", projectURL.path, "ls-files", "--error-unmatch",
                    "--", path
                ]
            ).isEmpty
        }
        let manifestTracked = gitTracks("enmanner/enmanner.json")
        let receiptPaths = (installation?["files"] as? [[String: Any]] ?? [])
            .compactMap { $0["path"] as? String }
            .map { ".enmanner/\($0)" } + [".enmanner/INSTALLATION.json"]
        func gitStatus(_ path: String) -> String {
            if gitTracks(path) {
                return processOutput(
                    executable: "/usr/bin/git",
                    arguments: [
                        "-C", projectURL.path, "diff", "--name-only",
                        "--", path
                    ]
                ).trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return processOutput(
                executable: "/usr/bin/git",
                arguments: [
                    "-C", projectURL.path, "ls-files", "--others",
                    "--exclude-standard", "--", path
                ]
            ).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let existingReceiptPaths = receiptPaths.filter {
            fileManager.fileExists(
                atPath: projectURL.appendingPathComponent($0).path
            )
        }
        let missingFrameworkPaths = receiptPaths.filter {
            !fileManager.fileExists(
                atPath: projectURL.appendingPathComponent($0).path
            )
        }.sorted()
        let addedFrameworkPaths = existingReceiptPaths.filter {
            !gitTracks($0)
        }.sorted()
        let modifiedFrameworkPaths = existingReceiptPaths.filter {
            gitTracks($0) && !gitStatus($0).isEmpty
        }.sorted()
        let frameworkTracked =
            projectGitRoot != nil &&
            installationRecordPresent &&
            addedFrameworkPaths.isEmpty &&
            missingFrameworkPaths.isEmpty &&
            modifiedFrameworkPaths.isEmpty
        let iconTracked = selectedIconPath.map(gitTracks) ?? false
        let durableCandidates = receiptPaths + [
            "enmanner/enmanner.json", "AGENTS.md", ".gitignore"
        ] + (selectedIconPath.map { [$0] } ?? [])
        let uncommittedDurablePaths = Array(Set(durableCandidates.filter {
            !gitStatus($0).isEmpty
        })).sorted()
        let durablePathsTracked =
            projectGitRoot != nil &&
            manifestTracked &&
            frameworkTracked &&
            gitTracks("AGENTS.md") &&
            gitTracks(".gitignore") &&
            (manifest.icon == nil || iconTracked) &&
            uncommittedDurablePaths.isEmpty
        let unversionedAcknowledged =
            installation?["unversionedAcknowledged"] as? Bool == true
        let repositoryReady =
            durablePathsTracked ||
            (projectGitRoot == nil && unversionedAcknowledged)
        let nestedRepositoryCount = nestedRepositoryCount(
            inside: projectURL
        )
        let workspaceStatus: String
        let workspaceRecommendation: String?
        if durablePathsTracked {
            workspaceStatus = "tracked"
            workspaceRecommendation = nil
        } else if projectGitRoot == nil && unversionedAcknowledged {
            workspaceStatus = "acknowledgedUnversioned"
            workspaceRecommendation = nil
        } else if projectGitRoot != nil {
            if !manifestTracked {
                workspaceStatus = "manifestUntracked"
                workspaceRecommendation =
                    "Track enmanner/enmanner.json and the durable Enmanner integration files in the repository that owns this project."
            } else if !missingFrameworkPaths.isEmpty {
                workspaceStatus = "frameworkFilesMissing"
                workspaceRecommendation = "Restore the missing framework files: " +
                    missingFrameworkPaths.joined(separator: ", ")
            } else if !addedFrameworkPaths.isEmpty || !modifiedFrameworkPaths.isEmpty {
                workspaceStatus = "frameworkChangesAwaitingCommit"
                workspaceRecommendation =
                    "Upgrade locally complete; record these framework changes: " +
                    (addedFrameworkPaths + modifiedFrameworkPaths)
                    .joined(separator: ", ")
            } else if !frameworkTracked {
                workspaceStatus = "frameworkNotRecorded"
                workspaceRecommendation =
                    "Record the receipt-listed .enmanner framework distribution."
            } else {
                workspaceStatus = "integrationFilesUntracked"
                workspaceRecommendation =
                    "Track the configured icon and managed AGENTS.md and .gitignore files."
            }
        } else if nestedRepositoryCount > 0 {
            workspaceStatus = "unversionedRootWithNestedRepositories"
            workspaceRecommendation =
                "The workspace root is unversioned; initialize version control there or run ./.enmanner/scripts/record-durability --unversioned."
        } else {
            workspaceStatus = "unversioned"
            workspaceRecommendation =
                "Initialize version control for the project, or run ./.enmanner/scripts/record-durability --unversioned."
        }
        let complete = localIntegrationComplete && repositoryReady
        let integrationStatus: String
        if complete {
            integrationStatus = "complete"
        } else if localIntegrationComplete {
            integrationStatus = "repositoryRecordingRequired"
        } else if !installationRecordPresent {
            integrationStatus = "installationProvenanceRequired"
        } else if manifest.icon == nil || !iconSourceExists {
            integrationStatus = "iconRequired"
        } else if !appExists {
            integrationStatus = "appBuildRequired"
        } else if !nativeLaunchVerified {
            integrationStatus = "nativeLaunchVerificationRequired"
        } else {
            integrationStatus = "incomplete"
        }
        let milestones = DoctorReport.Milestones(
            installed: installationRecordPresent,
            configured: true,
            lifecycleVerified:
                developmentNativeLaunchVerified || nativeLaunchVerified,
            developmentNativeVerified: developmentNativeLaunchVerified,
            presentationReady: manifest.icon != nil && iconSourceExists,
            finalNativeVerified:
                appExists && appOwnershipMatches && nativeLaunchVerified,
            repositoryReady: repositoryReady
        )

        return DoctorReport(
            complete: complete,
            localIntegrationComplete: localIntegrationComplete,
            milestones: milestones,
            installationHistory: DoctorReport.InstallationHistory(
                initialManifestStatus: installation?["manifestStatus"] as? String
            ),
            currentStatus: DoctorReport.CurrentStatus(
                configuration: "valid",
                integration: integrationStatus
            ),
            currentConfigurationStatus: "valid",
            integrationStatus: integrationStatus,
            installationRecordPresent: installationRecordPresent,
            installationVersion: installation?["version"] as? String,
            initialManifestStatus: installation?["manifestStatus"] as? String,
            installationManifestStatus: installation?["manifestStatus"] as? String,
            staleDraftManifest: staleDraftManifest,
            iconConfigured: manifest.icon != nil,
            iconPath: selectedIconPath,
            iconSourceExists: iconSourceExists,
            appPath: appURL.path,
            appExists: appExists,
            appOwnershipMatches: appOwnershipMatches,
            developmentAppPath: developmentAppURL.path,
            developmentAppExists: developmentAppExists,
            developmentAppOwnershipMatches: developmentAppOwnershipMatches,
            agentsManagedSectionPresent: agentsManagedSectionPresent,
            gitignoreManagedSectionPresent: gitignoreManagedSectionPresent,
            otherAgentInstructions: otherAgentInstructions,
            agentInstructions: agentInstructions,
            disk: .init(
                status: diskStatus,
                availableBytes: availableBytes,
                frameworkBuildCacheBytes: buildCacheBytes,
                cleanupCommand: "./.enmanner/scripts/clean",
                externalStatePolicy:
                    "Enmanner never removes Docker data or project-owned state."
            ),
            workspace: .init(
                status: workspaceStatus,
                projectGitRoot: projectGitRoot,
                nestedRepositoryCount: nestedRepositoryCount,
                manifestTracked: manifestTracked,
                frameworkTracked: frameworkTracked,
                durablePathsTracked: durablePathsTracked,
                modifiedFrameworkPaths: modifiedFrameworkPaths,
                addedFrameworkPaths: addedFrameworkPaths,
                missingFrameworkPaths: missingFrameworkPaths,
                uncommittedDurablePaths: uncommittedDurablePaths,
                unversionedAcknowledged: unversionedAcknowledged,
                recommendation: workspaceRecommendation
            ),
            completionEvidence: completionEvidence,
            recommendations: recommendations
        )
    }

    private static func printNextBrief(
        manifest: EnmannerManifest,
        projectURL: URL,
        report: DoctorReport,
        graph: RuntimeGraph
    ) {
        let package = jsonObject(
            at: projectURL.appendingPathComponent("package.json")
        )
        let dependencies = (package?["dependencies"] as? [String: Any] ?? [:])
            .merging(
                package?["devDependencies"] as? [String: Any] ?? [:]
            ) { current, _ in current }
        let stack: String
        if dependencies["express"] != nil {
            stack = "Express"
        } else if dependencies["vite"] != nil {
            stack = "Vite"
        } else if dependencies["next"] != nil {
            stack = "Next.js"
        } else {
            stack = "project-defined"
        }
        print("# Enmanner next steps")
        print("")
        print("**Project:** \(manifest.name)")
        print("**Runtime:** \(graph.components.count == 1 ? "one \(stack) service" : "\(graph.components.count) project-defined components")")
        print("**Presentation:** default browser")
        print("")
        print("## Current evidence")
        print("")
        print("- Configuration valid: yes")
        print("- Lifecycle verified: \(report.milestones.lifecycleVerified ? "yes" : "no")")
        print("- Development launcher verified: \(report.milestones.developmentNativeVerified ? "yes" : "no")")
        print("- Release presentation ready: \(report.milestones.presentationReady ? "yes" : "no")")
        print("- Final application verified: \(report.milestones.finalNativeVerified ? "yes" : "no")")
        print("- Repository ready: \(report.milestones.repositoryReady ? "yes" : "no")")
        print("")
        print("## Next actions")
        print("")
        if !report.milestones.lifecycleVerified {
            print("1. Review project state ownership, then run `./.enmanner/scripts/validate --runtime --json`.")
            print("2. Run `./.enmanner/scripts/build-app --development` and `./.enmanner/scripts/test-app --development` if native proof is needed before icon work.")
        }
        if !report.milestones.presentationReady {
            print("1. Create and inspect the configured icon with `./.enmanner/scripts/preview-icon`.")
        }
        if !report.milestones.finalNativeVerified {
            print("1. Run `./.enmanner/scripts/build-app`, then `./.enmanner/scripts/test-app`.")
        }
        if !report.milestones.repositoryReady {
            print("1. Record the durable `enmanner/`, `.enmanner/`, `AGENTS.md`, and `.gitignore` integration files in the owning repository; Enmanner will not stage them.")
        }
        if report.complete {
            if report.recommendations.isEmpty {
                print("No integration work remains.")
            } else {
                print("No required integration work remains; review the advisory safety recommendation below.")
            }
        }
        if !report.recommendations.isEmpty {
            print("")
            print("## Advisory safety")
            print("")
            for recommendation in report.recommendations {
                print("- \(recommendation.message)")
                print("  Evidence: \(recommendation.evidence.joined(separator: ", ")).")
                print("  Suggested change: \(recommendation.suggestedChange)")
            }
        }
        print("")
        print("## Relevant guidance")
        print("")
        print("- `.enmanner/instructions/development-server.md` — runtime ownership, loopback networking, readiness, and shutdown.")
        if manifest.userConfiguration != nil {
            print("- `.enmanner/instructions/security.md` — declared local settings and secret handling.")
        }
        if !report.milestones.presentationReady {
            print("- `.enmanner/instructions/icon.md` — final icon preflight and acceptance.")
        }
        if graph.components.count > 1 {
            print("- `.enmanner/enmanner.schema.json` and the manifest reference — component graph fields.")
        }
    }

    private static func jsonObject(at url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) else {
            return nil
        }
        return object as? [String: Any]
    }

    private static func statefulProjectPaths(
        projectURL: URL,
        fileManager: FileManager
    ) -> [String] {
        let resolvedProjectURL = projectURL.standardizedFileURL
            .resolvingSymlinksInPath()
        var projectPathAliases = [resolvedProjectURL.path, projectURL.path]
        projectPathAliases.append(contentsOf: projectPathAliases
            .filter { !$0.hasPrefix("/private/") }
            .map { "/private" + $0 })
        guard let enumerator = fileManager.enumerator(
            at: resolvedProjectURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles, .skipsPackageDescendants]
        ) else {
            return []
        }
        var paths: [String] = []
        for case let url as URL in enumerator {
            guard let projectPath = projectPathAliases.first(where: {
                url.path.hasPrefix($0 + "/")
            }) else {
                continue
            }
            let relative = String(url.path.dropFirst(projectPath.count + 1))
            let components = relative.split(separator: "/")
            if components.count > 3 {
                if (try? url.resourceValues(forKeys: [.isDirectoryKey]))?
                    .isDirectory == true {
                    enumerator.skipDescendants()
                }
                continue
            }
            if ["node_modules", ".build"].contains(String(components.last ?? "")) {
                enumerator.skipDescendants()
                continue
            }
            guard ["sqlite", "sqlite3", "db"].contains(
                url.pathExtension.lowercased()
            ) else {
                continue
            }
            paths.append(relative)
            if paths.count == 5 { break }
        }
        return paths.sorted()
    }

    private static func allocatedSize(at url: URL) -> UInt64 {
        let keys: Set<URLResourceKey> = [
            .isRegularFileKey,
            .totalFileAllocatedSizeKey,
            .fileAllocatedSizeKey
        ]
        guard let enumerator = FileManager.default.enumerator(
            at: url,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsPackageDescendants],
            errorHandler: { _, _ in true }
        ) else {
            return 0
        }
        var total: UInt64 = 0
        for case let fileURL as URL in enumerator {
            guard let values = try? fileURL.resourceValues(forKeys: keys),
                  values.isRegularFile == true else {
                continue
            }
            total += UInt64(
                values.totalFileAllocatedSize ??
                    values.fileAllocatedSize ??
                    0
            )
        }
        return total
    }

    private static func nestedRepositoryCount(inside projectURL: URL) -> Int {
        let keys: Set<URLResourceKey> = [.isDirectoryKey]
        guard let enumerator = FileManager.default.enumerator(
            at: projectURL,
            includingPropertiesForKeys: Array(keys),
            options: [],
            errorHandler: { _, _ in true }
        ) else {
            return 0
        }
        var count = 0
        for case let url as URL in enumerator {
            let relative = url.path.replacingOccurrences(
                of: projectURL.path + "/",
                with: ""
            )
            let depth = relative.split(separator: "/").count
            let name = url.lastPathComponent
            if name == "node_modules" || name == ".enmanner" ||
                name == ".build" || depth > 5 {
                enumerator.skipDescendants()
                continue
            }
            if name == ".git" {
                if url.deletingLastPathComponent().standardizedFileURL !=
                    projectURL.standardizedFileURL {
                    count += 1
                }
                enumerator.skipDescendants()
            }
        }
        return count
    }

    private static func plistObject(at url: URL) -> [String: Any]? {
        guard let data = try? Data(contentsOf: url),
              let object = try? PropertyListSerialization.propertyList(
                from: data,
                options: [],
                format: nil
              ) else {
            return nil
        }
        return object as? [String: Any]
    }

    private static func text(at url: URL) -> String? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func printDoctorReport(_ report: DoctorReport) {
        print(
            report.complete
                ? "✓ integration state is complete"
                : report.localIntegrationComplete
                    ? "! local integration is complete; repository recording remains"
                    : "! integration state is incomplete"
        )
        print(
            "\(mark(report.installationRecordPresent)) installation provenance " +
            (report.installationVersion.map { "records Enmanner \($0)" } ??
                "is missing")
        )
        print("\(mark(report.agentsManagedSectionPresent)) AGENTS.md managed section")
        print("\(mark(report.gitignoreManagedSectionPresent)) .gitignore managed section")
        if report.iconConfigured {
            print("\(mark(report.iconSourceExists)) configured icon source exists")
        } else {
            print("! no icon is configured")
        }
        if report.appExists {
            print("\(mark(report.appOwnershipMatches)) generated app ownership")
        } else {
            print("! generated app is not built")
        }
        if report.developmentAppExists {
            print(
                "\(mark(report.developmentAppOwnershipMatches)) " +
                "development-only app ownership"
            )
            print(
                "\(mark(report.completionEvidence.developmentNativeLaunchVerified)) " +
                "development-only native launch lifecycle (not completion evidence)"
            )
        }
        print(
            "\(mark(report.completionEvidence.nativeLaunchVerified)) " +
            "generated app native launch lifecycle"
        )
        let diskMark = report.disk.status == "healthy" ? "✓" : "!"
        print(
            "\(diskMark) disk space: \(report.disk.status), " +
            "\(report.disk.availableBytes / 1_048_576) MiB available"
        )
        if report.disk.frameworkBuildCacheBytes > 0 {
            print(
                "  Enmanner build cache: " +
                "\(report.disk.frameworkBuildCacheBytes / 1_048_576) MiB; " +
                "clean with \(report.disk.cleanupCommand)"
            )
        }
        let workspaceMark = report.milestones.repositoryReady ? "✓" : "!"
        print(
            "\(workspaceMark) workspace configuration: " +
            report.workspace.status
        )
        if let recommendation = report.workspace.recommendation {
            print("  \(recommendation)")
        }
        if !report.workspace.uncommittedDurablePaths.isEmpty {
            print("  Durable files awaiting commit:")
            for path in report.workspace.uncommittedDurablePaths {
                print("    \(path)")
            }
        }
        if report.staleDraftManifest {
            print("! enmanner/enmanner.json.example remains beside the live manifest")
        }
        for recommendation in report.recommendations {
            print("! advisory: \(recommendation.message)")
            print("  \(recommendation.suggestedChange)")
        }
        let needsMirroring = report.agentInstructions
            .filter { $0.value == "needsMirroring" }
            .map(\.key)
            .sorted()
        if !needsMirroring.isEmpty {
            print(
                "! other agent instructions: " +
                needsMirroring.joined(separator: ", ")
            )
        }
    }

    private static func dotenvEnvironmentWarnings(
        manifest: EnmannerManifest,
        projectURL: URL
    ) -> [String] {
        guard let userConfiguration = manifest.userConfiguration,
              userConfiguration.template != nil else {
            return []
        }
        do {
            let templateKeys = try DotEnvConfigurationStore(
                projectURL: projectURL,
                configuration: userConfiguration
            ).templateAssignedKeys()
            let graph = try RuntimeGraph.make(from: manifest)
            let configuredKeys = Set(
                graph.environments.flatMap { $0.keys }
            )
            return templateKeys
                .intersection(configuredKeys)
                .sorted()
                .map { key in
                    "\(userConfiguration.template!) assigns \(key), which is also set by a component environment; verify the project's dotenv precedence or remove that assignment from the template"
                }
        } catch {
            return [
                "could not inspect \(userConfiguration.template!) for component environment conflicts: \(error.localizedDescription)"
            ]
        }
    }

    private static func validateRuntime(
        manifest: EnmannerManifest,
        projectURL: URL,
        jsonLines: Bool,
        soakSeconds: Double
    ) async throws -> RuntimeReport {
        let beforeStatus = gitStatus(projectURL: projectURL)
        let logBuffer = LogBuffer(maximumEntries: 100)
        if let configuration = manifest.userConfiguration {
            let secretKeys = Set(
                configuration.fields
                    .filter { $0.type == .secret }
                    .map(\.key)
            )
            if let values = try? DotEnvConfigurationStore(
                projectURL: projectURL,
                configuration: configuration
            ).load() {
                logBuffer.setSensitiveValues(
                    secretKeys.compactMap { values[$0] }
                )
            }
        }
        let supervisor = RuntimeSupervisor(logBuffer: logBuffer)
        let exitRecorder = RuntimeExitRecorder()
        supervisor.onExit = { exit in
            Task { await exitRecorder.record(exit) }
        }
        if jsonLines {
            supervisor.onEvent = { event in
                printRuntimeEvent(event)
            }
            printJSONLine(
                event: "starting",
                fields: ["component": "runtime"]
            )
        }

        let interruptWaiter = RuntimeInterruptWaiter()
        Darwin.signal(SIGINT, SIG_IGN)
        Darwin.signal(SIGTERM, SIG_IGN)
        let interruptSource = DispatchSource.makeSignalSource(
            signal: SIGINT,
            queue: .global()
        )
        let terminateSource = DispatchSource.makeSignalSource(
            signal: SIGTERM,
            queue: .global()
        )
        interruptSource.setEventHandler {
            Task { await interruptWaiter.record(SIGINT) }
        }
        terminateSource.setEventHandler {
            Task { await interruptWaiter.record(SIGTERM) }
        }
        interruptSource.activate()
        terminateSource.activate()
        defer {
            interruptSource.cancel()
            terminateSource.cancel()
            Darwin.signal(SIGINT, SIG_DFL)
            Darwin.signal(SIGTERM, SIG_DFL)
        }

        var outcome = try await withThrowingTaskGroup(
            of: RuntimeValidationOutcome.self
        ) { group in
            group.addTask {
                .launched(
                    try await supervisor.start(
                        manifest: manifest,
                        projectURL: projectURL
                    )
                )
            }
            group.addTask {
                if let signal = await interruptWaiter.wait() {
                    return .interrupted(signal)
                }
                return .cancelledSignalWait
            }
            let first = try await group.next()!
            if jsonLines {
                switch first {
                case .launched(let launch):
                    printJSONLine(
                        event: "readinessPassed",
                        fields: ["url": launch.applicationURL.absoluteString]
                    )
                case .interrupted(let signal):
                    printJSONLine(
                        event: "interrupted",
                        fields: ["signal": Int(signal)]
                    )
                case .cancelledSignalWait:
                    break
                }
            }
            group.cancelAll()
            return first
        }

        guard let plan = supervisor.plan else {
            supervisor.stop()
            throw EnmannerError.processLaunchFailed(
                "Runtime ended before endpoint allocation completed."
            )
        }
        let url = plan.applicationURL
        let port = plan.applicationPort
        let rootProcesses = supervisor.processIdentifiers
        var trackedProcesses: [Int32: String] = [:]
        for processIdentifier in rootProcesses.values {
            trackedProcesses.merge(
                processTree(rootPID: processIdentifier)
            ) { existing, _ in existing }
        }
        let nonLoopback = nonLoopbackListeners(
            processIdentifiers: Array(trackedProcesses.keys)
        )

        var readinessPassed: Bool
        var soakPassed = false
        let interrupted: Bool
        let interruptSignal: Int32?
        if case .launched = outcome {
            if jsonLines {
                printJSONLine(
                    event: "soakStarted",
                    fields: ["seconds": soakSeconds]
                )
            }
            let deadline = Date().addingTimeInterval(soakSeconds)
            while Date() < deadline {
                if let exit = await exitRecorder.recordedExit {
                    supervisor.stop()
                    throw EnmannerError.runtimeFailure(.init(
                        code: .componentExited,
                        phase: .stability,
                        component: exit.component,
                        message: "Component \(exit.component) exited during the \(String(format: "%.1f", soakSeconds))-second post-readiness soak.",
                        exitStatus: exit.status,
                        timeoutSeconds: soakSeconds,
                        command: exit.command,
                        workingDirectory: exit.workingDirectory,
                        recentLogs: exit.recentLogs
                    ))
                }
                if let signal = await interruptWaiter.recordedSignal {
                    outcome = .interrupted(signal)
                    break
                }
                try? await Task.sleep(nanoseconds: 100_000_000)
            }
            if case .launched = outcome {
                soakPassed = true
                if jsonLines {
                    printJSONLine(
                        event: "soakPassed",
                        fields: ["seconds": soakSeconds]
                    )
                }
            }
        }
        switch outcome {
        case .launched:
            readinessPassed = true
            interrupted = false
            interruptSignal = nil
        case .interrupted(let signal):
            readinessPassed = false
            interrupted = true
            interruptSignal = signal
        case .cancelledSignalWait:
            throw EnmannerError.processLaunchFailed(
                "Runtime signal monitoring ended unexpectedly."
            )
        }

        if jsonLines {
            printJSONLine(event: "stopping", fields: ["component": "runtime"])
        }
        supervisor.stop()
        let supervisorExited = !supervisor.isRunning
        var processGroupsStopped = true
        for processIdentifier in rootProcesses.values {
            if !(await waitForProcessGroupToStop(
                processIdentifier,
                timeout: 3
            )) {
                processGroupsStopped = false
            }
        }
        let applicationEndpointUnavailable = await ReadinessChecker().waitUntilUnavailable(
            url: url,
            timeout: 4
        )
        let ownedPortsReleased = plan.ownedPorts.values.allSatisfy {
            !PortAllocator.isLoopbackPortListening($0)
        }
        let remainingProcesses = survivingProcesses(trackedProcesses)
        let afterStatus = gitStatus(projectURL: projectURL)
        let mutations = Array(afterStatus.subtracting(beforeStatus)).sorted()
        if jsonLines {
            printJSONLine(
                event: "shutdownChecked",
                fields: [
                    "supervisorExited": supervisorExited,
                    "processGroupsStopped": processGroupsStopped,
                    "applicationEndpointUnavailable": applicationEndpointUnavailable,
                    "ownedPortsReleased": ownedPortsReleased
                ]
            )
        }

        return RuntimeReport(
            applicationPort: port,
            selectedPorts: Dictionary(
                uniqueKeysWithValues: plan.ports.map { key, value in
                    ("\(key.component).\(key.endpoint)", value)
                }
            ),
            ownedPorts: Dictionary(
                uniqueKeysWithValues: plan.ownedPorts.map { key, value in
                    ("\(key.component).\(key.endpoint)", value)
                }
            ),
            observedPorts: Dictionary(
                uniqueKeysWithValues: plan.observedPorts.map { key, value in
                    ("\(key.component).\(key.endpoint)", value)
                }
            ),
            startup: .init(
                readinessURL: url.absoluteString,
                readinessPassed: readinessPassed,
                soakSeconds: soakSeconds,
                soakPassed: soakPassed,
                componentProcessIdentifiers: rootProcesses
            ),
            shutdown: .init(
                supervisorExited: supervisorExited,
                processGroupsStopped: processGroupsStopped,
                applicationEndpointUnavailable: applicationEndpointUnavailable,
                ownedPortsReleased: ownedPortsReleased,
                nonLoopbackListeners: nonLoopback,
                remainingProcesses: remainingProcesses
            ),
            gitStatusMutations: mutations,
            interrupted: interrupted,
            interruptSignal: interruptSignal
        )
    }

    private static func printRuntimeReport(_ report: RuntimeReport) {
        if report.interrupted {
            print("! runtime validation was interrupted by signal \(report.interruptSignal ?? 0)")
        } else {
            print("✓ server became ready at \(report.startup.readinessURL)")
            print(
                "\(mark(report.startup.soakPassed)) services remained stable for " +
                "\(String(format: "%.1f", report.startup.soakSeconds)) seconds"
            )
        }
        print("\(mark(report.shutdown.supervisorExited)) supervisor process exited")
        print("\(mark(report.shutdown.processGroupsStopped)) process groups stopped")
        print("\(mark(report.shutdown.applicationEndpointUnavailable)) application endpoint became unavailable")
        print("\(mark(report.shutdown.ownedPortsReleased)) all Enmanner-owned ports were released")
        if report.selectedPorts.count > 1 {
            for (endpoint, port) in report.selectedPorts.sorted(
                by: { $0.key < $1.key }
            ) {
                print("  \(endpoint): \(port)")
            }
        }
        if !report.observedPorts.isEmpty {
            print("  Observed prerequisite ports are not expected to close:")
            for (endpoint, port) in report.observedPorts.sorted(
                by: { $0.key < $1.key }
            ) {
                print("    \(endpoint): \(port)")
            }
        }
        if !report.shutdown.nonLoopbackListeners.isEmpty {
            print("✗ launched process tree exposed non-loopback listeners:")
            report.shutdown.nonLoopbackListeners.forEach { print("  \($0)") }
        }
        if !report.shutdown.remainingProcesses.isEmpty {
            print("✗ remaining tracked processes:")
            report.shutdown.remainingProcesses.forEach { print("  \($0)") }
        }
        if !report.gitStatusMutations.isEmpty {
            print("! Git-status changes observed during runtime validation:")
            report.gitStatusMutations.forEach { print("  \($0)") }
        }
        print("  External resources outside the process tree remain project-managed.")
    }

    private static func mark(_ passed: Bool) -> String { passed ? "✓" : "✗" }

    private static func waitForProcessGroupToStop(
        _ processGroup: Int32,
        timeout: TimeInterval
    ) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            errno = 0
            if Darwin.kill(-processGroup, 0) != 0 && errno == ESRCH {
                return true
            }
            try? await Task.sleep(nanoseconds: 100_000_000)
        }
        errno = 0
        return Darwin.kill(-processGroup, 0) != 0 && errno == ESRCH
    }

    private static func processTree(rootPID: Int32) -> [Int32: String] {
        let rows = processOutput(
            executable: "/bin/ps",
            arguments: ["-axo", "pid=,ppid=,command="]
        ).split(whereSeparator: \.isNewline)
        var parents: [Int32: Int32] = [:]
        var commands: [Int32: String] = [:]
        for row in rows {
            let pieces = row.split(
                maxSplits: 2,
                whereSeparator: \.isWhitespace
            )
            guard pieces.count == 3,
                  let pid = Int32(pieces[0]),
                  let parent = Int32(pieces[1]) else { continue }
            parents[pid] = parent
            commands[pid] = String(pieces[2])
        }
        var included: Set<Int32> = [rootPID]
        var changed = true
        while changed {
            changed = false
            for (pid, parent) in parents where
                included.contains(parent) && !included.contains(pid) {
                included.insert(pid)
                changed = true
            }
        }
        return Dictionary(
            uniqueKeysWithValues: included.map { ($0, commands[$0, default: ""]) }
        )
    }

    private static func survivingProcesses(
        _ tracked: [Int32: String]
    ) -> [String] {
        tracked.compactMap { pid, command in
            errno = 0
            guard Darwin.kill(pid, 0) == 0 || errno == EPERM else { return nil }
            return "PID \(pid): \(command)"
        }.sorted()
    }

    private static func nonLoopbackListeners(
        processIdentifiers: [Int32]
    ) -> [String] {
        guard !processIdentifiers.isEmpty else { return [] }
        let pidList = processIdentifiers.map(String.init).joined(separator: ",")
        let output = processOutput(
            executable: "/usr/sbin/lsof",
            arguments: [
                "-nP", "-a", "-p", pidList, "-iTCP", "-sTCP:LISTEN", "-Fn"
            ]
        )
        return output.split(whereSeparator: \.isNewline)
            .map(String.init)
            .filter { $0.hasPrefix("n") }
            .map { String($0.dropFirst()) }
            .filter {
                !$0.hasPrefix("127.0.0.1:") &&
                !$0.hasPrefix("[::1]:") &&
                !$0.hasPrefix("localhost:")
            }
            .sorted()
    }

    private static func gitStatus(projectURL: URL) -> Set<String> {
        let root = processOutput(
            executable: "/usr/bin/git",
            arguments: ["-C", projectURL.path, "rev-parse", "--show-toplevel"]
        )
        guard !root.isEmpty else { return [] }
        let output = processOutput(
            executable: "/usr/bin/git",
            arguments: [
                "-C", projectURL.path, "status", "--porcelain=v1",
                "--untracked-files=all", "--", "."
            ]
        )
        return Set(output.split(whereSeparator: \.isNewline).map(String.init))
    }

    private static func processOutput(
        executable: String,
        arguments: [String]
    ) -> String {
        let process = Process()
        let pipe = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return "" }
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            return ""
        }
    }

    private static func value(after flag: String, in arguments: [String]) -> String? {
        guard let index = arguments.firstIndex(of: flag),
              arguments.indices.contains(index + 1) else { return nil }
        return arguments[index + 1]
    }

    private static func printJSONLine(
        event: String,
        fields: [String: Any] = [:]
    ) {
        jsonLineLock.lock()
        defer { jsonLineLock.unlock() }
        var object = fields
        object["event"] = event
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(
                withJSONObject: object,
                options: [.sortedKeys]
              ),
              let output = String(data: data, encoding: .utf8) else {
            return
        }
        print(output)
        fflush(stdout)
    }

    private static func printRuntimeEvent(_ runtimeEvent: RuntimeEvent) {
        var fields: [String: Any] = [:]
        if let component = runtimeEvent.component {
            fields["component"] = component
        }
        if let stream = runtimeEvent.stream {
            fields["stream"] = stream.rawValue
        }
        if let message = runtimeEvent.message {
            fields["message"] = message
        }
        if let status = runtimeEvent.status {
            fields["status"] = Int(status)
        }
        if let expected = runtimeEvent.expected {
            fields["expected"] = expected
        }
        printJSONLine(event: runtimeEvent.kind.rawValue, fields: fields)
    }

}
