// swift-tools-version: 6.0
// NScalc Swift Server — rewrite of C++ nscalc server.
//
// Build ONLY inside the nprpc-dev:latest Docker image where /opt/nprpc_swift
// and /opt/nprpc are pre-installed:
//
//   docker run --rm -v $(pwd):/app -w /app nprpc-dev:latest swift build -c release
//
// Or use the top-level build_swift_server.sh helper script.

import PackageDescription

let package = Package(
    name: "NScalcServer",
    platforms: [
        .macOS(.v13),   // ignored on Linux, present for IDE compatibility
    ],
    dependencies: [
        // NPRPC Swift bindings — pre-installed in the Docker image
        .package(path: "/opt/nprpc_swift"),
        // SQLite ORM — https://github.com/groue/GRDB.swift
        .package(url: "https://github.com/groue/GRDB.swift", from: "6.29.0"),
        // Cross-platform CryptoKit (SHA-256 for password verification)
        .package(url: "https://github.com/apple/swift-crypto", from: "3.0.0"),
    ],
    targets: [
        // Generated RPC stubs — compiled as a separate module so that
        // server code imports them explicitly: `import NScalc`
        .target(
            name: "NScalc",
            dependencies: [
                .product(name: "NPRPC", package: "nprpc_swift"),
            ],
            path: "Sources/NScalc",
            swiftSettings: [
                .interoperabilityMode(.Cxx),
            ]
        ),
        .executableTarget(
            name: "NScalcServer",
            dependencies: [
                "NScalc",
                .product(name: "NPRPC",  package: "nprpc_swift"),
                .product(name: "GRDB",   package: "GRDB.swift"),
                .product(name: "Crypto", package: "swift-crypto"),
            ],
            path: "Sources/NScalcServer",
            swiftSettings: [
                .interoperabilityMode(.Cxx),
            ]
        ),
    ]
)
