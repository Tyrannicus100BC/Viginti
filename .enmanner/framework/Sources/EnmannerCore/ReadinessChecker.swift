import Foundation

public actor ReadinessChecker {
    public typealias Probe = @Sendable (URL) async -> Bool

    private let probe: Probe

    public init(probe: Probe? = nil) {
        self.probe = probe ?? { url in
            await Self.checkHTTP(url: url)
        }
    }

    public func waitUntilReady(
        url: URL,
        timeout: TimeInterval,
        acceptableStatusCodes: [Int]? = nil,
        contentTypeContains: String? = nil,
        bodyContains: String? = nil,
        intervalNanoseconds: UInt64 = 300_000_000
    ) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while !Task.isCancelled && Date() < deadline {
            let ready: Bool
            if acceptableStatusCodes == nil &&
                contentTypeContains == nil &&
                bodyContains == nil {
                ready = await probe(url)
            } else {
                ready = await Self.checkHTTP(
                    url: url,
                    acceptableStatusCodes: acceptableStatusCodes,
                    contentTypeContains: contentTypeContains,
                    bodyContains: bodyContains
                )
            }
            if ready {
                return true
            }
            try? await Task.sleep(nanoseconds: intervalNanoseconds)
        }
        return false
    }

    public func waitUntilUnavailable(
        url: URL,
        timeout: TimeInterval,
        intervalNanoseconds: UInt64 = 200_000_000
    ) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        var consecutiveFailures = 0
        while !Task.isCancelled && Date() < deadline {
            if await Self.checkHTTP(url: url) {
                consecutiveFailures = 0
            } else {
                consecutiveFailures += 1
                if consecutiveFailures >= 3 {
                    return true
                }
            }
            try? await Task.sleep(nanoseconds: intervalNanoseconds)
        }
        return false
    }

    public static func checkHTTP(
        url: URL,
        acceptableStatusCodes: [Int]? = nil,
        contentTypeContains: String? = nil,
        bodyContains: String? = nil
    ) async -> Bool {
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            let statusMatches = acceptableStatusCodes?.contains(http.statusCode) ??
                (200...399).contains(http.statusCode)
            guard statusMatches else { return false }
            if let contentTypeContains {
                guard http.value(forHTTPHeaderField: "Content-Type")?
                    .localizedCaseInsensitiveContains(contentTypeContains) == true else {
                    return false
                }
            }
            if let bodyContains {
                guard let body = String(data: data, encoding: .utf8),
                      body.contains(bodyContains) else {
                    return false
                }
            }
            return true
        } catch {
            return false
        }
    }
}
