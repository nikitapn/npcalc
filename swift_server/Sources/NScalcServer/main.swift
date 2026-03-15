// Copyright (c) 2025 nikitapnn1@gmail.com
// NScalc Swift Server — skeleton entry point.
//
// Run gen_stubs.py first to populate Sources/NScalcServer/Generated/ before building.

import NScalc
import NPRPC
import Foundation
import GRDB

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
    let certFile = "/app/certs/localhost.crt"
    let keyFile  = "/app/certs/localhost.key"
    let httpPort: UInt16 = 8443
    let wwwRoot  = "/app/runtime/www"
    let dbPath   = "/app/sample_data/nscalc.db"
    let hostJsonOutputPath = wwwRoot + "/host.json"

    // Open (and migrate if needed) the SQLite database.
    let appDB = try AppDatabase(path: dbPath)
    print("Database opened: \(dbPath)")

    let rpc = try RpcBuilder()
        .setLogLevel(.trace)
        .withHostname("localhost")
        .withHttp(httpPort)
            .ssl(certFile: certFile, keyFile: keyFile)
            .enableHttp3()
            .rootDir(wwwRoot)
        .build()

    print("NScalc Swift server listening on port \(httpPort)")

    let poa  = try rpc.createPoa(maxObjects: 10, lifetime: .persistent, idPolicy: .userSupplied)
    let calc = CalculatorServantImpl(db: appDB)
    let calcOid = try poa.activateObjectWithId(objectId: UInt64(0), servant: calc, flags: .allowAll)

    let authorizator = try AuthorizatorImpl(rpc: rpc, db: appDB)
    let authOid = try poa.activateObjectWithId(objectId: UInt64(1), servant: authorizator, flags: .allowAll)

    let chat = ChatServantImpl()
    let chatOid = try poa.activateObjectWithId(objectId: UInt64(4), servant: chat, flags: .allowAll)

    let realtime = RealtimeServantImpl()
    let realtimeOid = try poa.activateObjectWithId(objectId: UInt64(5), servant: realtime, flags: .allowAll)

        rpc.clearHostJson()
        try rpc.addToHostJson(name: "calculator", objectId: calcOid)
        try rpc.addToHostJson(name: "authorizator", objectId: authOid)
        try rpc.addToHostJson(name: "chat", objectId: chatOid)
        try rpc.addToHostJson(name: "realtime", objectId: realtimeOid)
        let hostJsonPath = try rpc.produceHostJson(outputPath: hostJsonOutputPath)

    print("Activated Authorizator with oid: \(authOid)")
    print("Activated ChatServant with oid: \(chatOid)")
    print("Activated RealtimeServant with oid: \(realtimeOid)")
        print("host.json: \(hostJsonPath)")

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
