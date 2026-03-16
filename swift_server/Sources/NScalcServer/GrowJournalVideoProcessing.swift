import Foundation

struct ProcessedVideoBundle {
    let originalDirectoryURL: URL
    let processedDirectoryURL: URL
    let sourceURL: URL
    let streamURL: URL
    let manifestURL: URL
    let adaptiveManifestURL: URL
    let adaptiveAudioURL: URL
    let posterURL: URL
}

private struct AdaptiveRendition {
    let height: Int
    let bitrate: String
    let maxrate: String
    let bufsize: String

    var fileName: String {
        "video-\(height).mp4"
    }
}

enum GrowJournalVideoProcessingError: LocalizedError {
    case commandFailed(tool: String, status: Int32, output: String)

    var errorDescription: String? {
        switch self {
        case let .commandFailed(tool, status, output):
            let trimmedOutput = output.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmedOutput.isEmpty
                ? "\(tool) exited with status \(status)."
                : "\(tool) exited with status \(status): \(trimmedOutput)"
        }
    }
}

final class GrowJournalVideoProcessor {
    private let fileManager = FileManager.default
    private let rootURL: URL
    private let adaptiveRenditions: [AdaptiveRendition] = [
        AdaptiveRendition(height: 576, bitrate: "1400k", maxrate: "1498k", bufsize: "2100k"),
        AdaptiveRendition(height: 720, bitrate: "2800k", maxrate: "2996k", bufsize: "4200k"),
        AdaptiveRendition(height: 1080, bitrate: "5000k", maxrate: "5350k", bufsize: "7500k"),
    ]

    init(rootPath: String = "/app/sample_data/grow_journal_media") {
        self.rootURL = URL(fileURLWithPath: rootPath, isDirectory: true)
    }

    func stageOriginal(assetId: UInt64, originalFilename: String, payload: [UInt8]) throws -> ProcessedVideoBundle {
        let bundle = bundleFor(assetId: assetId, originalFilename: originalFilename)
        try fileManager.createDirectory(at: bundle.originalDirectoryURL, withIntermediateDirectories: true)
        try fileManager.createDirectory(at: bundle.processedDirectoryURL, withIntermediateDirectories: true)

        if fileManager.fileExists(atPath: bundle.sourceURL.path) {
            try fileManager.removeItem(at: bundle.sourceURL)
        }

        try Data(payload).write(to: bundle.sourceURL, options: .atomic)
        print("[GrowJournalVideo] staged original asset=\(assetId) file=\(bundle.sourceURL.path) bytes=\(payload.count)")
        return bundle
    }

    func process(assetId: UInt64, originalFilename: String) throws -> ProcessedVideoBundle {
        let bundle = bundleFor(assetId: assetId, originalFilename: originalFilename)
        try fileManager.createDirectory(at: bundle.processedDirectoryURL, withIntermediateDirectories: true)

        let adaptiveVideoURLs = adaptiveRenditions.map { bundle.processedDirectoryURL.appendingPathComponent($0.fileName) }
        for url in [bundle.streamURL, bundle.manifestURL, bundle.adaptiveManifestURL, bundle.adaptiveAudioURL, bundle.posterURL] + adaptiveVideoURLs {
            if fileManager.fileExists(atPath: url.path) {
                try fileManager.removeItem(at: url)
            }
        }

        try runTool(
            "ffmpeg",
            arguments: [
                "-y",
                "-i", bundle.sourceURL.path,
                "-map", "0:v:0",
                "-map", "0:a?",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-c:a", "aac",
                "-b:a", "128k",
                bundle.streamURL.path,
            ],
            currentDirectoryURL: bundle.processedDirectoryURL,
        )

        try runTool(
            "MP4Box",
            arguments: [
                "-dash", "2000",
                "-frag", "2000",
                "-rap",
                "-profile", "onDemand",
                "-out", bundle.manifestURL.path,
                bundle.streamURL.path,
            ],
            currentDirectoryURL: bundle.processedDirectoryURL,
        )

        try buildAdaptiveSet(bundle: bundle)

        do {
            try runTool(
                "ffmpeg",
                arguments: [
                    "-y",
                    "-i", bundle.streamURL.path,
                    "-vf", "thumbnail,scale=960:-1",
                    "-frames:v", "1",
                    bundle.posterURL.path,
                ],
                currentDirectoryURL: bundle.processedDirectoryURL,
            )
        } catch {
            // Poster extraction is optional during this draft phase.
        }

        return bundle
    }

