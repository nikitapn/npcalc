// Copyright (c) 2025 nikitapnn1@gmail.com

import Foundation
import GRDB

// MARK: - UserSessionRecord

struct UserSessionRecord {
    /// UUID string — this is the primary key.
    var sessionId: String
    var userId: Int64
}

// MARK: - FetchableRecord

extension UserSessionRecord: FetchableRecord {
    init(row: Row) {
        sessionId = row["sessionId"]
        userId    = row["userId"]
    }
}

// MARK: - PersistableRecord (session IDs are created externally, no AUTOINCREMENT)

extension UserSessionRecord: PersistableRecord {
    static let databaseTableName = "UserSession"

    func encode(to container: inout PersistenceContainer) throws {
        container["sessionId"] = sessionId
        container["userId"]    = userId
    }
}

// MARK: - SessionService

struct SessionService: Sendable {
    let db: AppDatabase

    // MARK: Read

    func user(forSession sessionId: String) throws -> UserRecord? {
        try db.dbQueue.read { db in
            guard let session = try UserSessionRecord
                .filter(Column("sessionId") == sessionId)
                .fetchOne(db)
            else { return nil }
            return try UserRecord.filter(Column("id") == session.userId).fetchOne(db)
        }
    }

    // MARK: Write

    /// Creates a new session for the given user and returns the session UUID.
    /// Matches C++ `UserService::create_uuid()` + session insertion.
    @discardableResult
    func createSession(userId: Int64) throws -> String {
        let id = UUID().uuidString
        let record = UserSessionRecord(sessionId: id, userId: userId)
        try db.dbQueue.write { db in
            try record.insert(db)
        }
        return id
    }

    func deleteSession(_ sessionId: String) throws {
        try db.dbQueue.write { db in
            try UserSessionRecord
                .filter(Column("sessionId") == sessionId)
                .deleteAll(db)
        }
    }
}
