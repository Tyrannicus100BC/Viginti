import Foundation

public final class LogBuffer: @unchecked Sendable {
    public enum Stream: String, Codable, Sendable {
        case launcher = "enmanner"
        case stdout
        case stderr
    }

    private let queue = DispatchQueue(label: "local.enmanner.log-buffer")
    private struct Entry {
        let text: String
        let component: String?
    }

    private var entries: [Entry] = []
    private var entriesByComponent: [String: [Entry]] = [:]
    private var lastMessageKey: String?
    private var repeatedCount = 0
    private var sensitiveValues: [String] = []
    private let maximumEntries: Int
    public var onChange: (@Sendable (String) -> Void)?

    public init(maximumEntries: Int = 500) {
        self.maximumEntries = maximumEntries
    }

    public func setSensitiveValues(_ values: [String]) {
        queue.sync {
            sensitiveValues = Array(
                Set(values.filter { $0.count >= 8 })
            ).sorted { $0.count > $1.count }
        }
    }

    public func redact(_ message: String) -> String {
        queue.sync {
            sensitiveValues.reduce(message) { result, value in
                result.replacingOccurrences(of: value, with: "[REDACTED]")
            }
        }
    }

    public func append(
        _ message: String,
        stream: Stream = .launcher,
        component: String? = nil
    ) {
        let cleanMessage = redact(message).trimmingCharacters(in: .newlines)
        guard !cleanMessage.isEmpty else { return }

        let timestamp = Self.timestampFormatter.string(from: Date())
        let source = component.map { "[\($0)] " } ?? ""
        let entry = "[\(timestamp)] \(source)[\(stream.rawValue)] \(cleanMessage)"
        let messageKey = "\(component ?? "")\u{0}\(stream.rawValue)\u{0}\(cleanMessage)"
        queue.sync {
            if lastMessageKey == messageKey, !entries.isEmpty {
                repeatedCount += 1
                entries[entries.count - 1] = Entry(
                    text: "\(entry) (repeated \(repeatedCount)×)",
                    component: component
                )
            } else {
                lastMessageKey = messageKey
                repeatedCount = 1
                entries.append(Entry(text: entry, component: component))
            }
            if let component {
                var componentEntries = entriesByComponent[component, default: []]
                componentEntries.append(Entry(text: entry, component: component))
                if componentEntries.count > maximumEntries {
                    componentEntries.removeFirst(
                        componentEntries.count - maximumEntries
                    )
                }
                entriesByComponent[component] = componentEntries
            }
            if entries.count > maximumEntries {
                entries.removeFirst(entries.count - maximumEntries)
            }
            let snapshot = entries.map(\.text).joined(separator: "\n")
            onChange?(snapshot)
        }
    }

    public func snapshot() -> String {
        queue.sync {
            entries.map(\.text).joined(separator: "\n")
        }
    }

    public func snapshot(component: String?) -> String {
        queue.sync {
            let selected = component.map { entriesByComponent[$0, default: []] }
                ?? entries.filter { $0.component == nil }
            return selected
                .map(\.text)
                .joined(separator: "\n")
        }
    }

    public func recentEntries(
        limit: Int = 20,
        component: String? = nil,
        componentOnly: Bool = false
    ) -> [String] {
        queue.sync {
            let candidates: [Entry]
            if componentOnly, let component {
                candidates = entriesByComponent[component, default: []]
            } else if componentOnly {
                candidates = entries.filter { $0.component == nil }
            } else {
                candidates = entries
            }
            return Array(candidates.suffix(max(0, limit))).map(\.text)
        }
    }

    private static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()
}
