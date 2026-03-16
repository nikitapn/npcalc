import Foundation

struct CursorPage<Record> {
    var items: [Record]
    var nextCursor: String?
}

struct CatalogCursor: Codable {
    var sortName: String
    var id: Int64
}

enum CatalogCursorCodec {
    static func decode(_ rawCursor: String) throws -> CatalogCursor? {
        let trimmed = rawCursor.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        guard let data = Data(base64Encoded: trimmed) else {
            throw FertilizerValidationError.invalidFormula("invalid cursor")
        }

        return try JSONDecoder().decode(CatalogCursor.self, from: data)
    }

    static func encode(sortName: String, id: Int64) throws -> String {
        let data = try JSONEncoder().encode(CatalogCursor(sortName: sortName, id: id))
        return data.base64EncodedString()
    }
}

func normalizedPageLimit(_ limit: UInt32, defaultLimit: Int = 24, maxLimit: Int = 100) -> Int {
    let requested = Int(limit)
    if requested <= 0 {
        return defaultLimit
    }
    return min(requested, maxLimit)
}