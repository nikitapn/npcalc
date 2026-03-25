// Copyright (c) 2025 nikitapnn1@gmail.com
// NScalc Swift Server — skeleton entry point.
//
// Run gen_stubs.py first to populate Sources/NScalcServer/Generated/ before building.

import NScalc
import NPRPC
import Foundation
import GRDB

struct ServerConfig {
    let hostname: String
    let httpPort: UInt16
    let httpDir: String
    let dataDir: String
    let useSsl: Bool
    let enableHttp3: Bool
    let publicKeyPath: String?
    let privateKeyPath: String?
    let dhParamsPath: String?

    var dbPath: String {
        let dataURL = URL(fileURLWithPath: dataDir)
        if dataURL.pathExtension == "db" {
            return dataURL.path
        }
        return dataURL.appendingPathComponent("nscalc.db").path
    }

    var dataRootPath: String {
        let dataURL = URL(fileURLWithPath: dataDir)
        if dataURL.pathExtension == "db" {
            return dataURL.deletingLastPathComponent().path
        }
        return dataURL.path
    }

    var mediaRootPath: String {
        URL(fileURLWithPath: dataRootPath).appendingPathComponent("grow_journal_media").path
    }

    var hostJsonOutputPath: String {
        URL(fileURLWithPath: httpDir).appendingPathComponent("host.json").path
    }
}

enum ServerConfigError: LocalizedError {
    case missingValue(String)
    case invalidValue(String, String)
    case unknownArgument(String)
    case sslRequiresCertificatePaths
    case http3RequiresSsl

    var errorDescription: String? {
        switch self {
        case .missingValue(let option):
            return "missing value for \(option)"
        case .invalidValue(let option, let value):
            return "invalid value for \(option): \(value)"
        case .unknownArgument(let argument):
            return "unknown argument: \(argument)"
        case .sslRequiresCertificatePaths:
            return "SSL requires both --public-key and --private-key"
        case .http3RequiresSsl:
            return "HTTP/3 requires SSL to be enabled"
        }
    }
}

private func parseBool(_ value: String, optionName: String) throws -> Bool {
    switch value.lowercased() {
    case "1", "true", "yes", "on":
        return true
    case "0", "false", "no", "off":
        return false
    default:
        throw ServerConfigError.invalidValue(optionName, value)
    }
}

private func printUsage() {
    print("""
    Usage: NScalcServer [options]

      --hostname <value>      Public hostname written into host.json
      --port <value>          HTTP/WebSocket port
      --http-dir <path>       Static web root
      --data-dir <path>       Data directory or explicit SQLite database path
      --use-ssl <0|1>         Enable TLS for HTTP/WebSocket
      --enable-http3          Enable HTTP/3 in addition to HTTPS/WSS
      --public-key <path>     TLS certificate path
      --private-key <path>    TLS private key path
      --dh-params <path>      Optional DH params path
      --help                  Show this help message
    """)
}

private func optionValue(_ option: String, inlineValue: String?, index: inout Int, args: [String]) throws -> String {
    if let inlineValue {
        return inlineValue
    }
    let nextIndex = index + 1
    guard nextIndex < args.count else {
        throw ServerConfigError.missingValue(option)
    }
    index = nextIndex
    return args[nextIndex]
}

private func parseServerConfig() throws -> ServerConfig {
    let env = ProcessInfo.processInfo.environment
    var hostname = env["NSCALC_HOSTNAME"] ?? "localhost"
    var httpPort = UInt16(env["NSCALC_PORT"] ?? "8443") ?? 8443
    var httpDir = env["NSCALC_HTTP_DIR"] ?? "/app/runtime/www"
    var dataDir = env["NSCALC_DATA_DIR"] ?? "/app/sample_data"
    var useSsl = try parseBool(env["NSCALC_USE_SSL"] ?? "1", optionName: "NSCALC_USE_SSL")
    var enableHttp3 = try parseBool(env["NSCALC_ENABLE_HTTP3"] ?? "0", optionName: "NSCALC_ENABLE_HTTP3")
    var publicKeyPath = env["NSCALC_PUBLIC_KEY"]
    var privateKeyPath = env["NSCALC_PRIVATE_KEY"]
    var dhParamsPath = env["NSCALC_DH_PARAMS"]

    let args = Array(CommandLine.arguments.dropFirst())
    var index = 0
    while index < args.count {
        let argument = args[index]
        if argument == "--help" {
            printUsage()
            exit(0)
        }

        guard argument.hasPrefix("--") else {
            throw ServerConfigError.unknownArgument(argument)
        }

        let parts = argument.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
        let option = String(parts[0])
        let inlineValue = parts.count == 2 ? String(parts[1]) : nil

        switch option {
        case "--hostname":
            hostname = try optionValue(option, inlineValue: inlineValue, index: &index, args: args)
        case "--port":
            let value = try optionValue(option, inlineValue: inlineValue, index: &index, args: args)
            guard let parsedPort = UInt16(value) else {
                throw ServerConfigError.invalidValue(option, value)
            }
            httpPort = parsedPort
        case "--http-dir":
            httpDir = try optionValue(option, inlineValue: inlineValue, index: &index, args: args)
        case "--data-dir":
            dataDir = try optionValue(option, inlineValue: inlineValue, index: &index, args: args)
        case "--use-ssl":
            let value = try optionValue(option, inlineValue: inlineValue, index: &index, args: args)
            useSsl = try parseBool(value, optionName: option)
        case "--enable-http3":
            if let inlineValue {
                enableHttp3 = try parseBool(inlineValue, optionName: option)
            } else {
                enableHttp3 = true
            }
        case "--public-key":
            publicKeyPath = try optionValue(option, inlineValue: inlineValue, index: &index, args: args)
        case "--private-key":
            privateKeyPath = try optionValue(option, inlineValue: inlineValue, index: &index, args: args)
        case "--dh-params":
            dhParamsPath = try optionValue(option, inlineValue: inlineValue, index: &index, args: args)
        default:
            throw ServerConfigError.unknownArgument(argument)
        }

        index += 1
    }

    if enableHttp3 && !useSsl {
        throw ServerConfigError.http3RequiresSsl
    }
    if useSsl && (publicKeyPath == nil || privateKeyPath == nil) {
        throw ServerConfigError.sslRequiresCertificatePaths
    }

    return ServerConfig(
        hostname: hostname,
        httpPort: httpPort,
        httpDir: httpDir,
        dataDir: dataDir,
        useSsl: useSsl,
        enableHttp3: enableHttp3,
        publicKeyPath: publicKeyPath,
        privateKeyPath: privateKeyPath,
        dhParamsPath: dhParamsPath,
    )
}

