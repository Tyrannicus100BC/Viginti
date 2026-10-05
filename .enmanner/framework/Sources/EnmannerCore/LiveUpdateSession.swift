import Foundation

/// Small, private, ephemeral bridge between the launcher and a cooperating adapter.
/// Nothing is written into the project's source tree or exposed as an HTTP mutation.
public final class LiveUpdateSession {
    public private(set) var paused = false
    private var revision = 0
    public let directory: URL

    public init() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("enmanner-live-updates-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
        do {
            try writeState(paused: false, revision: 0)
        } catch {
            stop()
            throw error
        }
    }

    public var environment: [String: String] {
        ["ENMANNER_LIVE_UPDATES_FILE": directory.appendingPathComponent("state.json").path]
    }

    public var isConnected: Bool {
        let url = directory.appendingPathComponent("state.json.ack")
        guard let data = try? Data(contentsOf: url),
              let ack = try? JSONDecoder().decode(Acknowledgement.self, from: data) else {
            return false
        }
        let age = Date().timeIntervalSince1970 - ack.timestamp
        return ack.adapter == "vite" && age >= -1 && age < 3
    }

    public func setPaused(_ value: Bool) throws {
        guard value != paused else { return }
        let nextRevision = revision + (value ? 0 : 1)
        try writeState(paused: value, revision: nextRevision)
        paused = value
        revision = nextRevision
    }

    public func stop() {
        try? FileManager.default.removeItem(at: directory)
    }

    private func writeState(paused: Bool, revision: Int) throws {
        let data = try JSONEncoder().encode(State(paused: paused, revision: revision))
        try data.write(to: directory.appendingPathComponent("state.json"), options: .atomic)
    }

    private struct State: Codable {
        let paused: Bool
        let revision: Int
    }

    private struct Acknowledgement: Decodable {
        let adapter: String
        let timestamp: TimeInterval
    }
}
