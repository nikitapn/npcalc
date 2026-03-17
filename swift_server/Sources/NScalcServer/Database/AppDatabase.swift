// Copyright (c) 2025 nikitapnn1@gmail.com
// Manages the SQLite connection and schema migrations.

import Foundation
import GRDB

// MARK: - AppDatabase

/// Thin wrapper around a GRDB `DatabaseQueue`.
///
/// `DatabaseQueue` serialises all reads and writes on a single connection,
/// matching the `SQLITE_CONFIG_SERIALIZED` requirement the C++ server verifies.
/// It is `Sendable`, so it is safe to pass across Swift 6 actor boundaries.
final class AppDatabase: Sendable {
    let dbQueue: DatabaseQueue

    init(path: String) throws {
        var config = Configuration()
        config.foreignKeysEnabled = true      // equivalent to PRAGMA foreign_keys = ON
        config.label = "NScalcDB"

        dbQueue = try DatabaseQueue(path: path, configuration: config)
        try runMigrations()
    }

    // In-memory database — useful for tests.
    static func makeShared() throws -> AppDatabase {
        try AppDatabase(path: ":memory:")
    }

    // MARK: - Migrations

    private func runMigrations() throws {
        var migrator = DatabaseMigrator()

        // v1 — initial schema (mirrors database/create.sql)
        migrator.registerMigration("v1") { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS User (
                  id          INTEGER PRIMARY KEY AUTOINCREMENT,
                  name        TEXT    NOT NULL,
                  pwd         BLOB,
                  email       TEXT    NOT NULL UNIQUE,
                  permissions INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS UserSession (
                  sessionId TEXT PRIMARY KEY,
                  userId    INTEGER NOT NULL,
                  FOREIGN KEY (userId) REFERENCES User (id)
                );

                CREATE TABLE IF NOT EXISTS Calculation (
                  id             INTEGER PRIMARY KEY AUTOINCREMENT,
                  userId         INTEGER NOT NULL,
                  name           TEXT    NOT NULL,
                  elements       TEXT,
                  fertilizersIds TEXT,
                  volume         REAL    NOT NULL,
                  mode           BOOLEAN NOT NULL,
                  FOREIGN KEY (userId) REFERENCES User (id)
                );

                CREATE INDEX IF NOT EXISTS Calculation_userId ON Calculation (userId);

                CREATE TABLE IF NOT EXISTS Solution (
                  id     INTEGER PRIMARY KEY AUTOINCREMENT,
                  userId INTEGER NOT NULL,
                  name   TEXT    NOT NULL,
                  NO3    REAL,  NH4 REAL,  P   REAL,  K   REAL,
                  Ca     REAL,  Mg  REAL,  S   REAL,  Cl  REAL,
                  Fe     REAL,  Zn  REAL,  B   REAL,  Mn  REAL,
                  Cu     REAL,  Mo  REAL,
                  FOREIGN KEY (userId) REFERENCES User (id)
                );

                CREATE INDEX IF NOT EXISTS Solution_userId ON Solution (userId);

                CREATE TABLE IF NOT EXISTS Fertilizer (
                  id     INTEGER PRIMARY KEY AUTOINCREMENT,
                  userId INTEGER NOT NULL,
                  name   TEXT    NOT NULL,
                  formula TEXT,
                  FOREIGN KEY (userId) REFERENCES User (id)
                );
            """)

            // Seed built-in accounts (INSERT OR IGNORE = safe on existing databases)
            // Passwords are SHA-256 blobs stored as hex:
            //   superuser → "1234"   (03AC674216F3E15C761EE1A5E255F067953623C8B388B4459E13F978D7C846F4)
            //   guest     → complex  (AB6E4C3DD47810AE0ABC821A2DE8A25B38C1DF86B49CDEFCB58C4A55F9923902)
            try db.execute(sql: """
                INSERT OR IGNORE INTO User (id, name, pwd, email, permissions) VALUES
                  (1, 'superuser',
                   X'03AC674216F3E15C761EE1A5E255F067953623C8B388B4459E13F978D7C846F4',
                   'superuser@nscalc.com', 3),
                  (2, 'guest',
                   X'AB6E4C3DD47810AE0ABC821A2DE8A25B38C1DF86B49CDEFCB58C4A55F9923902',
                   'guest@nscalc.com', 0);
            """)
        }

          migrator.registerMigration("v2_fertilizer_parsed_fields") { db in
            try db.execute(sql: """
              ALTER TABLE Fertilizer ADD COLUMN NO3 REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN NH4 REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN P REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN K REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN Ca REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN Mg REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN S REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN Cl REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN Fe REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN Zn REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN B REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN Mn REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN Cu REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN Mo REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN bottle INTEGER NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN fertilizerType INTEGER NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN density REAL NOT NULL DEFAULT 0;
              ALTER TABLE Fertilizer ADD COLUMN cost REAL NOT NULL DEFAULT 1;
            """)

            let rows = try Row.fetchAll(db, sql: "SELECT id, formula FROM Fertilizer")
            for row in rows {
              let id: Int64 = row["id"]
              let formula = (row["formula"] as String?) ?? ""
              let parsed = try FertilizerFormulaParser.parse(script: formula)
              try db.execute(
                sql: """
                  UPDATE Fertilizer
                  SET NO3 = ?, NH4 = ?, P = ?, K = ?, Ca = ?, Mg = ?, S = ?, Cl = ?,
                    Fe = ?, Zn = ?, B = ?, Mn = ?, Cu = ?, Mo = ?,
                    bottle = ?, fertilizerType = ?, density = ?, cost = ?
                  WHERE id = ?
                """,
                arguments: [
                  parsed.elements[0], parsed.elements[1], parsed.elements[2], parsed.elements[3], parsed.elements[4], parsed.elements[5], parsed.elements[6], parsed.elements[7],
                  parsed.elements[8], parsed.elements[9], parsed.elements[10], parsed.elements[11], parsed.elements[12], parsed.elements[13],
                  parsed.bottle, parsed.fertilizerType, parsed.density, parsed.cost,
                  id,
                ]
              )
            }
          }

        migrator.registerMigration("v3_grow_journal") { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS JournalStory (
                  id INTEGER PRIMARY KEY,
                  slug TEXT NOT NULL UNIQUE,
                  title TEXT NOT NULL,
                  cropName TEXT NOT NULL,
                  description TEXT NOT NULL,
                  coverImageURL TEXT,
                  solutionId INTEGER,
                  solutionName TEXT,
                  authorName TEXT NOT NULL,
                  visibility INTEGER NOT NULL,
                  stage INTEGER NOT NULL,
                  createdAt TEXT NOT NULL,
                  updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS JournalUpdate (
                  id INTEGER PRIMARY KEY,
                  storyId INTEGER NOT NULL,
                  authorName TEXT NOT NULL,
                  title TEXT,
                  body TEXT NOT NULL,
                  kind INTEGER NOT NULL,
                  measurementsJSON TEXT,
                  createdAt TEXT NOT NULL,
                  FOREIGN KEY (storyId) REFERENCES JournalStory (id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS JournalUpdate_storyId ON JournalUpdate (storyId);

                CREATE TABLE IF NOT EXISTS JournalMediaAsset (
                  id INTEGER PRIMARY KEY,
                  updateId INTEGER NOT NULL,
                  kind INTEGER NOT NULL,
                  status INTEGER NOT NULL,
                  originalFilename TEXT NOT NULL,
                  mimeType TEXT NOT NULL,
                  byteSize INTEGER NOT NULL,
                  width INTEGER,
                  height INTEGER,
                  durationMs INTEGER,
                  imageURL TEXT,
                  posterURL TEXT,
                  dashManifestURL TEXT,
                  createdAt TEXT NOT NULL,
                  errorMessage TEXT,
                  attached BOOLEAN NOT NULL DEFAULT 0,
                  FOREIGN KEY (updateId) REFERENCES JournalUpdate (id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS JournalMediaAsset_updateId ON JournalMediaAsset (updateId);
            """)
        }

            migrator.registerMigration("v4_grow_journal_recovery") { db in
              try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS JournalUploadSession (
                  assetId INTEGER PRIMARY KEY,
                  storyId INTEGER NOT NULL,
                  updateId INTEGER,
                  kind INTEGER NOT NULL,
                  token TEXT NOT NULL,
                  bytesReceived INTEGER NOT NULL,
                  FOREIGN KEY (assetId) REFERENCES JournalMediaAsset (id) ON DELETE CASCADE,
                  FOREIGN KEY (storyId) REFERENCES JournalStory (id) ON DELETE CASCADE,
                  FOREIGN KEY (updateId) REFERENCES JournalUpdate (id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS JournalUploadSession_storyId ON JournalUploadSession (storyId);
              """)
            }

        migrator.registerMigration("v5_site_events") { db in
            try db.execute(sql: """
                CREATE TABLE IF NOT EXISTS SiteEventState (
                  id INTEGER PRIMARY KEY CHECK (id = 1),
                  configJSON TEXT NOT NULL,
                  updatedAt TEXT NOT NULL,
                  updatedBy TEXT
                );
            """)
        }

        try migrator.migrate(dbQueue)
    }
}