// ---------------------------------------------------------------------------
// MARK: - Calculator servant
// ---------------------------------------------------------------------------

class CalculatorServantImpl: CalculatorServant, @unchecked Sendable {
    private let solutions:    SolutionService
    private let fertilizers:  FertilizerService
    private let calculations: CalculationService

    init(db: AppDatabase) {
        solutions    = SolutionService(db: db)
        fertilizers  = FertilizerService(db: db)
        calculations = CalculationService(db: db)
    }

    override func getData() -> ([Solution], [Fertilizer]) {
        do {
            let sols  = try solutions.getAll().map  { $0.toRpc() }
            let ferts = try fertilizers.getAll().map { $0.toRpc() }
            return (sols, ferts)
        } catch {
            print("[CalculatorServantImpl] getData failed: \(error)")
            return ([], [])
        }
    }

    override func getCalculatorBootstrap(solution_limit: UInt32, fertilizer_limit: UInt32) -> CalculatorBootstrap {
        do {
            let solutionNames = try calculations.topSolutionNames(limit: max(Int(solution_limit), 8))
            let fertilizerIDs = try calculations.topFertilizerIDs(limit: max(Int(fertilizer_limit), 12))
            let bootstrapSolutions = try solutions.bootstrap(names: solutionNames, limit: solution_limit)
            let bootstrapFertilizers = try fertilizers.bootstrap(ids: fertilizerIDs, limit: fertilizer_limit)
            return CalculatorBootstrap(
                solutions: bootstrapSolutions.map { $0.toRpc() },
                fertilizers: bootstrapFertilizers.map { $0.toRpc() }
            )
        } catch {
            print("[CalculatorServantImpl] getCalculatorBootstrap failed: \(error)")
            return CalculatorBootstrap(solutions: [], fertilizers: [])
        }
    }

    override func listSolutionsPage(query: String, author: String, cursor: String, limit: UInt32) -> SolutionCursorPage {
        do {
            let page = try solutions.listPage(query: query, author: author, cursor: cursor, limit: limit)
            return SolutionCursorPage(items: page.items.map { $0.toRpc() }, next_cursor: page.nextCursor)
        } catch {
            print("[CalculatorServantImpl] listSolutionsPage failed: \(error)")
            return SolutionCursorPage(items: [], next_cursor: nil)
        }
    }

    override func listFertilizersPage(query: String, cursor: String, limit: UInt32) -> FertilizerCursorPage {
        do {
            let page = try fertilizers.listPage(query: query, cursor: cursor, limit: limit)
            return FertilizerCursorPage(items: page.items.map { $0.toRpc() }, next_cursor: page.nextCursor)
        } catch {
            print("[CalculatorServantImpl] listFertilizersPage failed: \(error)")
            return FertilizerCursorPage(items: [], next_cursor: nil)
        }
    }

    override func subscribe(obj: NPRPCObject) {
        // TODO: hook into DataObservers broadcast list
    }

    override func getGuestCalculations() -> [Calculation] {
        do {
            return try calculations.getAll(userId: 2 /* GUEST_ID */).map { $0.toRpc() }
        } catch {
            print("[CalculatorServantImpl] getGuestCalculations failed: \(error)")
            return []
        }
    }

    override func sendFootstep(footstep: Footstep) {
        // TODO: broadcast to DataObservers
    }
}

