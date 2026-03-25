import Foundation
import NPRPC
import NScalc
import GRDB

private final class GrowJournalPublicAssetPublisher {
    private let fileManager = FileManager.default
    private let mediaRootURL: URL
    private let publicAssetsRootURL: URL

    init(mediaRootPath: String = "/app/sample_data/grow_journal_media", publicRootPath: String = "/app/runtime/www") {
        mediaRootURL = URL(fileURLWithPath: mediaRootPath, isDirectory: true)
        publicAssetsRootURL = URL(fileURLWithPath: publicRootPath, isDirectory: true)
            .appendingPathComponent("mock", isDirectory: true)
            .appendingPathComponent("journal", isDirectory: true)
            .appendingPathComponent("assets", isDirectory: true)
    }

    func stageAndPublishImageAsset(assetId: UInt64, originalFilename: String, payload: [UInt8]) throws {
        let originalDirectoryURL = mediaRootURL
            .appendingPathComponent("original", isDirectory: true)
            .appendingPathComponent(String(assetId), isDirectory: true)
        try fileManager.createDirectory(at: originalDirectoryURL, withIntermediateDirectories: true)

        let sourceURL = originalDirectoryURL.appendingPathComponent("source.\(sanitizedExtension(from: originalFilename, fallback: "bin"))")
        if fileManager.fileExists(atPath: sourceURL.path) {
            try fileManager.removeItem(at: sourceURL)
        }
        try Data(payload).write(to: sourceURL, options: .atomic)
        try publishImageAsset(assetId: assetId)
    }

    func publishImageAsset(assetId: UInt64) throws {
        guard let sourceURL = originalSourceURL(assetId: assetId) else {
            throw NSError(domain: "GrowJournalPublicAssetPublisher", code: 1, userInfo: [NSLocalizedDescriptionKey: "Original image for asset \(assetId) was not found."])
        }

        let publicAssetDirectoryURL = try preparePublicAssetDirectory(assetId: assetId)
        try replaceWithCopy(sourceURL: sourceURL, destinationURL: publicAssetDirectoryURL.appendingPathComponent("image"))
    }

    func hasImageAsset(assetId: UInt64) -> Bool {
        originalSourceURL(assetId: assetId) != nil
    }

    func publishVideoAsset(assetId: UInt64) throws {
        let processedDirectoryURL = mediaRootURL
            .appendingPathComponent("processed", isDirectory: true)
            .appendingPathComponent(String(assetId), isDirectory: true)
        let publicAssetDirectoryURL = try preparePublicAssetDirectory(assetId: assetId)

        let adaptiveManifestURL = processedDirectoryURL.appendingPathComponent("adaptive.mpd")
        let legacyManifestURL = processedDirectoryURL.appendingPathComponent("manifest.mpd")
        let publicManifestURL = publicAssetDirectoryURL.appendingPathComponent("manifest.mpd")
        if fileManager.fileExists(atPath: adaptiveManifestURL.path) {
            try replaceWithCopy(sourceURL: adaptiveManifestURL, destinationURL: publicManifestURL)
        } else if fileManager.fileExists(atPath: legacyManifestURL.path) {
            try replaceWithCopy(sourceURL: legacyManifestURL, destinationURL: publicManifestURL)
        } else {
            try removeIfExists(publicManifestURL)
        }

        let posterURL = processedDirectoryURL.appendingPathComponent("poster.jpg")
        let publicPosterURL = publicAssetDirectoryURL.appendingPathComponent("poster.jpg")
        if fileManager.fileExists(atPath: posterURL.path) {
            try replaceWithCopy(sourceURL: posterURL, destinationURL: publicPosterURL)
        } else {
            try removeIfExists(publicPosterURL)
        }
    }

    func removePublishedAsset(assetId: UInt64) {
        let assetDirectoryURL = publicAssetsRootURL.appendingPathComponent(String(assetId), isDirectory: true)
        guard fileManager.fileExists(atPath: assetDirectoryURL.path) else {
            return
        }
        do {
            try fileManager.removeItem(at: assetDirectoryURL)
        } catch {
            print("[GrowJournalPublicAssetPublisher] failed to remove public asset \(assetId): \(error)")
        }
    }

    private func preparePublicAssetDirectory(assetId: UInt64) throws -> URL {
        try fileManager.createDirectory(at: publicAssetsRootURL, withIntermediateDirectories: true)
        let directoryURL = publicAssetsRootURL.appendingPathComponent(String(assetId), isDirectory: true)
        try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        return directoryURL
    }

    private func originalSourceURL(assetId: UInt64) -> URL? {
        let directoryURL = mediaRootURL
            .appendingPathComponent("original", isDirectory: true)
            .appendingPathComponent(String(assetId), isDirectory: true)
        guard let entries = try? fileManager.contentsOfDirectory(at: directoryURL, includingPropertiesForKeys: nil) else {
            return nil
        }
        return entries
            .filter { $0.lastPathComponent.hasPrefix("source.") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .first
    }

    private func replaceWithCopy(sourceURL: URL, destinationURL: URL) throws {
        try removeIfExists(destinationURL)
        try fileManager.copyItem(at: sourceURL, to: destinationURL)
    }

    private func removeIfExists(_ url: URL) throws {
        do {
            try fileManager.removeItem(at: url)
        } catch let error as NSError {
            if error.domain == NSCocoaErrorDomain, error.code == CocoaError.fileNoSuchFile.rawValue {
                return
            }
            throw error
        }
    }

    private func sanitizedExtension(from filename: String, fallback: String) -> String {
        let ext = URL(fileURLWithPath: filename).pathExtension.lowercased()
        let allowed = ext.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) }
        return allowed && !ext.isEmpty ? ext : fallback
    }
}

final class GrowJournalStore: @unchecked Sendable {
    private struct StoryRecord {
        var detail: StoryDetail
        var updates: [StoryUpdate]
    }

    private struct UploadSession {
        var assetId: UInt64
        var storyId: UInt64
        var updateId: UInt64?
        var kind: MediaKind
        var token: String
        var bytesReceived: UInt64
        var payload: [UInt8]
    }

    private struct VideoProcessingJob {
        var assetId: UInt64
        var storyId: UInt64
        var originalFilename: String
    }

    private let fileManager = FileManager.default
    private let lock = NSLock()
    private var nextStoryId: UInt64 = 100
    private var nextUpdateId: UInt64 = 1000
    private var nextAssetId: UInt64 = 5000
    private var stories: [UInt64: StoryRecord] = [:]
    private var storySlugs: [String: UInt64] = [:]
    private var assets: [UInt64: MediaAsset] = [:]
    private var assetUpdateIds: [UInt64: UInt64] = [:]
    private var attachedAssetIds: Set<UInt64> = []
    private var uploads: [UInt64: UploadSession] = [:]
    private var mediaPayloads: [UInt64: [UInt8]] = [:]
    private var watchers: [UInt64: [UUID: NPRPCStreamWriter<StoryStreamServerEvent>]] = [:]
    private let db: AppDatabase
    private let sessionService: SessionService
    private let videoProcessor: GrowJournalVideoProcessor
    private let publicAssetPublisher: GrowJournalPublicAssetPublisher
    private let mediaRootURL: URL
    private let uploadSpoolRootURL: URL

