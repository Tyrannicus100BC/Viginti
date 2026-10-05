import Foundation

public struct RecoveryCircuitBreaker: Equatable, Sendable {
    public let maximumFailures: Int
    public let windowSeconds: TimeInterval
    private var failureDates: [Date] = []

    public init(
        maximumFailures: Int = 5,
        windowSeconds: TimeInterval = 60
    ) {
        self.maximumFailures = maximumFailures
        self.windowSeconds = windowSeconds
    }

    public mutating func recordFailure(at date: Date = Date()) -> Int? {
        failureDates.removeAll {
            date.timeIntervalSince($0) > windowSeconds
        }
        failureDates.append(date)
        guard failureDates.count <= maximumFailures else { return nil }
        return failureDates.count
    }

    public mutating func reset() {
        failureDates.removeAll()
    }
}