    func manifestContents(assetId: UInt64, originalFilename: String) throws -> String? {
        let bundle = bundleFor(assetId: assetId, originalFilename: originalFilename)
        let manifestURL = fileManager.fileExists(atPath: bundle.adaptiveManifestURL.path)
            ? bundle.adaptiveManifestURL
            : bundle.manifestURL
        guard fileManager.fileExists(atPath: manifestURL.path) else {
            return nil
        }
        return try String(contentsOf: manifestURL, encoding: .utf8)
    }

    func mediaSlice(assetId: UInt64, originalFilename: String, representation: String, offset: UInt64, length: UInt64) throws -> [UInt8]? {
        guard let mediaURL = resolvedProcessedMediaURL(assetId: assetId, originalFilename: originalFilename, representation: representation) else {
            return nil
        }

        return try fileSlice(url: mediaURL, offset: offset, length: length)
    }

    private func fileSlice(url: URL, offset: UInt64, length: UInt64) throws -> [UInt8] {
        let fileHandle = try FileHandle(forReadingFrom: url)
        defer {
            try? fileHandle.close()
        }

        try fileHandle.seek(toOffset: offset)
        let readCount = length == 0 ? nil : Int(length)
        let data = try fileHandle.read(upToCount: readCount ?? Int.max) ?? Data()
        return Array(data)
    }

    private func resolvedProcessedMediaURL(assetId: UInt64, originalFilename: String, representation: String) -> URL? {
        let bundle = bundleFor(assetId: assetId, originalFilename: originalFilename)
        let trimmedRepresentation = representation.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmedRepresentation.isEmpty || trimmedRepresentation == "segment.mp4" || trimmedRepresentation == "stream.mp4" || trimmedRepresentation == "stream_dashinit.mp4" {
            let preferredLegacyURL = bundle.processedDirectoryURL.appendingPathComponent("stream_dashinit.mp4")
            if fileManager.fileExists(atPath: preferredLegacyURL.path) {
                return preferredLegacyURL
            }
            if fileManager.fileExists(atPath: bundle.streamURL.path) {
                return bundle.streamURL
            }
        }

        let safeName = URL(fileURLWithPath: trimmedRepresentation).lastPathComponent
        guard !safeName.isEmpty, safeName == trimmedRepresentation else {
            return nil
        }

        let candidateURL = bundle.processedDirectoryURL.appendingPathComponent(safeName)
        return fileManager.fileExists(atPath: candidateURL.path) ? candidateURL : nil
    }

    func outputSize(assetId: UInt64, originalFilename: String) throws -> UInt64 {
        let streamURL = bundleFor(assetId: assetId, originalFilename: originalFilename).streamURL
        let attributes = try fileManager.attributesOfItem(atPath: streamURL.path)
        return (attributes[.size] as? NSNumber)?.uint64Value ?? 0
    }

    func hasPoster(assetId: UInt64, originalFilename: String) -> Bool {
        let posterURL = bundleFor(assetId: assetId, originalFilename: originalFilename).posterURL
        return fileManager.fileExists(atPath: posterURL.path)
    }

