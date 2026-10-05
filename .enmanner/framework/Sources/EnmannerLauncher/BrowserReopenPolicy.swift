import Foundation

/// Distinguishes the reopen accompanying activation from an explicit second
/// click. AppKit can deliver activation and reopen in either order.
struct BrowserReopenPolicy {
    private var needsForegroundOnly = true
    private var activationDeadline: TimeInterval?

    mutating func willBecomeActive(at time: TimeInterval) {
        // Keep a short association window for the activation's first reopen,
        // but do not rearm a click already consumed before this notification.
        activationDeadline = time + 0.5
    }

    mutating func didResignActive() {
        needsForegroundOnly = true
        activationDeadline = nil
    }

    /// Returns true only for the first reopen associated with activation.
    mutating func consumeReopen(at time: TimeInterval) -> Bool {
        defer { needsForegroundOnly = false }
        guard needsForegroundOnly else { return false }
        // Activation through Command-Tab need not produce a reopen. Once the
        // association window expires, the next Dock click opens the browser.
        return activationDeadline.map { time < $0 } ?? true
    }
}
