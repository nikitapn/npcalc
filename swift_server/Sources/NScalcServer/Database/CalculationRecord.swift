// Copyright (c) 2025 nikitapnn1@gmail.com

import GRDB

// MARK: - CalculationRecord

/// Mirrors the `Calculation` IDL message and the database `Calculation` table.
///
/// `elements` is stored as a JSON string in the database, matching the C++ server
/// behaviour: `"[[no3,no3_base,ratio],[nh4,…],…]"` (14 × 3-tuple arrays).
/// `fertilizersIds` is a JSON array of fertilizer IDs: `"[25,22,…]"`.
struct CalculationRecord {
    var id: Int64?
    var userId: Int64
    var name: String
    var elements: String        // JSON — TargetElement[14], decoded by the client
    var fertilizersIds: String  // JSON — [u32]
    var volume: Double
    var mode: Bool

    // MARK: Convert to NPRPC-generated type

    func toRpc() -> Calculation {
        Calculation(
            id:             UInt32(id ?? 0),
            name:           name,
            elements:       elements,
            fertilizersIds: fertilizersIds,
            volume:         volume,
            mode:           mode
        )
    }

    /// Build a record from the NPRPC wire type for persistence.
    static func from(rpc: Calculation, userId: Int64) -> CalculationRecord {
        CalculationRecord(
            id:             rpc.id == 0 ? nil : Int64(rpc.id),
            userId:         userId,
            name:           rpc.name,
            elements:       rpc.elements,
            fertilizersIds: rpc.fertilizersIds,
            volume:         rpc.volume,
            mode:           rpc.mode
        )
    }
}

// MARK: - FetchableRecord

extension CalculationRecord: FetchableRecord {
    init(row: Row) {
        id             = row["id"]
        userId         = row["userId"]
        name           = row["name"]
        elements       = (row["elements"] as String?)       ?? "[]"
        fertilizersIds = (row["fertilizersIds"] as String?) ?? "[]"
        volume         = row["volume"]
        mode           = row["mode"]
    }
}

// MARK: - MutablePersistableRecord

extension CalculationRecord: MutablePersistableRecord {
    static let databaseTableName = "Calculation"

    func encode(to container: inout PersistenceContainer) throws {
        container["userId"]         = userId
        container["name"]           = name
        container["elements"]       = elements
        container["fertilizersIds"] = fertilizersIds
        container["volume"]         = volume
        container["mode"]           = mode
    }

    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

// MARK: - CalculationService

struct CalculationService: Sendable {
    let db: AppDatabase

    // MARK: Read

    /// Returns all calculations belonging to a given user.
    /// Matches C++ `CalculationService::getAll(userId)`.
    func getAll(userId: Int64) throws -> [CalculationRecord] {
        try db.dbQueue.read { db in
            try CalculationRecord.filter(Column("userId") == userId).fetchAll(db)
        }
    }

    func hasCalculation(id: Int64) throws -> Bool {
        try db.dbQueue.read { db in
            try CalculationRecord.filter(Column("id") == id).fetchOne(db) != nil
        }
    }

    // MARK: Write

    /// Insert or update — mirrors C++ `insertCalculation` / `updateCalculation` pair.
    /// Returns the (possibly newly assigned) id.
    @discardableResult
    func upsert(_ calculation: Calculation, userId: Int64) throws -> Int64 {
        var record = CalculationRecord.from(rpc: calculation, userId: userId)
        try db.dbQueue.write { db in
            if record.id == nil {
                try record.insert(db)
            } else {
                // Only update rows the user owns
                try db.execute(sql: """
                    UPDATE Calculation
                    SET name = ?, elements = ?, fertilizersIds = ?, volume = ?, mode = ?
                    WHERE id = ? AND userId = ?
                    """,
                    arguments: [
                        record.name, record.elements, record.fertilizersIds,
                        record.volume, record.mode,
                        record.id!, userId
                    ]
                )
            }
        }
        return record.id!
    }

    func deleteCalculation(id: Int64, userId: Int64) throws {
        try db.dbQueue.write { db in
            try db.execute(
                sql: "DELETE FROM Calculation WHERE id = ? AND userId = ?",
                arguments: [id, userId]
            )
        }
    }
}