    init(db: AppDatabase, videoRootPath: String = "/app/sample_data/grow_journal_media", publicRootPath: String = "/app/runtime/www") {
        self.db = db
        self.sessionService = SessionService(db: db)
        self.videoProcessor = GrowJournalVideoProcessor(rootPath: videoRootPath)
        self.publicAssetPublisher = GrowJournalPublicAssetPublisher(mediaRootPath: videoRootPath, publicRootPath: publicRootPath)
        self.mediaRootURL = URL(fileURLWithPath: videoRootPath, isDirectory: true)
        self.uploadSpoolRootURL = self.mediaRootURL.appendingPathComponent("uploads", isDirectory: true)
        do {
            try fileManager.createDirectory(at: uploadSpoolRootURL, withIntermediateDirectories: true)
            try loadStateFromDatabase()
            if stories.isEmpty {
                seedData()
                try persistCurrentStateToDatabase()
            }
            try restoreUploadSessionsFromDatabase()
        } catch {
            print("[GrowJournal] failed to load journal state from DB: \(error)")
            seedData()
            do {
                try persistCurrentStateToDatabase()
            } catch {
                print("[GrowJournal] failed to persist seeded journal state: \(error)")
            }
        }
        reconcilePersistedVideoAssets()
        publishPersistedAssets()
        recoverInterruptedVideoJobs()
    }

    func listStories(page: UInt32, pageSize: UInt32) -> StoryPage {
        withLock {
            let ordered = stories.values
                .map(\.detail)
                .sorted { lhs, rhs in lhs.updated_at > rhs.updated_at }
            let slice = paginate(items: ordered, page: page, pageSize: pageSize)
            return StoryPage(
                page: page,
                page_size: pageSize,
                total_stories: UInt32(ordered.count),
                stories: slice.map(makePreview)
            )
        }
    }

    func getStory(slug: String) throws -> StoryDetail {
        try withLock {
            guard let storyId = storySlugs[slug], let record = stories[storyId] else {
                throw NotFound(msg: "Story not found")
            }
            return record.detail
        }
    }

    func listUpdates(storyId: UInt64, page: UInt32, pageSize: UInt32) throws -> UpdatePage {
        try withLock {
            guard let record = stories[storyId] else {
                throw NotFound(msg: "Story not found")
            }
            let ordered = record.updates.sorted { lhs, rhs in lhs.created_at > rhs.created_at }
            let slice = paginate(items: ordered, page: page, pageSize: pageSize)
            return UpdatePage(
                page: page,
                page_size: pageSize,
                total_updates: UInt32(ordered.count),
                updates: slice
            )
        }
    }

    func createStory(req: CreateStoryRequest) -> StoryDetail {
        let story = withLock { () -> StoryDetail in
            let storyId = nextStoryId
            nextStoryId += 1
            let createdAt = isoTimestamp(minutesFromNow: Int(storyId) - 130)
            let slug = makeUniqueSlug(from: req.title, fallbackId: storyId)
            let detail = StoryDetail(
                id: storyId,
                slug: slug,
                title: req.title,
                crop_name: req.crop_name,
                description: req.description,
                cover_image_url: nil,
                solution_id: req.solution_id,
                solution_name: req.solution_id.map { "Solution \($0)" },
                author_name: "demo grower",
                visibility: req.visibility,
                stage: .Planning,
                created_at: createdAt,
                updated_at: createdAt
            )
            stories[storyId] = StoryRecord(detail: detail, updates: [])
            storySlugs[slug] = storyId
            return detail
        }
        persistStory(story)
        return story
    }

    func createUpdate(req: CreateUpdateRequest) throws -> StoryUpdate {
        let update = try withLock { () throws -> StoryUpdate in
            guard var record = stories[req.story_id] else {
                throw NotFound(msg: "Story not found")
            }
            let updateId = nextUpdateId
            nextUpdateId += 1
            let createdAt = isoTimestamp(minutesFromNow: Int(updateId) - 1030)
            let update = StoryUpdate(
                id: updateId,
                story_id: req.story_id,
                author_name: "demo grower",
                title: req.title,
                body: req.body,
                kind: req.kind,
                measurements: req.measurements,
                media: [],
                created_at: createdAt
            )
            record.updates.insert(update, at: 0)
            record.detail.updated_at = createdAt
            stories[req.story_id] = record
            return update
        }
        broadcast(
            storyId: req.story_id,
            event: StoryStreamServerEvent(story_id: req.story_id, update: update, media: nil, progress: nil)
        )
        persistUpdate(update)
        if let detail = withLock({ stories[req.story_id]?.detail }) {
            persistStory(detail)
        }
        return update
    }

    func deleteStory(sessionId: String, storyId: UInt64) throws -> Bool {
        _ = try requireAdmin(sessionId: sessionId)

        let deletion = try withLock { () throws -> ([UInt64], [UInt64: String], [NPRPCStreamWriter<StoryStreamServerEvent>]) in
            guard let record = stories.removeValue(forKey: storyId) else {
                throw NotFound(msg: "Story not found")
            }

            storySlugs.removeValue(forKey: record.detail.slug)

            let assetIds = record.updates.flatMap { update in
                update.media.map(\ .id)
            }
            let originalFilenames = Dictionary(uniqueKeysWithValues: assetIds.compactMap { assetId in
                assets[assetId].map { (assetId, $0.original_filename) }
            })
            let storyWatchers = Array((watchers.removeValue(forKey: storyId) ?? [:]).values)

            for assetId in assetIds {
                assets.removeValue(forKey: assetId)
                assetUpdateIds.removeValue(forKey: assetId)
                attachedAssetIds.remove(assetId)
                uploads.removeValue(forKey: assetId)
                mediaPayloads.removeValue(forKey: assetId)
            }

            return (assetIds, originalFilenames, storyWatchers)
        }

        do {
            try db.dbQueue.write { db in
                try JournalStoryRecord
                    .filter(Column("id") == Int64(storyId))
                    .deleteAll(db)
                try JournalUploadSessionRecord
                    .filter(Column("storyId") == Int64(storyId))
                    .deleteAll(db)
            }
        } catch {
            print("[GrowJournal] failed to delete story \(storyId) from DB: \(error)")
            throw error
        }

        for assetId in deletion.0 {
            publicAssetPublisher.removePublishedAsset(assetId: assetId)
            removeUploadSpool(assetId: assetId)
            if let originalFilename = deletion.1[assetId] {
                videoProcessor.removeAssetFiles(assetId: assetId, originalFilename: originalFilename)
            }
        }

        for writer in deletion.2 {
            writer.close()
        }

        return true
    }