    private func bundleFor(assetId: UInt64, originalFilename: String) -> ProcessedVideoBundle {
        let sourceExtension = sanitizedExtension(from: originalFilename)
        let originalDirectoryURL = rootURL.appendingPathComponent("original", isDirectory: true).appendingPathComponent(String(assetId), isDirectory: true)
        let processedDirectoryURL = rootURL.appendingPathComponent("processed", isDirectory: true).appendingPathComponent(String(assetId), isDirectory: true)

        return ProcessedVideoBundle(
            originalDirectoryURL: originalDirectoryURL,
            processedDirectoryURL: processedDirectoryURL,
            sourceURL: originalDirectoryURL.appendingPathComponent("source.\(sourceExtension)"),
            streamURL: processedDirectoryURL.appendingPathComponent("stream.mp4"),
            manifestURL: processedDirectoryURL.appendingPathComponent("manifest.mpd"),
            adaptiveManifestURL: processedDirectoryURL.appendingPathComponent("adaptive.mpd"),
            adaptiveAudioURL: processedDirectoryURL.appendingPathComponent("audio.m4a"),
            posterURL: processedDirectoryURL.appendingPathComponent("poster.jpg"),
        )
    }

    private func buildAdaptiveSet(bundle: ProcessedVideoBundle) throws {
        var mp4boxInputs: [String] = []

        do {
            try runTool(
                "ffmpeg",
                arguments: [
                    "-y",
                    "-i", bundle.sourceURL.path,
                    "-map", "0:a:0?",
                    "-vn",
                    "-c:a", "aac",
                    "-b:a", "128k",
                    bundle.adaptiveAudioURL.path,
                ],
                currentDirectoryURL: bundle.processedDirectoryURL,
            )
            if fileManager.fileExists(atPath: bundle.adaptiveAudioURL.path) {
                mp4boxInputs.append(bundle.adaptiveAudioURL.path + "#audio")
            }
        } catch {
            print("[GrowJournalVideo] adaptive audio extraction skipped: \(error)")
        }

        for rendition in adaptiveRenditions {
            let outputURL = bundle.processedDirectoryURL.appendingPathComponent(rendition.fileName)
            try runTool(
                "ffmpeg",
                arguments: [
                    "-y",
                    "-i", bundle.sourceURL.path,
                    "-an",
                    "-vf", "scale=-2:\(rendition.height)",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-profile:v", "high",
                    "-level:v", rendition.height >= 1080 ? "4.1" : "4.0",
                    "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart",
                    "-b:v", rendition.bitrate,
                    "-maxrate", rendition.maxrate,
                    "-bufsize", rendition.bufsize,
                    "-g", "48",
                    "-keyint_min", "48",
                    "-sc_threshold", "0",
                    outputURL.path,
                ],
                currentDirectoryURL: bundle.processedDirectoryURL,
            )
            mp4boxInputs.append(outputURL.path + "#video")
        }

        try runTool(
            "MP4Box",
            arguments: [
                "-dash", "2000",
                "-frag", "2000",
                "-rap",
                "-profile", "onDemand",
                "-out", bundle.adaptiveManifestURL.path,
            ] + mp4boxInputs,
            currentDirectoryURL: bundle.processedDirectoryURL,
        )
    }

    private func sanitizedExtension(from filename: String) -> String {
        let ext = URL(fileURLWithPath: filename).pathExtension.lowercased()
        return ext.isEmpty ? "mp4" : ext
    }

    private func runTool(_ tool: String, arguments: [String], currentDirectoryURL: URL) throws {
        print("[GrowJournalVideo] running \(tool) \(arguments.joined(separator: " "))")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [tool] + arguments
        process.currentDirectoryURL = currentDirectoryURL

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        try process.run()
        process.waitUntilExit()

        let output = String(decoding: stdoutPipe.fileHandleForReading.readDataToEndOfFile() + stderrPipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        guard process.terminationStatus == 0 else {
            print("[GrowJournalVideo] \(tool) failed status=\(process.terminationStatus) output=\(output)")
            throw GrowJournalVideoProcessingError.commandFailed(tool: tool, status: process.terminationStatus, output: output)
        }
        if !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            print("[GrowJournalVideo] \(tool) output: \(output)")
        }
    }
}