// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TikkunMedia",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "TikkunMedia", targets: ["TikkunMedia"])],
    targets: [
        .target(name: "TikkunMedia"),
        .testTarget(name: "TikkunMediaTests", dependencies: ["TikkunMedia"])
    ]
)
