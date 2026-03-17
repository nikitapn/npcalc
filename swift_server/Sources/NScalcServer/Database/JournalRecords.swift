import Foundation
import GRDB
import NScalc

struct JournalStoryRecord {
    var id: Int64?
    var slug: String
    var title: String
    var cropName: String
    var description: String
    var coverImageURL: String?
    var solutionId: Int64?
    var solutionName: String?
    var authorName: String
    var visibility: Int32
    var stage: Int32
    var createdAt: String
    var updatedAt: String

    func toRpc() -> StoryDetail {
        StoryDetail(
            id: UInt64(id ?? 0),
            slug: slug,
            title: title,
            crop_name: cropName,
            description: description,
            cover_image_url: coverImageURL,
            solution_id: solutionId.map(UInt32.init),
            solution_name: solutionName,
            author_name: authorName,
            visibility: StoryVisibility(rawValue: UInt32(visibility)) ?? .Private,
            stage: StoryStage(rawValue: UInt32(stage)) ?? .Planning,
            created_at: createdAt,
            updated_at: updatedAt
        )
    }

    static func from(rpc: StoryDetail) -> JournalStoryRecord {
        JournalStoryRecord(
            id: Int64(rpc.id),
            slug: rpc.slug,
            title: rpc.title,
            cropName: rpc.crop_name,
            description: rpc.description,
            coverImageURL: rpc.cover_image_url,
            solutionId: rpc.solution_id.map(Int64.init),
            solutionName: rpc.solution_name,
            authorName: rpc.author_name,
            visibility: Int32(rpc.visibility.rawValue),
            stage: Int32(rpc.stage.rawValue),
            createdAt: rpc.created_at,
            updatedAt: rpc.updated_at
        )
    }
}

extension JournalStoryRecord: FetchableRecord {
    init(row: Row) {
        id = row["id"]
        slug = row["slug"]
        title = row["title"]
        cropName = row["cropName"]
        description = row["description"]
        coverImageURL = row["coverImageURL"]
        solutionId = row["solutionId"]
        solutionName = row["solutionName"]
        authorName = row["authorName"]
        visibility = row["visibility"]
        stage = row["stage"]
        createdAt = row["createdAt"]
        updatedAt = row["updatedAt"]
    }
}

extension JournalStoryRecord: MutablePersistableRecord {
    static let databaseTableName = "JournalStory"

    func encode(to container: inout PersistenceContainer) throws {
        container["id"] = id
        container["slug"] = slug
        container["title"] = title
        container["cropName"] = cropName
        container["description"] = description
        container["coverImageURL"] = coverImageURL
        container["solutionId"] = solutionId
        container["solutionName"] = solutionName
        container["authorName"] = authorName
        container["visibility"] = visibility
        container["stage"] = stage
        container["createdAt"] = createdAt
        container["updatedAt"] = updatedAt
    }

    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

struct JournalUpdateRecord {
    var id: Int64?
    var storyId: Int64
    var authorName: String
    var title: String?
    var body: String
    var kind: Int32
    var measurementsJSON: String?
    var createdAt: String

    func toRpc(media: [MediaAsset]) -> StoryUpdate {
        let decoder = JSONDecoder()
        let measurements: MeasurementSnapshot?
        if let measurementsJSON, let data = measurementsJSON.data(using: .utf8) {
            measurements = try? decoder.decode(MeasurementSnapshot.self, from: data)
        } else {
            measurements = nil
        }

        return StoryUpdate(
            id: UInt64(id ?? 0),
            story_id: UInt64(storyId),
            author_name: authorName,
            title: title,
            body: body,
            kind: UpdateKind(rawValue: UInt32(kind)) ?? .Note,
            measurements: measurements,
            media: media,
            created_at: createdAt
        )
    }

    static func from(rpc: StoryUpdate) -> JournalUpdateRecord {
        let encoder = JSONEncoder()
        let measurementsJSON: String?
        if let measurements = rpc.measurements,
           let data = try? encoder.encode(measurements),
           let json = String(data: data, encoding: .utf8) {
            measurementsJSON = json
        } else {
            measurementsJSON = nil
        }

        return JournalUpdateRecord(
            id: Int64(rpc.id),
            storyId: Int64(rpc.story_id),
            authorName: rpc.author_name,
            title: rpc.title,
            body: rpc.body,
            kind: Int32(rpc.kind.rawValue),
            measurementsJSON: measurementsJSON,
            createdAt: rpc.created_at
        )
    }
}

extension JournalUpdateRecord: FetchableRecord {
    init(row: Row) {
        id = row["id"]
        storyId = row["storyId"]
        authorName = row["authorName"]
        title = row["title"]
        body = row["body"]
        kind = row["kind"]
        measurementsJSON = row["measurementsJSON"]
        createdAt = row["createdAt"]
    }
}

extension JournalUpdateRecord: MutablePersistableRecord {
    static let databaseTableName = "JournalUpdate"

