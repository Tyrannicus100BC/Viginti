import Foundation

public enum EnmannerError: LocalizedError, Equatable {
    case manifestMissing(URL)
    case malformedManifest(path: String?, detail: String)
    case invalidManifest([String])
    case invalidInterpolation(String)
    case executableNotFound(String)
    case processAlreadyRunning
    case processLaunchFailed(String)
    case runtimeFailure(RuntimeFailure)
    case portAllocationFailed

    public var errorDescription: String? {
        switch self {
        case .manifestMissing(let url):
            return "Enmanner could not find enmanner/enmanner.json at \(url.path)."
        case .malformedManifest(let path, let detail):
            if let path {
                return "Enmanner could not read enmanner/enmanner.json at \(path). \(detail)"
            }
            return "Enmanner could not read enmanner/enmanner.json. \(detail)"
        case .invalidManifest(let issues):
            return "enmanner/enmanner.json needs attention:\n• " + issues.joined(separator: "\n• ")
        case .invalidInterpolation(let token):
            return "The manifest uses an unsupported variable: \(token)."
        case .executableNotFound(let executable):
            return "Enmanner could not find “\(executable)” in the application environment."
        case .processAlreadyRunning:
            return "The application server is already running."
        case .processLaunchFailed(let detail):
            return "Enmanner could not start the application server. \(detail)"
        case .runtimeFailure(let failure):
            return failure.message
        case .portAllocationFailed:
            return "Enmanner could not reserve a local network port."
        }
    }

    public var diagnosticCode: String {
        switch self {
        case .manifestMissing:
            return "manifestMissing"
        case .malformedManifest:
            return "manifestMalformed"
        case .invalidManifest:
            return "manifestInvalid"
        case .invalidInterpolation:
            return "interpolationInvalid"
        case .executableNotFound:
            return "executableNotFound"
        case .processAlreadyRunning:
            return "processAlreadyRunning"
        case .processLaunchFailed:
            return "processLaunchFailed"
        case .runtimeFailure(let failure):
            return failure.code.rawValue
        case .portAllocationFailed:
            return "portAllocationFailed"
        }
    }

    public var diagnosticPath: String? {
        guard case .malformedManifest(let path, _) = self else { return nil }
        return path
    }

    public var runtimeFailure: RuntimeFailure? {
        guard case .runtimeFailure(let failure) = self else { return nil }
        return failure
    }
}