    func createUpload(storyId: UInt64, updateId: UInt64, filename: String, mimeType: String, kind: MediaKind) throws -> UploadTarget {
        let target = try withLock {
            guard var record = stories[storyId] else {
                throw NotFound(msg: "Story not found")
            }
            guard let updateIndex = record.updates.firstIndex(where: { $0.id == updateId }) else {
                throw NotFound(msg: "Update not found")
            }
            let lowerMimeType = mimeType.lowercased()
            switch kind {
            case .Image where !lowerMimeType.hasPrefix("image/"):
                throw UploadRejected(msg: "Image upload requires an image/* mime type")
            case .Video where !lowerMimeType.hasPrefix("video/"):
                throw UploadRejected(msg: "Video upload requires a video/* mime type")
            default:
                break
            }

            let assetId = nextAssetId
            nextAssetId += 1
            let createdAt = isoTimestamp(minutesFromNow: Int(assetId) - 5020)
            let token = UUID().uuidString.lowercased()
            let asset = MediaAsset(
                id: assetId,
                kind: kind,
                status: .PendingUpload,
                original_filename: filename,
                mime_type: mimeType,
                byte_size: 0,
                width: kind == .Image ? 1536 : 1920,
                height: kind == .Image ? 1024 : 1080,
                duration_ms: kind == .Video ? 12_000 : nil,
                image_url: nil,
                poster_url: nil,
                dash_manifest_url: nil,
                created_at: createdAt,
                error_message: nil
            )

            assets[assetId] = asset
            assetUpdateIds[assetId] = updateId
            attachedAssetIds.remove(assetId)
            uploads[assetId] = UploadSession(
                assetId: assetId,
                storyId: storyId,
                updateId: updateId,
                kind: kind,
                token: token,
                bytesReceived: 0,
                payload: []
            )
            mediaPayloads[assetId] = []

            if record.updates[updateIndex].kind == .Note && kind == .Image {
                record.updates[updateIndex].kind = .PhotoSet
            }
            if kind == .Video {
                record.updates[updateIndex].kind = .Video
            }
            stories[storyId] = record

            return UploadTarget(
                asset_id: assetId,
                upload_token: token,
                story_id: storyId,
                update_id: updateId,
                kind: kind,
                original_filename: filename,
                mime_type: mimeType
            )
        }
        persistAsset(target.asset_id)
        persistUploadSession(assetId: target.asset_id)
        ensureUploadSpoolExists(assetId: target.asset_id)
        if let update = withLock({ stories[storyId]?.updates.first(where: { $0.id == updateId }) }) {
            persistUpdate(update)
        }
        return target
    }

    func beginUpload(assetId: UInt64, token: String) -> Bool {
        let accepted = withLock {
            guard let upload = uploads[assetId], upload.token == token, var asset = assets[assetId] else {
                return false
            }
            asset.status = .Uploading
            asset.error_message = nil
            assets[assetId] = asset
            return true
        }
        if accepted {
            persistAsset(assetId)
        }
        return accepted
    }

    func appendUploadChunk(assetId: UInt64, token: String, chunk: [UInt8]) -> (UploadProgress, UInt64)? {
        let progress: (UploadProgress, UInt64)? = withLock {
            guard var upload = uploads[assetId], upload.token == token, var asset = assets[assetId] else {
                return nil
            }
            upload.payload.append(contentsOf: chunk)
            upload.bytesReceived += UInt64(chunk.count)
            uploads[assetId] = upload
            mediaPayloads[assetId] = upload.payload
            asset.status = .Uploading
            asset.byte_size = upload.bytesReceived
            assets[assetId] = asset
            return (UploadProgress(asset_id: assetId, bytes_received: upload.bytesReceived), upload.storyId)
        }
        if progress != nil {
            appendToUploadSpool(assetId: assetId, chunk: chunk)
            persistAsset(assetId)
            persistUploadSession(assetId: assetId)
        }
        return progress
    }

    func finishUpload(assetId: UInt64, token: String) throws -> (UploadProgress, UInt64, MediaAsset) {
        struct ImagePublicationJob {
            let assetId: UInt64
            let originalFilename: String
            let payload: [UInt8]
        }

        let result = try withLock { () throws -> (UploadProgress, UInt64, MediaAsset, ImagePublicationJob?, VideoProcessingJob?) in
            guard let upload = uploads[assetId], upload.token == token, var asset = assets[assetId] else {
                throw NotFound(msg: "Upload session not found")
            }
            guard upload.bytesReceived > 0 else {
                throw UploadRejected(msg: "Upload contained no bytes")
            }

            asset.byte_size = upload.bytesReceived
            asset.error_message = nil
            if upload.kind == .Image {
                asset.status = .Ready
                asset.image_url = "/mock/journal/assets/\(assetId)/image"
            } else {
                asset.status = .Queued
                asset.poster_url = nil
                asset.dash_manifest_url = "/mock/journal/assets/\(assetId)/manifest.mpd"
            }

            assets[assetId] = asset
            uploads.removeValue(forKey: assetId)

            let videoJob = upload.kind == .Video
                ? VideoProcessingJob(assetId: assetId, storyId: upload.storyId, originalFilename: asset.original_filename)
                : nil
            let imageJob = upload.kind == .Image
                ? ImagePublicationJob(assetId: assetId, originalFilename: asset.original_filename, payload: upload.payload)
                : nil

            return (
                UploadProgress(asset_id: assetId, bytes_received: asset.byte_size),
                upload.storyId,
                asset,
                imageJob,
                videoJob
            )
        }

        if let imageJob = result.3 {
            do {
                try publicAssetPublisher.stageAndPublishImageAsset(assetId: imageJob.assetId, originalFilename: imageJob.originalFilename, payload: imageJob.payload)
                _ = withLock {
                    mediaPayloads.removeValue(forKey: imageJob.assetId)
                }
                removeUploadSpool(assetId: imageJob.assetId)
                deleteUploadSession(assetId: imageJob.assetId)
                persistAsset(imageJob.assetId)
            } catch {
                print("[GrowJournal] failed to publish image asset \(imageJob.assetId): \(error)")
                let failedAsset = withLock { () -> MediaAsset in
                    var asset = assets[imageJob.assetId] ?? result.2
                    asset.status = .Failed
                    asset.error_message = "Image publishing failed: \(error.localizedDescription)"
                    assets[imageJob.assetId] = asset
                    return asset
                }
                persistAsset(imageJob.assetId)
                return (result.0, result.1, failedAsset)
            }
        }

        if let videoJob = result.4 {
            do {
                _ = try videoProcessor.stageOriginal(assetId: videoJob.assetId, originalFilename: videoJob.originalFilename, stagedUploadURL: uploadSpoolURL(assetId: videoJob.assetId))
                _ = withLock {
                    mediaPayloads.removeValue(forKey: videoJob.assetId)
                }
                deleteUploadSession(assetId: videoJob.assetId)
                print("[GrowJournal] queued video processing for asset \(videoJob.assetId)")
                queueVideoProcessing(videoJob)
            } catch {
                print("[GrowJournal] failed to stage video asset \(videoJob.assetId): \(error)")
                let failedAsset = withLock { () -> MediaAsset in
                    var asset = assets[videoJob.assetId] ?? result.2
                    asset.status = .Failed
                    asset.error_message = "Video processing could not start: \(error.localizedDescription)"
                    assets[videoJob.assetId] = asset
                    return asset
                }
                persistAsset(videoJob.assetId)
                return (result.0, result.1, failedAsset)
            }
        }

        persistAsset(assetId)

        return (result.0, result.1, result.2)
    }

