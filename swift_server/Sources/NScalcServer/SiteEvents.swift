import Foundation
import GRDB
import NScalc

private struct SiteEventConfigDocument: Codable {
    var variant: String
    var enabled: Bool
    var autoPlay: Bool
    var startAt: String
    var endAt: String
    var durationSeconds: Int
    var intensity: String
    var updatedAt: String
    var updatedBy: String?
}

private struct SiteEventConfigStore: Sendable {
    private let db: AppDatabase
    private let sessionService: SessionService
    private let jsonEncoder: JSONEncoder
    private let jsonDecoder: JSONDecoder

    init(db: AppDatabase) {
        self.db = db
        self.sessionService = SessionService(db: db)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        self.jsonEncoder = encoder
        self.jsonDecoder = JSONDecoder()
    }

    func getConfigJSON() throws -> String {
        if let record: SiteEventStateRecord = try db.dbQueue.read({ db in
            try SiteEventStateRecord.filter(Column("id") == 1).fetchOne(db)
        }) {
            return try encode(normalize(documentFromStoredRecord(record)))
        }

        return try encode(defaultDocument())
    }

    func setConfigJSON(sessionId: String, configJSON: String) throws -> String {
        guard let user = try sessionService.user(forSession: sessionId) else {
            throw AuthorizationFailed(reason: .session_does_not_exist)
        }
        guard user.isAdmin else {
            throw PermissionViolation(msg: "Only admins can update site events.")
        }

        let normalized = try normalize(documentFromClientJSON(configJSON), updatedBy: user.name)
        let payload = try encode(normalized)
        let record = SiteEventStateRecord(
            id: 1,
            configJSON: payload,
            updatedAt: normalized.updatedAt,
            updatedBy: normalized.updatedBy
        )

        try db.dbQueue.write { db in
            try record.save(db)
        }

        return payload
    }

    private func documentFromStoredRecord(_ record: SiteEventStateRecord) -> SiteEventConfigDocument {
        if let data = record.configJSON.data(using: .utf8),
           let decoded = try? jsonDecoder.decode(SiteEventConfigDocument.self, from: data) {
            return decoded
        }

        var fallback = defaultDocument()
        fallback.updatedAt = record.updatedAt
        fallback.updatedBy = record.updatedBy
        return fallback
    }

    private func documentFromClientJSON(_ value: String) throws -> SiteEventConfigDocument {
        guard let data = value.data(using: .utf8) else {
            throw InvalidArgument(msg: "Site event config must be UTF-8 JSON.")
        }

        do {
            return try jsonDecoder.decode(SiteEventConfigDocument.self, from: data)
        } catch {
            throw InvalidArgument(msg: "Invalid site event config payload.")
        }
    }

    private func normalize(_ document: SiteEventConfigDocument, updatedBy: String? = nil) -> SiteEventConfigDocument {
        var normalized = document
        normalized.variant = ["fireworks", "snow"].contains(document.variant) ? document.variant : "fireworks"
        normalized.intensity = ["gentle", "showtime"].contains(document.intensity) ? document.intensity : "showtime"
        normalized.durationSeconds = min(30, max(8, document.durationSeconds))
        normalized.startAt = normalizeDateString(document.startAt)
        normalized.endAt = normalizeDateString(document.endAt)
        normalized.updatedAt = iso8601Now()
        normalized.updatedBy = updatedBy ?? document.updatedBy
        return normalized
    }

    private func encode(_ document: SiteEventConfigDocument) throws -> String {
        let data = try jsonEncoder.encode(document)
        guard let json = String(data: data, encoding: .utf8) else {
            throw InvalidArgument(msg: "Failed to encode site event config.")
        }
        return json
    }

    private func defaultDocument() -> SiteEventConfigDocument {
        SiteEventConfigDocument(
            variant: "fireworks",
            enabled: false,
            autoPlay: true,
            startAt: "",
            endAt: "",
            durationSeconds: 18,
            intensity: "showtime",
            updatedAt: iso8601Now(),
            updatedBy: nil
        )
    }

    private func normalizeDateString(_ value: String) -> String {
        guard !value.isEmpty else {
            return ""
        }
        return makeSiteEventFormFormatter().date(from: value) != nil ? value : ""
    }

    private func makeSiteEventFormFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        return formatter
    }

    private func iso8601Now() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: Date())
    }
}

final class SiteEventServiceServantImpl: SiteEventServiceServant, @unchecked Sendable {
    private let store: SiteEventConfigStore
    private static let emptyConfigJSON = "{\"variant\":\"fireworks\",\"enabled\":false,\"autoPlay\":true,\"startAt\":\"\",\"endAt\":\"\",\"durationSeconds\":18,\"intensity\":\"showtime\",\"updatedAt\":\"\",\"updatedBy\":null}"

    init(db: AppDatabase) {
        self.store = SiteEventConfigStore(db: db)
        super.init()
    }

    override func getSiteEventConfig() -> String {
        do {
            return try store.getConfigJSON()
        } catch {
            print("[SiteEvents] failed to load site event config: \(error)")
            return Self.emptyConfigJSON
        }
    }

    override func setSiteEventConfig(session_id: String, config_json: String) throws -> String {
        try store.setConfigJSON(sessionId: session_id, configJSON: config_json)
    }
}
