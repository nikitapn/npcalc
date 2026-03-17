import Foundation
import GRDB

struct SiteEventStateRecord {
    var id: Int64
    var configJSON: String
    var updatedAt: String
    var updatedBy: String?
}

extension SiteEventStateRecord: FetchableRecord {
    init(row: Row) {
        id = row["id"]
        configJSON = row["configJSON"]
        updatedAt = row["updatedAt"]
        updatedBy = row["updatedBy"]
    }
}

extension SiteEventStateRecord: PersistableRecord {
    static let databaseTableName = "SiteEventState"

    func encode(to container: inout PersistenceContainer) throws {
        container["id"] = id
        container["configJSON"] = configJSON
        container["updatedAt"] = updatedAt
        container["updatedBy"] = updatedBy
    }
}