// Copyright (c) 2025 nikitapnn1@gmail.com

import GRDB

// MARK: - Column-name order mirrors ELEMENT enum in nscalc.npidl
// Index: 0=NO3  1=NH4  2=P  3=K  4=Ca  5=Mg  6=S   7=Cl
//        8=Fe   9=Zn  10=B  11=Mn 12=Cu 13=Mo
private let elementColumns = ["NO3","NH4","P","K","Ca","Mg","S","Cl","Fe","Zn","B","Mn","Cu","Mo"]

// MARK: - SolutionRecord

struct SolutionRecord {
    var id: Int64?
    var userId: Int64
    var name: String
    /// Populated only when fetched via the JOIN query in `SolutionService.getAll()`.
    var userName: String = ""

    // Stored as individual columns to match the existing database schema
    var no3, nh4, p, k, ca, mg, s, cl, fe, zn, b, mn, cu, mo: Double

    // MARK: Convenience array accessors

    var elements: [Double] {
        get { [no3, nh4, p, k, ca, mg, s, cl, fe, zn, b, mn, cu, mo] }
        set {
            guard newValue.count == 14 else { return }
            (no3, nh4, p,  k,  ca, mg,  s,  cl,
             fe,  zn,  b,  mn, cu, mo) =
            (newValue[0],  newValue[1],  newValue[2],  newValue[3],
             newValue[4],  newValue[5],  newValue[6],  newValue[7],
             newValue[8],  newValue[9],  newValue[10], newValue[11],
             newValue[12], newValue[13])
        }
    }

    // MARK: Init

    init(id: Int64? = nil, userId: Int64, name: String, elements: [Double]) {
        precondition(elements.count == 14, "Solution requires exactly 14 elements")
        self.id = id
        self.userId = userId
        self.name = name
        (no3, nh4, p,  k,  ca, mg,  s,  cl,
         fe,  zn,  b,  mn, cu, mo) =
        (elements[0],  elements[1],  elements[2],  elements[3],
         elements[4],  elements[5],  elements[6],  elements[7],
         elements[8],  elements[9],  elements[10], elements[11],
         elements[12], elements[13])
    }

    // MARK: Convert to NPRPC-generated type

    /// Creates the RPC wire type from this record.
    func toRpc() -> Solution {
        Solution(
            id:       UInt32(id ?? 0),
            userId:   UInt32(userId),
            userName: userName,
            name:     name,
            elements: elements
        )
    }
}

// MARK: - FetchableRecord

extension SolutionRecord: FetchableRecord {
    /// Reads both own columns and the `user_name` alias produced by the JOIN query.
    init(row: Row) {
        id     = row["id"]
        userId = row["userId"]
        name   = row["name"]
        // Present only in the JOIN query; absent in single-row lookups.
        userName = (row["user_name"] as String?) ?? ""
        no3 = row["NO3"]; nh4 = row["NH4"]; p  = row["P"];  k  = row["K"]
        ca  = row["Ca"];  mg  = row["Mg"];  s  = row["S"];  cl = row["Cl"]
        fe  = row["Fe"];  zn  = row["Zn"];  b  = row["B"];  mn = row["Mn"]
        cu  = row["Cu"];  mo  = row["Mo"]
    }
}

// MARK: - MutablePersistableRecord

extension SolutionRecord: MutablePersistableRecord {
    static let databaseTableName = "Solution"

    func encode(to container: inout PersistenceContainer) throws {
        container["userId"] = userId
        container["name"]   = name
        container["NO3"]  = no3; container["NH4"] = nh4
        container["P"]    = p;   container["K"]   = k
        container["Ca"]   = ca;  container["Mg"]  = mg
        container["S"]    = s;   container["Cl"]  = cl
        container["Fe"]   = fe;  container["Zn"]  = zn
        container["B"]    = b;   container["Mn"]  = mn
        container["Cu"]   = cu;  container["Mo"]  = mo
        // id is AUTOINCREMENT — omitted so SQLite assigns it
        // userName is derived from a JOIN — never written to the table
    }

    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

// MARK: - SolutionService

struct SolutionService: Sendable {
    let db: AppDatabase

    // MARK: Read

    /// Returns all solutions joined with their owner's name, sorted by name.
    /// Matches C++ `SolutionService::getAll()`.
    func getAll() throws -> [SolutionRecord] {
        try db.dbQueue.read { db in
            try SolutionRecord.fetchAll(db, sql: """
                SELECT Solution.*, User.name AS user_name
                FROM Solution
                JOIN User ON Solution.userId = User.id
                ORDER BY Solution.name ASC
            """)
        }
    }

    func getSolution(id: Int64) throws -> SolutionRecord? {
        try db.dbQueue.read { db in
            try SolutionRecord.filter(Column("id") == id).fetchOne(db)
        }
    }

    // MARK: Write

    @discardableResult
    func addSolution(userId: Int64, name: String, elements: [Double]) throws -> SolutionRecord {
        var record = SolutionRecord(userId: userId, name: name, elements: elements)
        try db.dbQueue.write { db in
            try record.insert(db)
        }
        return record
    }

    func updateName(id: Int64, userId: Int64, name: String) throws {
        try db.dbQueue.write { db in
            try db.execute(
                sql: "UPDATE Solution SET name = ? WHERE id = ? AND userId = ?",
                arguments: [name, id, userId]
            )
        }
    }

    func updateElements(id: Int64, userId: Int64, indexedValues: [(index: Int, value: Double)]) throws {
        guard !indexedValues.isEmpty else { return }
        let setClauses = indexedValues.map { pair -> String in
            guard pair.index < elementColumns.count else {
                fatalError("Element index \(pair.index) out of range")
            }
            return "\(elementColumns[pair.index]) = \(pair.value)"
        }.joined(separator: ", ")
        try db.dbQueue.write { db in
            try db.execute(
                sql: "UPDATE Solution SET \(setClauses) WHERE id = \(id) AND userId = \(userId)"
            )
        }
    }

    @discardableResult
    func deleteSolution(id: Int64, userId: Int64) throws -> Bool {
        try db.dbQueue.write { db in
            try db.execute(
                sql: "DELETE FROM Solution WHERE id = ? AND userId = ?",
                arguments: [id, userId]
            )
            return db.changesCount > 0
        }
    }
}
