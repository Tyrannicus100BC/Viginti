// swift-tools-version: 5.10

import Foundation
import PackageDescription

var targets: [Target] = [
    .target(name: "EnmannerCore"),
    .executableTarget(
        name: "EnmannerLauncher",
        dependencies: ["EnmannerCore"],
        linkerSettings: [
            .linkedFramework("AppKit")
        ]
    ),
    .executableTarget(
        name: "EnmannerValidator",
        dependencies: ["EnmannerCore"]
    )
]

let packageDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let testsDirectory = packageDirectory.appendingPathComponent("Tests/EnmannerCoreTests")
if FileManager.default.fileExists(atPath: testsDirectory.path) {
    targets.append(
        .testTarget(
            name: "EnmannerCoreTests",
            dependencies: ["EnmannerCore"]
        )
    )
    targets.append(
        .testTarget(
            name: "EnmannerLauncherTests",
            dependencies: ["EnmannerLauncher"]
        )
    )
}

let package = Package(
    name: "EnmannerLauncher",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(name: "EnmannerCore", targets: ["EnmannerCore"]),
        .executable(name: "EnmannerLauncher", targets: ["EnmannerLauncher"]),
        .executable(name: "enmanner-validator", targets: ["EnmannerValidator"])
    ],
    targets: targets
)