do {
    let config = try parseServerConfig()
    let fileManager = FileManager.default
    try fileManager.createDirectory(atPath: config.httpDir, withIntermediateDirectories: true, attributes: nil)
    try fileManager.createDirectory(atPath: config.dataRootPath, withIntermediateDirectories: true, attributes: nil)

    // Open (and migrate if needed) the SQLite database.
    let appDB = try AppDatabase(path: config.dbPath)
    print("Database opened: \(config.dbPath)")

    let httpBuilder = RpcBuilder()
        .setLogLevel(.info)
        .withHostname(config.hostname)
        .withHttp(config.httpPort)
        .maxRequestBodySize(6 * 1024 * 1024)
        .maxWebSocketMessageSize(6 * 1024 * 1024)
        .maxWebTransportMessageSize(6 * 1024 * 1024)

    if config.useSsl {
        httpBuilder.ssl(
            certFile: config.publicKeyPath!,
            keyFile: config.privateKeyPath!,
            dhparamsFile: config.dhParamsPath ?? ""
        )
    }
    if config.enableHttp3 {
        httpBuilder.enableHttp3()
    }

    let rpc = try httpBuilder
        .rootDir(config.httpDir)
        .build()

    print("NScalc Swift server listening on \(config.hostname):\(config.httpPort)")

    let poa  = try rpc.createPoa(maxObjects: 12, lifetime: .Persistent, idPolicy: .userSupplied)
    let calc = CalculatorServantImpl(db: appDB)
    let calcOid = try poa.activateObjectWithId(objectId: UInt64(0), servant: calc, flags: .allowAll)

    let authorizator = try AuthorizatorImpl(rpc: rpc, db: appDB)
    let authOid = try poa.activateObjectWithId(objectId: UInt64(1), servant: authorizator, flags: .allowAll)

    let chat = ChatServantImpl()
    let chatOid = try poa.activateObjectWithId(objectId: UInt64(4), servant: chat, flags: .allowAll)

    let realtime = RealtimeServantImpl()
    let realtimeOid = try poa.activateObjectWithId(objectId: UInt64(5), servant: realtime, flags: .allowAll)

    let journalStore = GrowJournalStore(
        db: appDB,
        videoRootPath: config.mediaRootPath,
        publicRootPath: config.httpDir
    )
    let journal = JournalServiceServantImpl(store: journalStore)
    let journalOid = try poa.activateObjectWithId(objectId: UInt64(6), servant: journal, flags: .allowAll)

    let uploads = UploadServiceServantImpl(store: journalStore)
    let uploadsOid = try poa.activateObjectWithId(objectId: UInt64(7), servant: uploads, flags: .allowAll)

    let storyStream = StoryStreamServiceServantImpl(store: journalStore)
    let storyStreamOid = try poa.activateObjectWithId(objectId: UInt64(8), servant: storyStream, flags: .allowAll)

    let media = MediaServiceServantImpl(store: journalStore)
    let mediaOid = try poa.activateObjectWithId(objectId: UInt64(9), servant: media, flags: .allowAll)

    let siteEvents = SiteEventServiceServantImpl(db: appDB)
    let siteEventsOid = try poa.activateObjectWithId(objectId: UInt64(10), servant: siteEvents, flags: .allowAll)

    rpc.clearHostJson()
    try rpc.addToHostJson(name: "calculator", objectId: calcOid)
    try rpc.addToHostJson(name: "authorizator", objectId: authOid)
    try rpc.addToHostJson(name: "chat", objectId: chatOid)
    try rpc.addToHostJson(name: "realtime", objectId: realtimeOid)
    try rpc.addToHostJson(name: "journal", objectId: journalOid)
    try rpc.addToHostJson(name: "journal_uploads", objectId: uploadsOid)
    try rpc.addToHostJson(name: "journal_stream", objectId: storyStreamOid)
    try rpc.addToHostJson(name: "journal_media", objectId: mediaOid)
    try rpc.addToHostJson(name: "site_events", objectId: siteEventsOid)
    let hostJsonPath = try rpc.produceHostJson(outputPath: config.hostJsonOutputPath)

    if false {
        print("Activated Authorizator with oid: \(authOid)")
        print("Activated ChatServant with oid: \(chatOid)")
        print("Activated RealtimeServant with oid: \(realtimeOid)")
        print("Activated JournalService with oid: \(journalOid)")
        print("Activated UploadService with oid: \(uploadsOid)")
        print("Activated StoryStreamService with oid: \(storyStreamOid)")
        print("Activated MediaService with oid: \(mediaOid)")
        print("Activated SiteEventService with oid: \(siteEventsOid)")
        print("host.json: \(hostJsonPath)")
    }
    // Set up signal handling for graceful shutdown
    let signalSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    signalSource.setEventHandler {
        print("\n")
        print("Received SIGINT, shutting down...")
        rpc.stop()
        exit(0)
    }
    signal(SIGINT, SIG_IGN)
    signalSource.resume()

    try rpc.startThreadPool(4)

    // Block forever waiting for RPC calls
    dispatchMain()

} catch {
    // Use nonisolated stderr access (Swift 6 strict concurrency workaround)
    let standardError = FileHandle.standardError
    let msg = "Fatal: \(error)\n"
    standardError.write(Data(msg.utf8))
    exit(1)
}
