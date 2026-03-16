// Copyright (c) 2025 nikitapnn1@gmail.com

import GRDB
import NScalc

// MARK: - FertilizerRecord

struct FertilizerRecord {
    var id: Int64?
    var userId: Int64
    var name: String
    var formula: String
    var no3: Double
    var nh4: Double
    var p: Double
    var k: Double
    var ca: Double
    var mg: Double
    var s: Double
    var cl: Double
    var fe: Double
    var zn: Double
    var b: Double
    var mn: Double
    var cu: Double
    var mo: Double
    var bottle: Int64
    var fertilizerType: Int64
    var density: Double
    var cost: Double
    /// Populated only from JOIN queries.
    var userName: String = ""

    init(
        id: Int64? = nil,
        userId: Int64,
        name: String,
        formula: String,
        parsed: FertilizerParseResult,
        userName: String = ""
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.formula = formula
        self.userName = userName
        (no3, nh4, p, k, ca, mg, s, cl, fe, zn, b, mn, cu, mo) = (
            parsed.elements[0], parsed.elements[1], parsed.elements[2], parsed.elements[3],
            parsed.elements[4], parsed.elements[5], parsed.elements[6], parsed.elements[7],
            parsed.elements[8], parsed.elements[9], parsed.elements[10], parsed.elements[11],
            parsed.elements[12], parsed.elements[13]
        )
        bottle = parsed.bottle
        fertilizerType = parsed.fertilizerType
        density = parsed.density
        cost = parsed.cost
    }

    // MARK: Convert to NPRPC-generated type

    var elements: [Double] {
        [no3, nh4, p, k, ca, mg, s, cl, fe, zn, b, mn, cu, mo]
    }

    func toRpc() -> Fertilizer {
        Fertilizer(
            id:       UInt32(id ?? 0),
            userId:   UInt32(userId),
            userName: userName,
            name:     name,
            formula:  formula,
            elements: elements,
            bottle:   FertilizerBottle(rawValue: UInt8(bottle)) ?? .BOTTLE_A,
            type:     FertilizerType(rawValue: UInt8(fertilizerType)) ?? .DRY,
            density:  density,
            cost:     cost
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
        no3      = row["NO3"] ?? 0
        nh4      = row["NH4"] ?? 0
        p        = row["P"] ?? 0
        k        = row["K"] ?? 0
        ca       = row["Ca"] ?? 0
        mg       = row["Mg"] ?? 0
        s        = row["S"] ?? 0
        cl       = row["Cl"] ?? 0
        fe       = row["Fe"] ?? 0
        zn       = row["Zn"] ?? 0
        b        = row["B"] ?? 0
        mn       = row["Mn"] ?? 0
        cu       = row["Cu"] ?? 0
        mo       = row["Mo"] ?? 0
        bottle   = row["bottle"] ?? 0
        fertilizerType = row["fertilizerType"] ?? 0
        density  = row["density"] ?? 0
        cost     = row["cost"] ?? 1
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
        container["NO3"] = no3
        container["NH4"] = nh4
        container["P"] = p
        container["K"] = k
        container["Ca"] = ca
        container["Mg"] = mg
        container["S"] = s
        container["Cl"] = cl
        container["Fe"] = fe
        container["Zn"] = zn
        container["B"] = b
        container["Mn"] = mn
        container["Cu"] = cu
        container["Mo"] = mo
        container["bottle"] = bottle
        container["fertilizerType"] = fertilizerType
        container["density"] = density
        container["cost"] = cost
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

    func listPage(query: String, cursor: String, limit: UInt32) throws -> CursorPage<FertilizerRecord> {
        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let pageLimit = normalizedPageLimit(limit)
        let decodedCursor = try CatalogCursorCodec.decode(cursor)

        return try db.dbQueue.read { db in
            let namePattern = "%\(normalizedQuery)%"
            let rows = try FertilizerRecord.fetchAll(db, sql: """
                SELECT Fertilizer.*, User.name AS userName
                FROM Fertilizer
                JOIN User ON Fertilizer.userId = User.id
                WHERE (? = '' OR lower(Fertilizer.name) LIKE ?)
                  AND (
                    ? = ''
                    OR Fertilizer.name > ?
                    OR (Fertilizer.name = ? AND Fertilizer.id > ?)
                  )
                ORDER BY Fertilizer.name ASC, Fertilizer.id ASC
                LIMIT ?
            """, arguments: [
                normalizedQuery, namePattern,
                decodedCursor?.sortName ?? "", decodedCursor?.sortName ?? "", decodedCursor?.sortName ?? "", decodedCursor?.id ?? 0,
                pageLimit + 1,
            ])

            return try buildPage(from: rows, limit: pageLimit)
        }
    }

    func getFertilizer(id: Int64) throws -> FertilizerRecord? {
        try db.dbQueue.read { db in
            try FertilizerRecord.filter(Column("id") == id).fetchOne(db)
        }
    }

    private func buildPage(from rows: [FertilizerRecord], limit: Int) throws -> CursorPage<FertilizerRecord> {
        let items = Array(rows.prefix(limit))
        let nextCursor: String?

        if rows.count > limit, let last = items.last, let id = last.id {
            nextCursor = try CatalogCursorCodec.encode(sortName: last.name, id: id)
        } else {
            nextCursor = nil
        }

        return CursorPage(items: items, nextCursor: nextCursor)
    }

    // MARK: Write

    @discardableResult
    func addFertilizer(userId: Int64, name: String, formula: String) throws -> FertilizerRecord {
        let parsed = try FertilizerFormulaParser.parse(script: formula)
        var record = FertilizerRecord(id: nil, userId: userId, name: name, formula: formula, parsed: parsed)
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
        let parsed = try FertilizerFormulaParser.parse(script: formula)
        try db.dbQueue.write { db in
            try db.execute(
                sql: """
                    UPDATE Fertilizer
                    SET formula = ?,
                        NO3 = ?, NH4 = ?, P = ?, K = ?, Ca = ?, Mg = ?, S = ?, Cl = ?,
                        Fe = ?, Zn = ?, B = ?, Mn = ?, Cu = ?, Mo = ?,
                        bottle = ?, fertilizerType = ?, density = ?, cost = ?
                    WHERE id = ? AND userId = ?
                """,
                arguments: [
                    formula,
                    parsed.elements[0], parsed.elements[1], parsed.elements[2], parsed.elements[3], parsed.elements[4], parsed.elements[5], parsed.elements[6], parsed.elements[7],
                    parsed.elements[8], parsed.elements[9], parsed.elements[10], parsed.elements[11], parsed.elements[12], parsed.elements[13],
                    parsed.bottle, parsed.fertilizerType, parsed.density, parsed.cost,
                    id, userId,
                ]
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
