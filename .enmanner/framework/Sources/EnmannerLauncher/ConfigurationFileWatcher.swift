import CryptoKit
import Foundation

@MainActor
final class ConfigurationFileWatcher {
    private struct Metadata: Equatable {
        let exists: Bool
        let modificationTime: TimeInterval
        let size: UInt64
        let fileNumber: UInt64
    }

    private struct Snapshot {
        let metadata: Metadata
        let contentHash: String
    }

    private let fileURL: URL
    private let onChange: () -> Void
    private var timer: Timer?
    private var baseline: Snapshot
    private var candidate: Snapshot?
    private var candidateSince: Date?

    init(fileURL: URL, onChange: @escaping () -> Void) {
        self.fileURL = fileURL
        self.onChange = onChange
        baseline = Self.snapshot(fileURL)
    }

    func start() {
        guard timer == nil else { return }
        timer = Timer.scheduledTimer(
            withTimeInterval: 0.2,
            repeats: true
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.poll()
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func acceptCurrentContents() {
        baseline = Self.snapshot(fileURL)
        candidate = nil
        candidateSince = nil
    }

    private func poll() {
        let metadata = Self.metadata(fileURL)
        guard metadata != baseline.metadata else {
            candidate = nil
            candidateSince = nil
            return
        }

        if candidate?.metadata != metadata {
            let snapshot = Self.snapshot(fileURL, metadata: metadata)
            if snapshot.contentHash == baseline.contentHash {
                baseline = snapshot
                candidate = nil
                candidateSince = nil
                return
            }
            candidate = snapshot
            candidateSince = Date()
            return
        }

        guard let candidateSince,
            Date().timeIntervalSince(candidateSince) >= 0.4
        else {
            return
        }
        guard let candidate else { return }
        baseline = candidate
        self.candidate = nil
        self.candidateSince = nil
        onChange()
    }

    private static func snapshot(
        _ url: URL,
        metadata: Metadata? = nil
    ) -> Snapshot {
        let metadata = metadata ?? self.metadata(url)
        guard let data = try? Data(contentsOf: url) else {
            return Snapshot(metadata: metadata, contentHash: "missing")
        }
        let contentHash = SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
        return Snapshot(metadata: metadata, contentHash: contentHash)
    }

    private static func metadata(_ url: URL) -> Metadata {
        guard
            let attributes = try? FileManager.default.attributesOfItem(
                atPath: url.path
            )
        else {
            return Metadata(
                exists: false,
                modificationTime: 0,
                size: 0,
                fileNumber: 0
            )
        }
        return Metadata(
            exists: true,
            modificationTime: (attributes[.modificationDate] as? Date)?.timeIntervalSince1970
                ?? 0,
            size: (attributes[.size] as? NSNumber)?.uint64Value ?? 0,
            fileNumber: (attributes[.systemFileNumber] as? NSNumber)?.uint64Value ?? 0
        )
    }
}