    func abortUpload(assetId: UInt64, token: String) -> Bool {
        let aborted = withLock {
            guard let upload = uploads[assetId], upload.token == token, var asset = assets[assetId] else {
                return false
            }
            uploads.removeValue(forKey: assetId)
            mediaPayloads.removeValue(forKey: assetId)
            asset.status = .Failed
            asset.error_message = "Upload aborted"
            assets[assetId] = asset
            return true
        }
        if aborted {
            persistAsset(assetId)
            deleteUploadSession(assetId: assetId)
            removeUploadSpool(assetId: assetId)
        }
        return aborted
    }

    func attachAsset(updateId: UInt64, assetId: UInt64) throws -> StoryUpdate {
        let result = try withLock { () throws -> (StoryUpdate, UInt64, MediaAsset) in
            guard let asset = assets[assetId] else {
                throw NotFound(msg: "Asset not found")
            }
            guard let (storyId, updateIndex) = findUpdate(updateId: updateId), var record = stories[storyId] else {
                throw NotFound(msg: "Update not found")
            }

            var update = record.updates[updateIndex]
            if !update.media.contains(where: { $0.id == assetId }) {
                update.media.append(asset)
            }
            record.updates[updateIndex] = update
            if record.detail.cover_image_url == nil, asset.kind == .Image {
                record.detail.cover_image_url = asset.image_url
            }
            record.detail.updated_at = isoTimestamp(minutesFromNow: Int(update.id) - 980)
            stories[storyId] = record
            return (update, storyId, asset)
        }

        broadcast(
            storyId: result.1,
            event: StoryStreamServerEvent(story_id: result.1, update: result.0, media: result.2, progress: nil)
        )
        _ = withLock {
            attachedAssetIds.insert(assetId)
        }
        persistAsset(assetId)
        persistUpdate(result.0)
        if let detail = withLock({ stories[result.1]?.detail }) {
            persistStory(detail)
        }
        return result.0
    }

    func hasStory(storyId: UInt64) -> Bool {
        withLock { stories[storyId] != nil }
    }

    func addWatcher(storyId: UInt64, writer: NPRPCStreamWriter<StoryStreamServerEvent>) -> UUID {
        withLock {
            let watcherId = UUID()
            var storyWatchers = watchers[storyId] ?? [:]
            storyWatchers[watcherId] = writer
            watchers[storyId] = storyWatchers
            return watcherId
        }
    }

    func publish(storyId: UInt64, event: StoryStreamServerEvent) {
        broadcast(storyId: storyId, event: event)
    }

    func removeWatcher(storyId: UInt64, watcherId: UUID) {
        withLock {
            guard var storyWatchers = watchers[storyId] else {
                return
            }
            storyWatchers.removeValue(forKey: watcherId)
            watchers[storyId] = storyWatchers.isEmpty ? nil : storyWatchers
        }
    }

    func assetForManifest(assetId: UInt64) throws -> MediaAsset {
        try withLock {
            guard let asset = assets[assetId] else {
                throw NotFound(msg: "Asset not found")
            }
            guard asset.kind == .Video else {
                throw ProcessingFailed(msg: "Asset is not a video")
            }
            guard asset.status == .Ready else {
                throw ProcessingFailed(msg: "Asset is not ready yet")
            }
            return asset
        }
    }

    func processedManifest(assetId: UInt64) throws -> String? {
        let originalFilename = try withLock { () throws -> String in
            guard let asset = assets[assetId] else {
                throw NotFound(msg: "Asset not found")
            }
            return asset.original_filename
        }

        return try videoProcessor.manifestContents(assetId: assetId, originalFilename: originalFilename)
    }

    func processedMediaSlice(assetId: UInt64, representation: String, offset: UInt64, length: UInt64) throws -> [UInt8]? {
        let originalFilename = try withLock { () throws -> String in
            guard let asset = assets[assetId] else {
                throw NotFound(msg: "Asset not found")
            }
            return asset.original_filename
        }

        return try videoProcessor.mediaSlice(assetId: assetId, originalFilename: originalFilename, representation: representation, offset: offset, length: length)
    }

    func mediaSlice(assetId: UInt64, offset: UInt64, length: UInt64) -> [UInt8] {
        withLock {
            guard let payload = mediaPayloads[assetId], !payload.isEmpty else {
                return []
            }
            let safeStart = min(Int(offset), payload.count)
            let safeEnd: Int
            if length == 0 {
                safeEnd = payload.count
            } else {
                safeEnd = min(payload.count, safeStart + Int(length))
            }
            guard safeStart < safeEnd else {
                return []
            }
            return Array(payload[safeStart..<safeEnd])
        }
    }

    private func loadStateFromDatabase() throws {
        let loadedStories: [JournalStoryRecord] = try db.dbQueue.read { db in
            try JournalStoryRecord.fetchAll(db)
        }
        let loadedUpdates: [JournalUpdateRecord] = try db.dbQueue.read { db in
            try JournalUpdateRecord.fetchAll(db)
        }
        let loadedAssets: [JournalMediaAssetRecord] = try db.dbQueue.read { db in
            try JournalMediaAssetRecord.fetchAll(db)
        }

        stories.removeAll()
        storySlugs.removeAll()
        assets.removeAll()
        assetUpdateIds.removeAll()
        attachedAssetIds.removeAll()

        var attachedMediaByUpdateId: [UInt64: [MediaAsset]] = [:]
        for assetRecord in loadedAssets {
            let asset = assetRecord.toRpc()
            let assetId = asset.id
            let updateId = UInt64(assetRecord.updateId)
            assets[assetId] = asset
            assetUpdateIds[assetId] = updateId
            if assetRecord.attached {
                attachedAssetIds.insert(assetId)
                attachedMediaByUpdateId[updateId, default: []].append(asset)
            }
        }

        for storyRecord in loadedStories {
            let detail = storyRecord.toRpc()
            stories[detail.id] = StoryRecord(detail: detail, updates: [])
            storySlugs[detail.slug] = detail.id
        }

        let orderedUpdates = loadedUpdates.sorted { lhs, rhs in lhs.createdAt > rhs.createdAt }
        for updateRecord in orderedUpdates {
            let updateId = UInt64(updateRecord.id ?? 0)
            let media = (attachedMediaByUpdateId[updateId] ?? []).sorted { lhs, rhs in rhs.created_at < lhs.created_at }
            let update = updateRecord.toRpc(media: media)
            stories[update.story_id]?.updates.append(update)
        }

        nextStoryId = max((stories.keys.max() ?? 99) + 1, 100)
        let maxUpdateId = loadedUpdates.compactMap(\ .id).map(UInt64.init).max() ?? 999
        nextUpdateId = max(maxUpdateId + 1, 1000)
        let maxAssetId = loadedAssets.compactMap(\ .id).map(UInt64.init).max() ?? 4999
        nextAssetId = max(maxAssetId + 1, 5000)
    }