    func encode(to container: inout PersistenceContainer) throws {
        container["id"] = id
        container["storyId"] = storyId
        container["authorName"] = authorName
        container["title"] = title
        container["body"] = body
        container["kind"] = kind
        container["measurementsJSON"] = measurementsJSON
        container["createdAt"] = createdAt
    }

    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

struct JournalMediaAssetRecord {
    var id: Int64?
    var updateId: Int64
    var kind: Int32
    var status: Int32
    var originalFilename: String
    var mimeType: String
    var byteSize: Int64
    var width: Int32?
    var height: Int32?
    var durationMs: Int64?
    var imageURL: String?
    var posterURL: String?
    var dashManifestURL: String?
    var createdAt: String
    var errorMessage: String?
    var attached: Bool

    func toRpc() -> MediaAsset {
        MediaAsset(
            id: UInt64(id ?? 0),
            kind: MediaKind(rawValue: UInt32(kind)) ?? .Image,
            status: MediaStatus(rawValue: UInt32(status)) ?? .PendingUpload,
            original_filename: originalFilename,
            mime_type: mimeType,
            byte_size: UInt64(byteSize),
            width: width.map(UInt32.init),
            height: height.map(UInt32.init),
            duration_ms: durationMs.map(UInt64.init),
            image_url: imageURL,
            poster_url: posterURL,
            dash_manifest_url: dashManifestURL,
            created_at: createdAt,
            error_message: errorMessage
        )
    }

    static func from(rpc: MediaAsset, updateId: UInt64, attached: Bool) -> JournalMediaAssetRecord {
        JournalMediaAssetRecord(
            id: Int64(rpc.id),
            updateId: Int64(updateId),
            kind: Int32(rpc.kind.rawValue),
            status: Int32(rpc.status.rawValue),
            originalFilename: rpc.original_filename,
            mimeType: rpc.mime_type,
            byteSize: Int64(rpc.byte_size),
            width: rpc.width.map(Int32.init),
            height: rpc.height.map(Int32.init),
            durationMs: rpc.duration_ms.map(Int64.init),
            imageURL: rpc.image_url,
            posterURL: rpc.poster_url,
            dashManifestURL: rpc.dash_manifest_url,
            createdAt: rpc.created_at,
            errorMessage: rpc.error_message,
            attached: attached
        )
    }
}

extension JournalMediaAssetRecord: FetchableRecord {
    init(row: Row) {
        id = row["id"]
        updateId = row["updateId"]
        kind = row["kind"]
        status = row["status"]
        originalFilename = row["originalFilename"]
        mimeType = row["mimeType"]
        byteSize = row["byteSize"]
        width = row["width"]
        height = row["height"]
        durationMs = row["durationMs"]
        imageURL = row["imageURL"]
        posterURL = row["posterURL"]
        dashManifestURL = row["dashManifestURL"]
        createdAt = row["createdAt"]
        errorMessage = row["errorMessage"]
        attached = row["attached"]
    }
}

extension JournalMediaAssetRecord: MutablePersistableRecord {
    static let databaseTableName = "JournalMediaAsset"

    func encode(to container: inout PersistenceContainer) throws {
        container["id"] = id
        container["updateId"] = updateId
        container["kind"] = kind
        container["status"] = status
        container["originalFilename"] = originalFilename
        container["mimeType"] = mimeType
        container["byteSize"] = byteSize
        container["width"] = width
        container["height"] = height
        container["durationMs"] = durationMs
        container["imageURL"] = imageURL
        container["posterURL"] = posterURL
        container["dashManifestURL"] = dashManifestURL
        container["createdAt"] = createdAt
        container["errorMessage"] = errorMessage
        container["attached"] = attached
    }

    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}

struct JournalUploadSessionRecord {
    var assetId: Int64
    var storyId: Int64
    var updateId: Int64?
    var kind: Int32
    var token: String
    var bytesReceived: Int64
}

extension JournalUploadSessionRecord: FetchableRecord {
    init(row: Row) {
        assetId = row["assetId"]
        storyId = row["storyId"]
        updateId = row["updateId"]
        kind = row["kind"]
        token = row["token"]
        bytesReceived = row["bytesReceived"]
    }
}

extension JournalUploadSessionRecord: MutablePersistableRecord {
    static let databaseTableName = "JournalUploadSession"

    func encode(to container: inout PersistenceContainer) throws {
        container["assetId"] = assetId
        container["storyId"] = storyId
        container["updateId"] = updateId
        container["kind"] = kind
        container["token"] = token
        container["bytesReceived"] = bytesReceived
    }
}