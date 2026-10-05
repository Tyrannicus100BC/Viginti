import Foundation

@MainActor
final class AppSettings {
    private enum Key {
        static let includesRecentOutputInErrors = "EnmannerIncludesRecentOutputInErrors"
        static let lastSuccessfulBackup = "EnmannerLastSuccessfulBackup"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var includesRecentOutputInErrors: Bool {
        get {
            guard defaults.object(forKey: Key.includesRecentOutputInErrors) != nil else {
                return true
            }
            return defaults.bool(forKey: Key.includesRecentOutputInErrors)
        }
        set {
            defaults.set(newValue, forKey: Key.includesRecentOutputInErrors)
        }
    }

    var lastSuccessfulBackup: Date? {
        get { defaults.object(forKey: Key.lastSuccessfulBackup) as? Date }
        set { defaults.set(newValue, forKey: Key.lastSuccessfulBackup) }
    }
}