    private func restoreUploadSessionsFromDatabase() throws {
        let sessionRecords: [JournalUploadSessionRecord] = try db.dbQueue.read { db in
            try JournalUploadSessionRecord.fetchAll(db)
        }

        for sessionRecord in sessionRecords {
            let assetId = UInt64(sessionRecord.assetId)
            guard let asset = assets[assetId] else {
                deleteUploadSession(assetId: assetId)
                removeUploadSpool(assetId: assetId)
                continue
            }

            let spoolURL = uploadSpoolURL(assetId: assetId)
            guard let payloadData = try? Data(contentsOf: spoolURL) else {
                markRecoveredUploadFailed(assetId: assetId, message: "Upload session data was lost during restart recovery.")
                deleteUploadSession(assetId: assetId)
                continue
            }

            let payload = [UInt8](payloadData)
            let bytesReceived = UInt64(max(Int64(payload.count), sessionRecord.bytesReceived))
            uploads[assetId] = UploadSession(
                assetId: assetId,
                storyId: UInt64(sessionRecord.storyId),
                updateId: sessionRecord.updateId.map(UInt64.init),
                kind: MediaKind(rawValue: UInt32(sessionRecord.kind)) ?? asset.kind,
                token: sessionRecord.token,
                bytesReceived: bytesReceived,
                payload: payload
            )
            mediaPayloads[assetId] = payload

            var repairedAsset = asset
            repairedAsset.byte_size = bytesReceived
            if repairedAsset.status == .PendingUpload {
                repairedAsset.status = .Uploading
            }
            assets[assetId] = repairedAsset
            persistAsset(assetId)
            persistUploadSession(assetId: assetId)
        }
    }

    private func persistCurrentStateToDatabase() throws {
        try db.dbQueue.write { db in
            try JournalMediaAssetRecord.deleteAll(db)
            try JournalUpdateRecord.deleteAll(db)
            try JournalStoryRecord.deleteAll(db)

            for detail in stories.values.map(\ .detail).sorted(by: { $0.id < $1.id }) {
                var record = JournalStoryRecord.from(rpc: detail)
                try record.save(db)
            }

            let updates = stories.values
                .flatMap(\ .updates)
                .sorted { $0.id < $1.id }
            for update in updates {
                var record = JournalUpdateRecord.from(rpc: update)
                try record.save(db)
            }

            for asset in assets.values.sorted(by: { $0.id < $1.id }) {
                guard let updateId = assetUpdateIds[asset.id] else {
                    continue
                }
                var record = JournalMediaAssetRecord.from(rpc: asset, updateId: updateId, attached: attachedAssetIds.contains(asset.id))
                try record.save(db)
            }
        }
    }

    private func persistStory(_ detail: StoryDetail) {
        do {
            try db.dbQueue.write { db in
                var record = JournalStoryRecord.from(rpc: detail)
                try record.save(db)
            }
        } catch {
            print("[GrowJournal] failed to persist story \(detail.id): \(error)")
        }
    }

    private func persistUpdate(_ update: StoryUpdate) {
        do {
            try db.dbQueue.write { db in
                var record = JournalUpdateRecord.from(rpc: update)
                try record.save(db)
            }
        } catch {
            print("[GrowJournal] failed to persist update \(update.id): \(error)")
        }
    }

    private func persistAsset(_ assetId: UInt64) {
        guard let asset = withLock({ assets[assetId] }), let updateId = withLock({ assetUpdateIds[assetId] }) else {
            return
        }
        let attached = withLock { attachedAssetIds.contains(assetId) }
        do {
            try db.dbQueue.write { db in
                var record = JournalMediaAssetRecord.from(rpc: asset, updateId: updateId, attached: attached)
                try record.save(db)
            }
        } catch {
            print("[GrowJournal] failed to persist asset \(assetId): \(error)")
        }
    }

    private func persistUploadSession(assetId: UInt64) {
        guard let upload = withLock({ uploads[assetId] }) else {
            return
        }
        do {
            try db.dbQueue.write { db in
                var record = JournalUploadSessionRecord(
                    assetId: Int64(upload.assetId),
                    storyId: Int64(upload.storyId),
                    updateId: upload.updateId.map(Int64.init),
                    kind: Int32(upload.kind.rawValue),
                    token: upload.token,
                    bytesReceived: Int64(upload.bytesReceived)
                )
                try record.save(db)
            }
        } catch {
            print("[GrowJournal] failed to persist upload session \(assetId): \(error)")
        }
    }

    private func deleteUploadSession(assetId: UInt64) {
        do {
            _ = try db.dbQueue.write { db in
                try JournalUploadSessionRecord
                    .filter(Column("assetId") == Int64(assetId))
                    .deleteAll(db)
            }
        } catch {
            print("[GrowJournal] failed to delete upload session \(assetId): \(error)")
        }
    }

