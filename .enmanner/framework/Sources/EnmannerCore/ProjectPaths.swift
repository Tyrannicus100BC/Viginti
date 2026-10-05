import Foundation

public enum ProjectPaths {
    public static let integrationDirectoryName = "enmanner"
    public static let manifestFileName = "enmanner.json"

    public static func projectURL(forAppBundleURL appBundleURL: URL) -> URL {
        appBundleURL
            .standardizedFileURL
            .deletingLastPathComponent()
    }

    public static func manifestURL(forProjectURL projectURL: URL) -> URL {
        projectURL
            .appendingPathComponent(integrationDirectoryName, isDirectory: true)
            .appendingPathComponent(manifestFileName, isDirectory: false)
    }

    public static func manifestURL(forAppBundleURL appBundleURL: URL) -> URL {
        manifestURL(forProjectURL: projectURL(forAppBundleURL: appBundleURL))
    }

    public static func resolve(_ relativePath: String, inside projectURL: URL) throws -> URL {
        guard !relativePath.hasPrefix("/") else {
            throw EnmannerError.invalidManifest(["Paths must be project-relative."])
        }

        let root = projectURL.standardizedFileURL.resolvingSymlinksInPath()
        let resolved = root
            .appendingPathComponent(relativePath)
            .standardizedFileURL
            .resolvingSymlinksInPath()

        let rootPath = root.path.hasSuffix("/") ? root.path : root.path + "/"
        guard resolved.path == root.path || resolved.path.hasPrefix(rootPath) else {
            throw EnmannerError.invalidManifest(["A configured path leaves the project."])
        }
        return resolved
    }
}
