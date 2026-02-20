// Copyright (c) 2025 nikitapnn1@gmail.com

import Foundation
import GRDB
import Crypto  // swift-crypto — cross-platform SHA-256

// MARK: - UserRecord

struct UserRecord: Equatable {
    var id: Int64?
    var name: String
    var pwdHash: Data    // SHA-256, 32 bytes
    var email: String
    var permissions: Int32  // bitmask: bit 0 = admin, bit 1 = socks5 proxy
}

// MARK: FetchableRecord

extension UserRecord: FetchableRecord {
    init(row: Row) {
        id          = row["id"]
        name        = row["name"]
        pwdHash     = row["pwd"]
        email       = row["email"]
        permissions = row["permissions"]
    }
}

// MARK: MutablePersistableRecord

extension UserRecord: MutablePersistableRecord {
    static let databaseTableName = "User"

    func encode(to container: inout PersistenceContainer) throws {
        container["name"]        = name
        container["pwd"]         = pwdHash
        container["email"]       = email
        container["permissions"] = permissions
        // id is AUTOINCREMENT — only written on explicit insert by id
    }

    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

// MARK: - Password helpers

extension UserRecord {
    /// SHA-256 of the UTF-8 encoded password string (mirrors C++ `UserService::sha256`).
    static func hashPassword(_ password: String) -> Data {
        let digest = SHA256.hash(data: Data(password.utf8))
        return Data(digest)
    }

    /// Returns `true` if `password` matches the stored hash.
    func verifyPassword(_ password: String) -> Bool {
        UserRecord.hashPassword(password) == pwdHash
    }

    var isAdmin: Bool   { permissions & 1 != 0 }
    var canUseSocks: Bool { permissions & 2 != 0 }
}

// MARK: - UserService

/// Thin service layer that wraps GRDB queries, mirroring C++ `UserService`.
/// All methods that write use `dbQueue.write(_:)` for transactional safety.
struct UserService: Sendable {
    let db: AppDatabase

    // MARK: Read

    func user(byEmail email: String) throws -> UserRecord? {
        try db.dbQueue.read { db in
            try UserRecord.filter(Column("email") == email.lowercased()).fetchOne(db)
        }
    }

    func user(byName name: String) throws -> UserRecord? {
        try db.dbQueue.read { db in
            try UserRecord.filter(Column("name") == name).fetchOne(db)
        }
    }

    func user(byId id: Int64) throws -> UserRecord? {
        try db.dbQueue.read { db in
            try UserRecord.filter(Column("id") == id).fetchOne(db)
        }
    }

    func isEmailAvailable(_ email: String) throws -> Bool {
        try user(byEmail: email.lowercased()) == nil
    }

    func isUsernameAvailable(_ name: String) throws -> Bool {
        try user(byName: name) == nil
    }

    // MARK: Write

    @discardableResult
    func addUser(name: String, email: String, password: String, permissions: Int32 = 0) throws -> UserRecord {
        var record = UserRecord(
            id: nil,
            name: name,
            pwdHash: UserRecord.hashPassword(password),
            email: email.lowercased(),
            permissions: permissions
        )
        try db.dbQueue.write { db in
            try record.insert(db)
        }
        return record
    }
}