    private func seedData() {
        let seededImageURL = publicAssetPublisher.hasImageAsset(assetId: 500)
            ? "/mock/journal/assets/500/image"
            : nil
        let imageAsset = MediaAsset(
            id: 500,
            kind: .Image,
            status: .Ready,
            original_filename: "basil-canopy.jpg",
            mime_type: "image/jpeg",
            byte_size: 182_000,
            width: 1536,
            height: 1024,
            duration_ms: nil,
            image_url: seededImageURL,
            poster_url: nil,
            dash_manifest_url: nil,
            created_at: isoTimestamp(minutesFromNow: -520),
            error_message: nil
        )

        let videoAsset = MediaAsset(
            id: 502,
            kind: .Video,
            status: .Ready,
            original_filename: "tomato-root-tour.mp4",
            mime_type: "video/mp4",
            byte_size: 17_825_792,
            width: 1920,
            height: 1080,
            duration_ms: 264_000,
            image_url: nil,
            poster_url: "/mock/journal/assets/502/poster.jpg",
            dash_manifest_url: "/mock/journal/assets/502/manifest.mpd",
            created_at: isoTimestamp(minutesFromNow: -340),
            error_message: nil
        )

        assets[500] = imageAsset
        assets[502] = videoAsset
    assetUpdateIds[500] = 100
    assetUpdateIds[502] = 102
    attachedAssetIds = [500, 502]

        let basilStory = StoryDetail(
            id: 10,
            slug: "basil-balcony-week-4",
            title: "Basil Balcony Week 4",
            crop_name: "Genovese basil",
            description: "Compact balcony basil run with frequent pruning notes, solution checks, and quick phone photos after each trim.",
            cover_image_url: seededImageURL,
            solution_id: 14,
            solution_name: "Herb House Mix 14",
            author_name: "trial grower",
            visibility: .Public,
            stage: .Vegetative,
            created_at: isoTimestamp(minutesFromNow: -720),
            updated_at: isoTimestamp(minutesFromNow: -180)
        )
        let basilUpdates = [
            StoryUpdate(
                id: 100,
                story_id: 10,
                author_name: "trial grower",
                title: "Canopy tightened after topping",
                body: "Internodes shortened after the last trim. Aroma increased noticeably once the lights were raised 4 cm and the fan angle changed.",
                kind: .PhotoSet,
                measurements: nil,
                media: [imageAsset],
                created_at: isoTimestamp(minutesFromNow: -180)
            ),
            StoryUpdate(
                id: 101,
                story_id: 10,
                author_name: "trial grower",
                title: "Reservoir check",
                body: "Top-off only. Leaves stayed flat through the afternoon, so I left the recipe unchanged.",
                kind: .Measurement,
                measurements: MeasurementSnapshot(
                    ec: 1.86,
                    ph: 5.92,
                    ppm: 936,
                    solution_temperature_c: 20.8,
                    air_temperature_c: 24.2,
                    humidity_pct: 61.0,
                    water_level_pct: 74.0,
                    note: "No precipitate in the tank."
                ),
                media: [],
                created_at: isoTimestamp(minutesFromNow: -360)
            )
        ]

        let tomatoStory = StoryDetail(
            id: 11,
            slug: "tomato-reservoir-log",
            title: "Tomato Reservoir Log",
            crop_name: "Cherry tomato",
            description: "Tracking root-zone changes during the first heavy fruiting push, including short walkthrough videos and drift notes.",
            cover_image_url: videoAsset.poster_url,
            solution_id: 28,
            solution_name: "Tomato Fruit Push 28",
            author_name: "greenhouse team",
            visibility: .Unlisted,
            stage: .Flowering,
            created_at: isoTimestamp(minutesFromNow: -620),
            updated_at: isoTimestamp(minutesFromNow: -95)
        )
        let tomatoUpdates = [
            StoryUpdate(
                id: 102,
                story_id: 11,
                author_name: "greenhouse team",
                title: "Root tour before lights-on",
                body: "Shot a short clip before the morning dose so we can compare root color and turbulence after the next reservoir swap.",
                kind: .Video,
                measurements: nil,
                media: [videoAsset],
                created_at: isoTimestamp(minutesFromNow: -95)
            ),
            StoryUpdate(
                id: 103,
                story_id: 11,
                author_name: "greenhouse team",
                title: "Fruiting drift",
                body: "Potassium demand climbed faster than expected once the first clusters started sizing up.",
                kind: .Measurement,
                measurements: MeasurementSnapshot(
                    ec: 2.44,
                    ph: 5.71,
                    ppm: 1220,
                    solution_temperature_c: 21.4,
                    air_temperature_c: 26.1,
                    humidity_pct: 58.0,
                    water_level_pct: 63.0,
                    note: "Planning a slightly higher calcium push tomorrow."
                ),
                media: [],
                created_at: isoTimestamp(minutesFromNow: -260)
            )
        ]

        let lettuceStory = StoryDetail(
            id: 12,
            slug: "lettuce-rack-trial",
            title: "Lettuce Rack Trial",
            crop_name: "Butterhead lettuce",
            description: "Simple shelf trial to compare two airflow patterns and document leaf posture with quick daily notes.",
            cover_image_url: nil,
            solution_id: 7,
            solution_name: "Leafy Greens Dial-In 7",
            author_name: "guest",
            visibility: .Public,
            stage: .Vegetative,
            created_at: isoTimestamp(minutesFromNow: -540),
            updated_at: isoTimestamp(minutesFromNow: -40)
        )
        let lettuceUpdates = [
            StoryUpdate(
                id: 104,
                story_id: 12,
                author_name: "guest",
                title: "Afternoon leaf posture",
                body: "The right-side airflow pattern keeps the canopy flatter. No leaf edge curl after the last refill.",
                kind: .Note,
                measurements: nil,
                media: [],
                created_at: isoTimestamp(minutesFromNow: -40)
            )
        ]

        stories[10] = StoryRecord(detail: basilStory, updates: basilUpdates)
        stories[11] = StoryRecord(detail: tomatoStory, updates: tomatoUpdates)
        stories[12] = StoryRecord(detail: lettuceStory, updates: lettuceUpdates)
        storySlugs[basilStory.slug] = basilStory.id
        storySlugs[tomatoStory.slug] = tomatoStory.id
        storySlugs[lettuceStory.slug] = lettuceStory.id
    }

    private func publishPersistedAssets() {
        for asset in assets.values.sorted(by: { $0.id < $1.id }) {
            switch asset.kind {
            case .Image:
                guard publicAssetPublisher.hasImageAsset(assetId: asset.id) else {
                    continue
                }
                do {
                    try publicAssetPublisher.publishImageAsset(assetId: asset.id)
                } catch {
                    print("[GrowJournal] failed to publish image asset \(asset.id): \(error)")
                }
            case .Video:
                do {
                    try publicAssetPublisher.publishVideoAsset(assetId: asset.id)
                } catch {
                    print("[GrowJournal] failed to publish video asset \(asset.id): \(error)")
                }
            }
        }
    }

    private func reconcilePersistedVideoAssets() {
        let persistedVideoAssets = withLock {
            assets.values
                .filter { $0.kind == .Video }
                .sorted(by: { $0.id < $1.id })
                .map { asset in
                    (
                        asset,
                        assetUpdateIds[asset.id].flatMap { updateId in findUpdate(updateId: updateId)?.0 }
                    )
                }
        }

        for (asset, storyId) in persistedVideoAssets {
            let hasOriginal = videoProcessor.hasOriginal(assetId: asset.id, originalFilename: asset.original_filename)
            let hasProcessedOutput = videoProcessor.hasProcessedOutput(assetId: asset.id, originalFilename: asset.original_filename)

            switch asset.status {
            case .Ready:
                guard !hasProcessedOutput else {
                    continue
                }

                if hasOriginal, let storyId {
                    let requeuedAsset = withLock { () -> MediaAsset? in
                        guard var currentAsset = assets[asset.id] else {
                            return nil
                        }
                        currentAsset.status = .Queued
                        currentAsset.error_message = "Processed video files were missing and the asset is being rebuilt."
                        currentAsset.poster_url = nil
                        currentAsset.dash_manifest_url = nil
                        assets[asset.id] = currentAsset
                        return currentAsset
                    }
                    persistAsset(asset.id)
                    if let requeuedAsset {
                        broadcast(
                            storyId: storyId,
                            event: StoryStreamServerEvent(story_id: storyId, update: nil, media: requeuedAsset, progress: nil)
                        )
                    }
                    print("[GrowJournal] requeueing video asset \(asset.id) because processed files are missing")
                    queueVideoProcessing(VideoProcessingJob(assetId: asset.id, storyId: storyId, originalFilename: asset.original_filename))
                } else {
                    markRecoveredUploadFailed(assetId: asset.id, message: "Processed video files are missing and the original upload is no longer available.", storyId: storyId)
                }
            case .Queued, .Processing:
                guard hasOriginal else {
                    markRecoveredUploadFailed(assetId: asset.id, message: "Queued video source is missing after restart.", storyId: storyId)
                    continue
                }
            default:
                continue
            }
        }
    }

    private func recoverInterruptedVideoJobs() {
        let queuedJobs = withLock {
            assets.values.compactMap { asset -> VideoProcessingJob? in
                guard asset.kind == .Video else {
                    return nil
                }
                guard asset.status == .Queued || asset.status == .Processing else {
                    return nil
                }
                guard let updateId = assetUpdateIds[asset.id], let (storyId, _) = findUpdate(updateId: updateId) else {
                    return nil
                }
                return VideoProcessingJob(assetId: asset.id, storyId: storyId, originalFilename: asset.original_filename)
            }
        }

        for job in queuedJobs {
            guard videoProcessor.hasOriginal(assetId: job.assetId, originalFilename: job.originalFilename) else {
                markRecoveredUploadFailed(assetId: job.assetId, message: "Queued video source is missing after restart.", storyId: job.storyId)
                continue
            }
            print("[GrowJournal] recovering queued video job for asset \(job.assetId)")
            queueVideoProcessing(job)
        }
    }

