import Darwin
import Foundation

private enum RuntimeControlError: LocalizedError {
    case activePublisher(project: String)

    var errorDescription: String? {
        switch self {
        case .activePublisher(let project):
            return "Another Enmanner launcher is publishing runtime status for \(project)."
        }
    }
}

@MainActor
final class RuntimeControlCenter {
    typealias StatusProvider = () -> [String: Any]
    typealias RestartHandler = (_ component: String?) -> String?

    private struct Request: Decodable {
        let schemaVersion: Int
        let requestID: String
        let action: String
        let component: String?
    }

    private let directoryURL: URL
    private let statusProvider: StatusProvider
    private let restartHandler: RestartHandler
    private var timer: Timer?

    init(
        identifier: String,
        statusProvider: @escaping StatusProvider,
        restartHandler: @escaping RestartHandler
    ) throws {
        let root = URL(fileURLWithPath: "/tmp", isDirectory: true)
            .appendingPathComponent("enmanner-\(getuid())", isDirectory: true)
        directoryURL = root.appendingPathComponent(identifier, isDirectory: true)
        self.statusProvider = statusProvider
        self.restartHandler = restartHandler

        let existingStatusURL = directoryURL.appendingPathComponent("status.json")
        if let data = try? Data(contentsOf: existingStatusURL),
            let status = try? JSONSerialization.jsonObject(with: data)
                as? [String: Any],
            let processIdentifier = status["launcherProcessIdentifier"] as? NSNumber,
            processIdentifier.int32Value != getpid(),
            kill(processIdentifier.int32Value, 0) == 0
        {
            let existingProject = status["project"] as? String ?? "another project"
            throw RuntimeControlError.activePublisher(project: existingProject)
        }

        try FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o700],
            ofItemAtPath: root.path
        )
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o700],
            ofItemAtPath: directoryURL.path
        )
        try removeFiles(withPrefixes: ["request-", "response-"])
    }

    func start() {
        guard timer == nil else { return }
        publishStatus()
        timer = Timer.scheduledTimer(
            withTimeInterval: 0.2,
            repeats: true
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.processRequests()
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        try? FileManager.default.removeItem(at: directoryURL)
    }

    func publishStatus() {
        writeJSON(statusProvider(), to: directoryURL.appendingPathComponent("status.json"))
    }

    private func processRequests() {
        let fileManager = FileManager.default
        guard
            let files = try? fileManager.contentsOfDirectory(
                at: directoryURL,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: [.skipsHiddenFiles]
            )
        else { return }

        for requestURL in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let name = requestURL.lastPathComponent
            guard name.hasPrefix("request-"), name.hasSuffix(".json") else {
                continue
            }
            defer { try? fileManager.removeItem(at: requestURL) }

            guard let data = try? Data(contentsOf: requestURL),
                let request = try? JSONDecoder().decode(Request.self, from: data),
                request.schemaVersion == 1,
                request.action == "restart",
                request.requestID.range(
                    of: #"^[A-Za-z0-9-]+$"#,
                    options: .regularExpression
                ) != nil
            else {
                continue
            }

            let error = restartHandler(request.component)
            var response: [String: Any] = [
                "schemaVersion": 1,
                "requestID": request.requestID,
                "accepted": error == nil,
            ]
            if let error {
                response["error"] = error
            }
            writeJSON(
                response,
                to: directoryURL.appendingPathComponent(
                    "response-\(request.requestID).json"
                )
            )
        }
    }

    private func writeJSON(_ object: [String: Any], to url: URL) {
        guard JSONSerialization.isValidJSONObject(object),
            let data = try? JSONSerialization.data(
                withJSONObject: object,
                options: [.sortedKeys]
            )
        else { return }
        do {
            try data.write(to: url, options: .atomic)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o600],
                ofItemAtPath: url.path
            )
        } catch {
            // Runtime control is diagnostic support; launcher ownership remains
            // authoritative if the temporary control surface is unavailable.
        }
    }

    private func removeFiles(withPrefixes prefixes: [String]) throws {
        let fileManager = FileManager.default
        let files = try fileManager.contentsOfDirectory(
            at: directoryURL,
            includingPropertiesForKeys: nil
        )
        for file in files
        where prefixes.contains(where: {
            file.lastPathComponent.hasPrefix($0)
        }) {
            try? fileManager.removeItem(at: file)
        }
    }
}
