// Copyright (c) 2025 nikitapnn1@gmail.com

import GRDB

// MARK: - FertilizerRecord

struct FertilizerRecord {
    var id: Int64?
    var userId: Int64
    var name: String
    var formula: String
    /// Populated only from JOIN queries.
    var userName: String = ""

    // MARK: Convert to NPRPC-generated type

    func toRpc() -> Fertilizer {
        Fertilizer(
            id:       UInt32(id ?? 0),
            userId:   UInt32(userId),
            userName: userName,
            name:     name,
            formula:  formula
        )
    }
}

// MARK: - FetchableRecord

extension FertilizerRecord: FetchableRecord {
    init(row: Row) {
        id       = row["id"]
        userId   = row["userId"]
        name     = row["name"]
        formula  = (row["formula"] as String?) ?? ""
        userName = (row["userName"] as String?) ?? ""
    }
}

// MARK: - MutablePersistableRecord

extension FertilizerRecord: MutablePersistableRecord {
    static let databaseTableName = "Fertilizer"

    func encode(to container: inout PersistenceContainer) throws {
        container["userId"]  = userId
        container["name"]    = name
        container["formula"] = formula
        // userName derived from JOIN — never written
    }

    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

// MARK: - FertilizerService

struct FertilizerService: Sendable {
    let db: AppDatabase

    // MARK: Read

    /// All fertilizers joined with their owner's name, sorted by name.
    /// Matches C++ `FertilizerService::getAll()`.
    func getAll() throws -> [FertilizerRecord] {
        try db.dbQueue.read { db in
            try FertilizerRecord.fetchAll(db, sql: """
                SELECT Fertilizer.*, User.name AS userName
                FROM Fertilizer
                JOIN User ON Fertilizer.userId = User.id
                ORDER BY Fertilizer.name ASC
            """)
        }
    }

    func getFertilizer(id: Int64) throws -> FertilizerRecord? {
        try db.dbQueue.read { db in
            try FertilizerRecord.filter(Column("id") == id).fetchOne(db)
        }
    }

    // MARK: Write

    @discardableResult
    func addFertilizer(userId: Int64, name: String, formula: String) throws -> FertilizerRecord {
        var record = FertilizerRecord(id: nil, userId: userId, name: name, formula: formula)
        try db.dbQueue.write { db in
            try record.insert(db)
        }
        return record
    }

    func updateName(id: Int64, userId: Int64, name: String) throws {
        try db.dbQueue.write { db in
            try db.execute(
                sql: "UPDATE Fertilizer SET name = ? WHERE id = ? AND userId = ?",
                arguments: [name, id, userId]
            )
        }
    }

    func updateFormula(id: Int64, userId: Int64, formula: String) throws {
        try db.dbQueue.write { db in
            try db.execute(
                sql: "UPDATE Fertilizer SET formula = ? WHERE id = ? AND userId = ?",
                arguments: [formula, id, userId]
            )
        }
    }

    @discardableResult
    func deleteFertilizer(id: Int64, userId: Int64) throws -> Bool {
        try db.dbQueue.write { db in
            try db.execute(
                sql: "DELETE FROM Fertilizer WHERE id = ? AND userId = ?",
                arguments: [id, userId]
            )
            return db.changesCount > 0
        }
    }
}