    private func makePreview(from detail: StoryDetail) -> StoryPreview {
        StoryPreview(
            id: detail.id,
            slug: detail.slug,
            title: detail.title,
            crop_name: detail.crop_name,
            cover_image_url: detail.cover_image_url,
            solution_id: detail.solution_id,
            solution_name: detail.solution_name,
            author_name: detail.author_name,
            visibility: detail.visibility,
            stage: detail.stage,
            created_at: detail.created_at,
            updated_at: detail.updated_at
        )
    }

    private func paginate<T>(items: [T], page: UInt32, pageSize: UInt32) -> [T] {
        let safePageSize = max(Int(pageSize), 1)
        let start = min(Int(page) * safePageSize, items.count)
        let end = min(start + safePageSize, items.count)
        return Array(items[start..<end])
    }

    private func makeUniqueSlug(from title: String, fallbackId: UInt64) -> String {
        let base = slugify(title)
        if storySlugs[base] == nil {
            return base
        }
        var candidateIndex = 2
        while storySlugs["\(base)-\(candidateIndex)"] != nil {
            candidateIndex += 1
        }
        return base == "story" ? "story-\(fallbackId)" : "\(base)-\(candidateIndex)"
    }

    private func slugify(_ value: String) -> String {
        let lowercased = value.lowercased()
        let parts = lowercased.split(whereSeparator: { !$0.isLetter && !$0.isNumber })
        let joined = parts.map(String.init).joined(separator: "-")
        return joined.isEmpty ? "story" : joined
    }

    private func findUpdate(updateId: UInt64) -> (UInt64, Int)? {
        for (storyId, record) in stories {
            if let updateIndex = record.updates.firstIndex(where: { $0.id == updateId }) {
                return (storyId, updateIndex)
            }
        }
        return nil
    }

    private func broadcast(storyId: UInt64, event: StoryStreamServerEvent) {
        let activeWriters = withLock { Array((watchers[storyId] ?? [:]).values) }
        for writer in activeWriters {
            Task {
                await writer.write(event)
            }
        }
    }

    private func isoTimestamp(minutesFromNow minutes: Int) -> String {
        ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(minutes * 60)))
    }

    private func queueVideoProcessing(_ job: VideoProcessingJob) {
        DispatchQueue.global(qos: .utility).async { [self] in
            processVideo(job)
        }
    }

    private func processVideo(_ job: VideoProcessingJob) {
        print("[GrowJournal] processing video asset \(job.assetId) started")
        let processingAsset = withLock { () -> MediaAsset? in
            guard var asset = assets[job.assetId] else {
                return nil
            }
            asset.status = .Processing
            asset.error_message = nil
            assets[job.assetId] = asset
            return asset
        }
        persistAsset(job.assetId)

        if let processingAsset {
            broadcast(
                storyId: job.storyId,
                event: StoryStreamServerEvent(story_id: job.storyId, update: nil, media: processingAsset, progress: nil)
            )
        }

        do {
            _ = try videoProcessor.process(assetId: job.assetId, originalFilename: job.originalFilename)
            do {
                try publicAssetPublisher.publishVideoAsset(assetId: job.assetId)
            } catch {
                print("[GrowJournal] failed to publish video asset \(job.assetId): \(error)")
            }
            let processedSize = try videoProcessor.outputSize(assetId: job.assetId, originalFilename: job.originalFilename)
            let hasPoster = videoProcessor.hasPoster(assetId: job.assetId, originalFilename: job.originalFilename)

            let readyAsset = withLock { () -> MediaAsset? in
                guard var asset = assets[job.assetId] else {
                    return nil
                }
                asset.status = .Ready
                asset.byte_size = processedSize > 0 ? processedSize : asset.byte_size
                asset.error_message = nil
                asset.poster_url = hasPoster ? "/mock/journal/assets/\(job.assetId)/poster.jpg" : nil
                asset.dash_manifest_url = "/mock/journal/assets/\(job.assetId)/manifest.mpd"
                assets[job.assetId] = asset
                mediaPayloads.removeValue(forKey: job.assetId)
                return asset
            }
            persistAsset(job.assetId)

            if let readyAsset {
                print("[GrowJournal] processing video asset \(job.assetId) finished size=\(readyAsset.byte_size) poster=\(hasPoster)")
                broadcast(
                    storyId: job.storyId,
                    event: StoryStreamServerEvent(story_id: job.storyId, update: nil, media: readyAsset, progress: nil)
                )
            }
        } catch {
            print("[GrowJournal] processing video asset \(job.assetId) failed: \(error)")
            let failedAsset = withLock { () -> MediaAsset? in
                guard var asset = assets[job.assetId] else {
                    return nil
                }
                asset.status = .Failed
                asset.error_message = "Video processing failed: \(error.localizedDescription)"
                assets[job.assetId] = asset
                return asset
            }
            persistAsset(job.assetId)

            if let failedAsset {
                broadcast(
                    storyId: job.storyId,
                    event: StoryStreamServerEvent(story_id: job.storyId, update: nil, media: failedAsset, progress: nil)
                )
            }
        }
    }

    private func requireAdmin(sessionId: String) throws -> UserRecord {
        guard let user = try sessionService.user(forSession: sessionId) else {
            throw PermissionDenied(msg: "You must be logged in to moderate journal stories.")
        }
        guard user.isAdmin else {
            throw PermissionDenied(msg: "Moderator rights are required to delete stories.")
        }
        return user
    }

    private func uploadSpoolURL(assetId: UInt64) -> URL {
        uploadSpoolRootURL.appendingPathComponent("\(assetId).upload")
    }

    private func ensureUploadSpoolExists(assetId: UInt64) {
        let url = uploadSpoolURL(assetId: assetId)
        guard !fileManager.fileExists(atPath: url.path) else {
            return
        }
        _ = fileManager.createFile(atPath: url.path, contents: Data())
    }

    private func appendToUploadSpool(assetId: UInt64, chunk: [UInt8]) {
        ensureUploadSpoolExists(assetId: assetId)
        let url = uploadSpoolURL(assetId: assetId)
        do {
            let handle = try FileHandle(forWritingTo: url)
            defer {
                try? handle.close()
            }
            try handle.seekToEnd()
            try handle.write(contentsOf: Data(chunk))
        } catch {
            print("[GrowJournal] failed to append upload spool for asset \(assetId): \(error)")
        }
    }

    private func removeUploadSpool(assetId: UInt64) {
        let url = uploadSpoolURL(assetId: assetId)
        guard fileManager.fileExists(atPath: url.path) else {
            return
        }
        do {
            try fileManager.removeItem(at: url)
        } catch {
            print("[GrowJournal] failed to remove upload spool for asset \(assetId): \(error)")
        }
    }

    private func markRecoveredUploadFailed(assetId: UInt64, message: String, storyId: UInt64? = nil) {
        let resolvedStoryId = withLock { () -> UInt64? in
            guard var asset = assets[assetId] else {
                return nil
            }
            asset.status = .Failed
            asset.error_message = message
            asset.poster_url = nil
            asset.dash_manifest_url = nil
            assets[assetId] = asset
            return storyId ?? assetUpdateIds[assetId].flatMap { findUpdate(updateId: $0)?.0 }
        }
        persistAsset(assetId)
        removeUploadSpool(assetId: assetId)
        publicAssetPublisher.removePublishedAsset(assetId: assetId)

        guard let resolvedStoryId, let failedAsset = withLock({ assets[assetId] }) else {
            return
        }
        broadcast(
            storyId: resolvedStoryId,
            event: StoryStreamServerEvent(story_id: resolvedStoryId, update: nil, media: failedAsset, progress: nil)
        )
    }

    private func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }
}

