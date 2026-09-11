// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TikkunPlayback",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "TikkunPlayback", targets: ["TikkunPlayback"])],
    targets: [
        .target(name: "TikkunPlayback"),
        .testTarget(name: "TikkunPlaybackTests", dependencies: ["TikkunPlayback"])
    ]
)
