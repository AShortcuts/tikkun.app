// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TikkunSystem",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "TikkunSystem", targets: ["TikkunSystem"])],
    targets: [
        .target(name: "TikkunSystem", resources: [.process("Resources")],
                linkerSettings: [.linkedFramework("JavaScriptCore")]),
        .testTarget(name: "TikkunSystemTests", dependencies: ["TikkunSystem"])
    ]
)