final class JournalServiceServantImpl: JournalServiceServant, @unchecked Sendable {
    private let store: GrowJournalStore

    init(store: GrowJournalStore) {
        self.store = store
        super.init()
    }

    override func listStories(page: UInt32, page_size: UInt32) -> StoryPage {
        store.listStories(page: page, pageSize: page_size)
    }

    override func getStory(slug: String) throws -> StoryDetail {
        try store.getStory(slug: slug)
    }

    override func listUpdates(story_id: UInt64, page: UInt32, page_size: UInt32) throws -> UpdatePage {
        try store.listUpdates(storyId: story_id, page: page, pageSize: page_size)
    }

    override func createStory(req: CreateStoryRequest) -> StoryDetail {
        store.createStory(req: req)
    }

    override func createUpdate(req: CreateUpdateRequest) throws -> StoryUpdate {
        try store.createUpdate(req: req)
    }

    override func deleteStory(session_id: String, story_id: UInt64) throws -> Bool {
        try store.deleteStory(sessionId: session_id, storyId: story_id)
    }

    override func createImageUpload(story_id: UInt64, update_id: UInt64, filename: String, mime_type: String) throws -> UploadTarget {
        try store.createUpload(storyId: story_id, updateId: update_id, filename: filename, mimeType: mime_type, kind: .Image)
    }

    override func createVideoUpload(story_id: UInt64, update_id: UInt64, filename: String, mime_type: String) throws -> UploadTarget {
        try store.createUpload(storyId: story_id, updateId: update_id, filename: filename, mimeType: mime_type, kind: .Video)
    }

    override func attachAsset(update_id: UInt64, asset_id: UInt64) throws -> StoryUpdate {
        try store.attachAsset(updateId: update_id, assetId: asset_id)
    }
}

final class UploadServiceServantImpl: UploadServiceServant, @unchecked Sendable {
    private let store: GrowJournalStore

    init(store: GrowJournalStore) {
        self.store = store
        super.init()
    }

    override func uploadAsset(asset_id: UInt64, upload_token: String, data: NPRPCStreamReader<binary>) async {
        guard store.beginUpload(assetId: asset_id, token: upload_token) else {
            print("[GrowJournal] upload rejected for asset \(asset_id): invalid session")
            return
        }

        do {
            for try await chunk in data {
                guard let (progress, storyId) = store.appendUploadChunk(assetId: asset_id, token: upload_token, chunk: chunk) else {
                    break
                }
                store.publish(
                    storyId: storyId,
                    event: StoryStreamServerEvent(story_id: storyId, update: nil, media: nil, progress: progress)
                )
            }
        } catch {
            print("[GrowJournal] upload stream failed for asset \(asset_id): \(error)")
        }
    }

    override func finishUpload(asset_id: UInt64, upload_token: String) throws -> UploadProgress {
        let (progress, storyId, asset) = try store.finishUpload(assetId: asset_id, token: upload_token)
        store.publish(
            storyId: storyId,
            event: StoryStreamServerEvent(story_id: storyId, update: nil, media: asset, progress: progress)
        )
        return progress
    }

    override func abortUpload(asset_id: UInt64, upload_token: String) -> Bool {
        store.abortUpload(assetId: asset_id, token: upload_token)
    }
}

final class StoryStreamServiceServantImpl: StoryStreamServiceServant, @unchecked Sendable {
    private let store: GrowJournalStore

    init(store: GrowJournalStore) {
        self.store = store
        super.init()
    }

    override func watchStory(story_id: UInt64, stream: NPRPCBidiStream<StoryStreamServerEvent, StoryStreamClientEvent>) async {
        guard store.hasStory(storyId: story_id) else {
            stream.writer.close()
            return
        }

        let watcherId = store.addWatcher(storyId: story_id, writer: stream.writer)
        await stream.writer.write(StoryStreamServerEvent(story_id: story_id, update: nil, media: nil, progress: nil))

        do {
            for try await _ in stream.reader {
            }
        } catch {
            print("[GrowJournal] story stream failed for \(story_id): \(error)")
        }

        store.removeWatcher(storyId: story_id, watcherId: watcherId)
        stream.writer.close()
    }
}

final class MediaServiceServantImpl: MediaServiceServant, @unchecked Sendable {
    private let store: GrowJournalStore

    init(store: GrowJournalStore) {
        self.store = store
        super.init()
    }

    override func getVideoDashManifest(asset_id: UInt64) throws -> String {
        let asset = try store.assetForManifest(assetId: asset_id)
        if let manifest = try store.processedManifest(assetId: asset_id) {
            return manifest
        }
        let durationSeconds = Double(asset.duration_ms ?? 12_000) / 1000.0
        let width = asset.width ?? 1920
        let height = asset.height ?? 1080
        return """
        <?xml version=\"1.0\" encoding=\"UTF-8\"?>
        <MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" profiles=\"urn:mpeg:dash:profile:isoff-on-demand:2011\" type=\"static\" minBufferTime=\"PT1.5S\" mediaPresentationDuration=\"PT\(String(format: "%.3f", durationSeconds))S\">
          <Period duration=\"PT\(String(format: "%.3f", durationSeconds))S\">
            <AdaptationSet mimeType=\"video/mp4\" startWithSAP=\"1\" segmentAlignment=\"true\">
              <Representation id=\"asset-\(asset.id)\" bandwidth=\"450000\" codecs=\"avc1.64001f,mp4a.40.2\" width=\"\(width)\" height=\"\(height)\">
                <BaseURL>segment.mp4</BaseURL>
                <SegmentBase indexRange=\"0-0\">
                  <Initialization range=\"0-0\"/>
                </SegmentBase>
              </Representation>
            </AdaptationSet>
          </Period>
        </MPD>
        """
    }

    override func getVideoDashSegmentRange(asset_id: UInt64, byte_offset: UInt64, byte_length: UInt64, representation: String) -> AsyncStream<binary> {
        let processedSlice = try? store.processedMediaSlice(assetId: asset_id, representation: representation, offset: byte_offset, length: byte_length)
        let useLegacyFallback = representation.isEmpty || representation == "segment.mp4" || representation == "stream.mp4" || representation == "stream_dashinit.mp4"
        let slice = processedSlice ?? (useLegacyFallback ? store.mediaSlice(assetId: asset_id, offset: byte_offset, length: byte_length) : [])
        return AsyncStream { continuation in
            guard !slice.isEmpty else {
                continuation.finish()
                return
            }

            let chunkSize = 32 * 1024
            var start = 0
            while start < slice.count {
                let end = min(start + chunkSize, slice.count)
                continuation.yield(Array(slice[start..<end]))
                start = end
            }
            continuation.finish()
        }
    }
}