# Grow Journal Draft

This is a draft design for a crop-story or grow-journal feature.

It is intentionally separate from the existing calculator/auth/chat interfaces so the feature can evolve without destabilizing the current nscalc contract.

## Goal

Track a growing run as a story tied to a nutrient solution.

- Users create a story for a crop run.
- Users add timeline updates with notes, measurements, images, and optionally video.
- Video upload uses NPRPC client streams.
- Video playback reuses the DASH-over-NPRPC pattern already demonstrated in the live-blog example.

## Service Split

- `JournalService`: metadata, stories, updates, upload target creation.
- `UploadService`: raw image/video ingest over `client_stream<binary>`.
- `StoryStreamService`: optional realtime feed for newly added updates or media status changes.
- `MediaService`: processed media playback, especially DASH manifests and byte-range segment reads.

## Recommended Storage Model

Database tables:

- `grow_story`
- `grow_story_update`
- `media_asset`

Filesystem layout:

- `/app/media/original/<asset_id>/source`
- `/app/media/processed/<asset_id>/manifest.mpd`
- `/app/media/processed/<asset_id>/stream.mp4`
- `/app/media/processed/<asset_id>/poster.jpg`

## Media Lifecycle

- `PendingUpload`
- `Uploading`
- `Queued`
- `Processing`
- `Ready`
- `Failed`

The upload stream should only write bytes. Transcoding and MP4Box packaging should happen afterward in a background worker.

## Upload Flow

1. Client creates a story update through `JournalService.CreateUpdate`.
2. Client requests an upload target through `CreateImageUpload` or `CreateVideoUpload`.
3. Client sends bytes over `UploadService.UploadAsset`.
4. Client calls `UploadService.FinishUpload`.
5. Server marks video uploads `Queued` and a worker processes them.
6. Worker produces poster image, DASH manifest, and on-demand single-file media.
7. `MediaService` serves the manifest and byte ranges for Shaka Player.

## Processing Notes

Suggested worker pipeline for video:

1. Validate input MIME type and file size.
2. Normalize with `ffmpeg` if needed.
3. Package with `MP4Box -dash ... -profile onDemand`.
4. Extract a poster frame.
5. Mark the asset `Ready` or `Failed`.

## Scope Recommendation

Start with:

1. Story list and story detail.
2. Text updates and measurement snapshots.
3. Image uploads.
4. Single video upload per update.
5. DASH playback after background processing.

Defer:

1. Rich moderation.
2. Multi-video editing flows.
3. Reactions and social features.
4. Public SEO pages and SSR.

## Integration Notes

- The draft IDL lives in `idl/grow_journal.npidl`.
- It is not included in `gen_stubs.py` yet.
- Once the database and service boundaries are approved, it can be added to TS/Swift codegen explicitly.