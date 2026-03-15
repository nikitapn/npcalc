<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { getJournalRpc } from "../lib/journalRpc";
  import {
    MediaKind,
    MediaStatus,
    StoryStage,
    StoryVisibility,
    UpdateKind,
  } from "@rpc/grow_journal";
  import type {
    CreateStoryRequest,
    CreateUpdateRequest,
    MeasurementSnapshot,
    StoryDetail,
    StoryPreview,
    StoryStreamServerEvent,
    StoryUpdate,
    UploadTarget,
  } from "@rpc/grow_journal";

  type StageFilter = "all" | keyof typeof StoryStage;
  type ComposerKind = keyof typeof UpdateKind;
  type VisibilityOption = keyof typeof StoryVisibility;
  type StoryWatchState = "idle" | "connecting" | "live" | "error";
  type LocalUploadStatus = "PendingUpload" | "Uploading" | "Ready" | "Failed";
  type UploadCard = {
    id: string;
    label: string;
    kind: string;
    status: string;
    progressPct: number;
    detail: string;
  };
  type LocalUploadState = {
    assetId: bigint;
    updateId: bigint;
    filename: string;
    kind: MediaKind;
    mimeType: string;
    bytesSent: bigint;
    totalBytes: bigint;
    status: LocalUploadStatus;
    errorMessage?: string;
    startedAt: string;
  };
  type StoryWatchHandle = {
    writer: { close(): void };
    reader: AsyncIterable<StoryStreamServerEvent> & { cancel(): void };
  };

  const stageOptions: Array<{ label: string; value: StageFilter }> = [
    { label: "All stages", value: "all" },
    { label: "Planning", value: "Planning" },
    { label: "Germination", value: "Germination" },
    { label: "Vegetative", value: "Vegetative" },
    { label: "Flowering", value: "Flowering" },
    { label: "Harvest", value: "Harvest" },
    { label: "Archived", value: "Archived" },
  ];
  const visibilityOptions: Array<{ label: string; value: VisibilityOption }> = [
    { label: "Private", value: "Private" },
    { label: "Unlisted", value: "Unlisted" },
    { label: "Public", value: "Public" },
  ];
  const composerKinds: ComposerKind[] = ["Note", "Measurement", "PhotoSet", "Video"];
  const stageGradients = [
    "linear-gradient(135deg, rgba(24, 91, 136, 0.94), rgba(89, 168, 212, 0.72), rgba(223, 198, 126, 0.26))",
    "linear-gradient(135deg, rgba(33, 95, 60, 0.94), rgba(116, 179, 102, 0.72), rgba(247, 218, 118, 0.28))",
    "linear-gradient(135deg, rgba(38, 112, 58, 0.96), rgba(128, 188, 91, 0.72), rgba(249, 200, 79, 0.28))",
    "linear-gradient(135deg, rgba(125, 42, 32, 0.96), rgba(209, 108, 69, 0.78), rgba(255, 206, 129, 0.28))",
    "linear-gradient(135deg, rgba(92, 54, 27, 0.96), rgba(201, 138, 53, 0.74), rgba(244, 219, 145, 0.26))",
    "linear-gradient(135deg, rgba(61, 61, 73, 0.96), rgba(129, 143, 159, 0.68), rgba(210, 214, 221, 0.22))",
  ];
  const uploadChunkSize = 128 * 1024;
  const imageExtensions = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif", "avif"]);
  const videoExtensions = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi"]);

  let search = $state("");
  let stageFilter = $state<StageFilter>("all");
  let stories = $state<StoryPreview[]>([]);
  let selectedStory = $state<StoryDetail | null>(null);
  let selectedStorySlug = $state<string | null>(null);
  let selectedUpdates = $state<StoryUpdate[]>([]);
  let localUploads = $state<LocalUploadState[]>([]);
  let storiesLoaded = $state(false);
  let loadingStory = $state(false);
  let loadingError = $state<string | null>(null);
  let creatingStory = $state(false);
  let storyWatchState = $state<StoryWatchState>("idle");
  let storyWatchError = $state<string | null>(null);
  let submittingUpdate = $state(false);
  let composerKind = $state<ComposerKind>("Measurement");
  let composerTitle = $state("Late-day reservoir pass");
  let composerBody = $state("Capture EC drift, a quick canopy photo, and whether the refill changed leaf posture by lights-off.");
  let composerFiles = $state<File[]>([]);
  let createStoryTitle = $state("New propagation run");
  let createStoryCrop = $state("Thai basil");
  let createStoryDescription = $state("Kick off a fresh story with stage zero notes, then let live updates and uploads fill in the timeline as the run develops.");
  let createStoryVisibility = $state<VisibilityOption>("Unlisted");
  let createStorySolutionId = $state("42");
  let lastActionMessage = $state<string | null>(null);
  let activeStoryRequest = 0;
  let activeWatchGeneration = 0;
  let activeStoryStream: StoryWatchHandle | null = null;
  let composerFileInput = $state<HTMLInputElement | null>(null);

  const filteredStories = $derived.by(() => {
    const query = search.trim().toLowerCase();
    return stories.filter((story) => {
      const matchesStage = stageFilter === "all" || stageName(story.stage) === stageFilter;
      const haystack = `${story.title} ${story.crop_name} ${story.author_name} ${story.solution_name ?? ""}`.toLowerCase();
      return matchesStage && (query.length === 0 || haystack.includes(query));
    });
  });

  const selectedUploads = $derived.by<UploadCard[]>(() => {
    const attachedAssetIds = new Set<bigint>();
    const attachedCards = selectedUpdates
      .flatMap((update) => update.media.map((media) => ({ media, update })))
      .sort((lhs, rhs) => rhs.media.created_at.localeCompare(lhs.media.created_at))
      .map(({ media, update }) => {
        attachedAssetIds.add(media.id);
        const localUpload = localUploads.find((upload) => upload.assetId === media.id);
        const status = localUpload ? localUpload.status : mediaStatusName(media.status);
        const progressPct = localUpload ? localUploadProgressPct(localUpload) : statusProgress(media.status);
        const detail = localUpload
          ? `${formatBytes(localUpload.totalBytes)} • ${localUpload.mimeType}`
          : `${formatBytes(media.byte_size)} • ${relativeTime(media.created_at)}`;
        return {
          id: `${update.id}-${media.id}`,
          label: media.original_filename,
          kind: mediaKindName(media.kind),
          status,
          progressPct,
          detail,
        };
      });

    const inflightCards = localUploads
      .filter((upload) => !attachedAssetIds.has(upload.assetId))
      .sort((lhs, rhs) => rhs.startedAt.localeCompare(lhs.startedAt))
      .map((upload) => ({
        id: `local-${upload.assetId.toString()}`,
        label: upload.filename,
        kind: mediaKindName(upload.kind),
        status: upload.status,
        progressPct: localUploadProgressPct(upload),
        detail: upload.errorMessage ? upload.errorMessage : `${formatBytes(upload.totalBytes)} • ${upload.mimeType}`,
      }));

    return [...inflightCards, ...attachedCards];
  });

  const summary = $derived.by(() => {
    const pendingUploads = selectedUploads.filter((upload) => upload.status !== "Ready").length;
    return {
      stories: stories.length,
      updates: selectedUpdates.length,
      pendingUploads,
    };
  });

  const storyDirection = $derived.by(() => {
    if (!selectedStory) {
      return [] as string[];
    }

    const latestMeasurement = selectedUpdates.find((update) => update.measurements);
    const stats = [
      `${stageName(selectedStory.stage)} stage`,
      selectedStory.solution_name ? selectedStory.solution_name : null,
      latestMeasurement?.measurements?.ec !== undefined ? `EC ${latestMeasurement.measurements.ec.toFixed(2)}` : null,
      latestMeasurement?.measurements?.ph !== undefined ? `pH ${latestMeasurement.measurements.ph.toFixed(2)}` : null,
      `${selectedUpdates.length} timeline entries`,
    ];

    return stats.filter((value): value is string => value !== null).slice(0, 4);
  });

  const canSubmitUpdate = $derived.by(() => {
    return Boolean(selectedStory) && (composerBody.trim().length > 0 || composerFiles.length > 0);
  });

  const effectiveComposerKind = $derived.by<ComposerKind>(() => {
    const inferredKind = inferComposerKindFromFiles(composerFiles);
    return inferredKind ?? composerKind;
  });

  onMount(() => {
    void loadStories();
  });

  onDestroy(() => {
    stopStoryWatch();
  });

  async function loadStories(preferredSlug?: string): Promise<void> {
    loadingError = null;
    lastActionMessage = null;

    try {
      const refreshedStories = await refreshStoriesOnly();
      const nextSlug = preferredSlug ?? selectedStorySlug ?? refreshedStories[0]?.slug ?? null;
      if (nextSlug) {
        await selectStory(nextSlug);
      } else {
        selectedStory = null;
        selectedStorySlug = null;
        selectedUpdates = [];
        localUploads = [];
        stopStoryWatch();
      }
    } catch (error) {
      loadingError = formatError(error, "Could not load journal stories.");
      storiesLoaded = true;
    }
  }

  async function refreshStoriesOnly(): Promise<StoryPreview[]> {
    const { journal } = await getJournalRpc();
    const storyPage = await journal.ListStories(0, 48);
    stories = sortStoriesByUpdatedAt(storyPage.stories);
    storiesLoaded = true;
    return storyPage.stories;
  }

  async function selectStory(slug: string): Promise<void> {
    const requestId = ++activeStoryRequest;
    selectedStorySlug = slug;
    loadingStory = true;
    loadingError = null;
    storyWatchError = null;
    localUploads = [];
    stopStoryWatch();

    try {
      const { journal } = await getJournalRpc();
      const detail = await journal.GetStory(slug);
      const updatePage = await journal.ListUpdates(detail.id, 0, 64);
      if (requestId !== activeStoryRequest) {
        return;
      }
      selectedStory = detail;
      selectedUpdates = sortUpdatesByCreatedAt(updatePage.updates);
      upsertStoryPreview(detailToPreview(detail));
      await restartStoryWatch(detail.id);
    } catch (error) {
      if (requestId !== activeStoryRequest) {
        return;
      }
      loadingError = formatError(error, "Could not load story details.");
      selectedStory = null;
      selectedUpdates = [];
      localUploads = [];
    } finally {
      if (requestId === activeStoryRequest) {
        loadingStory = false;
      }
    }
  }

  async function submitStory(): Promise<void> {
    if (!createStoryTitle.trim() || !createStoryCrop.trim() || !createStoryDescription.trim()) {
      return;
    }

    creatingStory = true;
    loadingError = null;
    lastActionMessage = null;

    const solutionIdValue = Number.parseInt(createStorySolutionId.trim(), 10);
    const req: CreateStoryRequest = {
      title: createStoryTitle.trim(),
      crop_name: createStoryCrop.trim(),
      description: createStoryDescription.trim(),
      visibility: StoryVisibility[createStoryVisibility as keyof typeof StoryVisibility] as StoryVisibility,
      solution_id: Number.isFinite(solutionIdValue) ? solutionIdValue : undefined,
    };

    try {
      const { journal } = await getJournalRpc();
      const createdStory = await journal.CreateStory(req);
      upsertStoryPreview(detailToPreview(createdStory));
      selectedStory = createdStory;
      selectedStorySlug = createdStory.slug;
      selectedUpdates = [];
      localUploads = [];
      createStoryTitle = "";
      createStoryCrop = "";
      createStoryDescription = "";
      createStorySolutionId = "";
      lastActionMessage = "Story created through the journal RPC service.";
      await restartStoryWatch(createdStory.id);
      void refreshStoriesOnly();
    } catch (error) {
      loadingError = formatError(error, "Could not create the story.");
    } finally {
      creatingStory = false;
    }
  }

  async function submitUpdate(): Promise<void> {
    if (!selectedStory || (!composerBody.trim() && composerFiles.length === 0)) {
      return;
    }

    submittingUpdate = true;
    loadingError = null;
    lastActionMessage = null;

    const kind = UpdateKind[effectiveComposerKind as keyof typeof UpdateKind] as UpdateKind;
    const req: CreateUpdateRequest = {
      story_id: selectedStory.id,
      title: composerTitle.trim() ? composerTitle.trim() : undefined,
      body: composerBody.trim(),
      kind,
      measurements: buildMeasurementPayload(kind),
    };

    try {
      const { journal } = await getJournalRpc();
      const createdUpdate = await journal.CreateUpdate(req);
      applyStoryUpdate(createdUpdate);

      const filesToUpload = [...composerFiles];
      const uploadErrors = filesToUpload.length > 0 ? await uploadComposerFiles(createdUpdate, filesToUpload) : [];

      composerTitle = "";
      composerBody = "";
      composerFiles = [];
      if (composerFileInput) {
        composerFileInput.value = "";
      }

      if (uploadErrors.length === 0) {
        lastActionMessage = filesToUpload.length > 0
          ? "Update posted and media uploaded through the RPC stream path."
          : "Update posted to the server mock.";
      } else {
        loadingError = uploadErrors.join(" ");
        lastActionMessage = "Update posted, but one or more uploads failed.";
      }

      void refreshStoriesOnly();
    } catch (error) {
      loadingError = formatError(error, "Could not create the update.");
    } finally {
      submittingUpdate = false;
    }
  }

  async function uploadComposerFiles(update: StoryUpdate, files: File[]): Promise<string[]> {
    const uploadErrors: string[] = [];
    const { journal, uploads } = await getJournalRpc();

    for (const file of files) {
      const descriptor = describeUploadFile(file);
      if (!descriptor) {
        uploadErrors.push(`${file.name}: only image and video uploads are supported.`);
        continue;
      }

      let target: UploadTarget | null = null;
      let writer: { write(value: Uint8Array): void; close(): void; abort(error_code?: number): void } | null = null;

      try {
        target = descriptor.kind === MediaKind.Image
          ? await journal.CreateImageUpload(update.story_id, update.id, file.name, descriptor.mimeType)
          : await journal.CreateVideoUpload(update.story_id, update.id, file.name, descriptor.mimeType);

        registerLocalUpload(target, file, descriptor.mimeType);
        writer = await uploads.UploadAsset(target.asset_id, target.upload_token);

        for (let offset = 0; offset < file.size; offset += uploadChunkSize) {
          const chunk = new Uint8Array(await file.slice(offset, offset + uploadChunkSize).arrayBuffer());
          writer.write(chunk);
          updateLocalUpload(target.asset_id, {
            bytesSent: BigInt(Math.min(offset + chunk.byteLength, file.size)),
            status: "Uploading",
          });
        }

        writer.close();
        await uploads.FinishUpload(target.asset_id, target.upload_token);
        const attachedUpdate = await journal.AttachAsset(update.id, target.asset_id);
        applyStoryUpdate(attachedUpdate);
        clearLocalUpload(target.asset_id);
      } catch (error) {
        if (writer) {
          try {
            writer.abort();
          } catch {
          }
        }
        if (target) {
          updateLocalUpload(target.asset_id, {
            status: "Failed",
            errorMessage: formatError(error, `${file.name}: upload failed.`),
          });
          try {
            await uploads.AbortUpload(target.asset_id, target.upload_token);
          } catch {
          }
        }
        uploadErrors.push(`${file.name}: ${formatError(error, "upload failed")}`);
      }
    }

    return uploadErrors;
  }

  function handleComposerFiles(event: Event): void {
    const input = event.currentTarget as HTMLInputElement | null;
    composerFiles = input?.files ? Array.from(input.files) : [];
  }

  function removeComposerFile(index: number): void {
    composerFiles = composerFiles.filter((_, fileIndex) => fileIndex !== index);
    if (composerFiles.length === 0 && composerFileInput) {
      composerFileInput.value = "";
    }
  }

  async function restartStoryWatch(storyId: bigint): Promise<void> {
    const generation = ++activeWatchGeneration;
    stopStoryWatch(false);
    storyWatchState = "connecting";
    storyWatchError = null;

    try {
      const { storyStream } = await getJournalRpc();
      const stream = await storyStream.WatchStory(storyId);
      if (generation !== activeWatchGeneration) {
        closeStoryWatchHandle(stream as StoryWatchHandle);
        return;
      }
      activeStoryStream = stream as StoryWatchHandle;
      storyWatchState = "live";
      void consumeStoryWatch(stream as StoryWatchHandle, storyId, generation);
    } catch (error) {
      if (generation !== activeWatchGeneration) {
        return;
      }
      storyWatchState = "error";
      storyWatchError = formatError(error, "Could not connect the story watch stream.");
    }
  }

  async function consumeStoryWatch(stream: StoryWatchHandle, storyId: bigint, generation: number): Promise<void> {
    try {
      for await (const event of stream.reader) {
        if (generation !== activeWatchGeneration) {
          return;
        }
        applyStoryStreamEvent(storyId, event);
      }

      if (generation === activeWatchGeneration && selectedStory?.id === storyId) {
        storyWatchState = "idle";
      }
    } catch (error) {
      if (generation !== activeWatchGeneration) {
        return;
      }
      storyWatchState = "error";
      storyWatchError = formatError(error, "Story watch stream disconnected.");
    }
  }

  function stopStoryWatch(incrementGeneration = true): void {
    if (incrementGeneration) {
      activeWatchGeneration += 1;
    }
    storyWatchState = "idle";
    storyWatchError = null;
    if (activeStoryStream) {
      closeStoryWatchHandle(activeStoryStream);
      activeStoryStream = null;
    }
  }

  function closeStoryWatchHandle(stream: StoryWatchHandle): void {
    stream.reader.cancel();
    stream.writer.close();
  }

  function applyStoryStreamEvent(expectedStoryId: bigint, event: StoryStreamServerEvent): void {
    const storyId = event.story_id ?? expectedStoryId;

    if (event.progress) {
      updateLocalUpload(event.progress.asset_id, {
        bytesSent: event.progress.bytes_received,
        status: "Uploading",
      });
    }

    if (event.media) {
      if (event.media.status === MediaStatus.Ready) {
        updateLocalUpload(event.media.id, { status: "Ready", bytesSent: event.media.byte_size });
      }
      if (selectedStory?.id === storyId && !selectedStory.cover_image_url && event.media.kind === MediaKind.Image) {
        selectedStory = { ...selectedStory, cover_image_url: event.media.image_url };
      }
    }

    if (event.update) {
      applyStoryUpdate(event.update);
      return;
    }

    if (selectedStory?.id === storyId && event.media?.kind === MediaKind.Image && !selectedStory.cover_image_url) {
      selectedStory = { ...selectedStory, cover_image_url: event.media.image_url };
    }
  }

  function applyStoryUpdate(update: StoryUpdate): void {
    selectedUpdates = selectedStory?.id === update.story_id
      ? sortUpdatesByCreatedAt([...selectedUpdates.filter((item) => item.id !== update.id), update])
      : selectedUpdates;

    const coverImage = update.media.find((media) => media.kind === MediaKind.Image)?.image_url;
    if (selectedStory?.id === update.story_id) {
      selectedStory = {
        ...selectedStory,
        updated_at: update.created_at,
        cover_image_url: selectedStory.cover_image_url ?? coverImage,
      };
    }

    localUploads = localUploads.filter((upload) => !update.media.some((media) => media.id === upload.assetId));
    touchStoryPreview(update.story_id, update.created_at, coverImage);
  }

  function registerLocalUpload(target: UploadTarget, file: File, mimeType: string): void {
    const startedAt = new Date().toISOString();
    const upload: LocalUploadState = {
      assetId: target.asset_id,
      updateId: target.update_id ?? 0n,
      filename: file.name,
      kind: target.kind,
      mimeType,
      bytesSent: 0n,
      totalBytes: BigInt(file.size),
      status: "PendingUpload",
      startedAt,
    };
    localUploads = [upload, ...localUploads.filter((item) => item.assetId !== upload.assetId)];
  }

  function updateLocalUpload(assetId: bigint, changes: Partial<LocalUploadState>): void {
    localUploads = localUploads.map((upload) => {
      if (upload.assetId !== assetId) {
        return upload;
      }
      return { ...upload, ...changes };
    });
  }

  function clearLocalUpload(assetId: bigint): void {
    localUploads = localUploads.filter((upload) => upload.assetId !== assetId);
  }

  function localUploadProgressPct(upload: LocalUploadState): number {
    if (upload.totalBytes === 0n) {
      return upload.status === "Ready" ? 100 : 0;
    }
    const percent = Number((upload.bytesSent * 100n) / upload.totalBytes);
    return Math.max(0, Math.min(upload.status === "Ready" ? 100 : percent, 100));
  }

  function detailToPreview(detail: StoryDetail): StoryPreview {
    return {
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
      updated_at: detail.updated_at,
    };
  }

  function sortStoriesByUpdatedAt(values: StoryPreview[]): StoryPreview[] {
    return [...values].sort((lhs, rhs) => rhs.updated_at.localeCompare(lhs.updated_at));
  }

  function upsertStoryPreview(preview: StoryPreview): void {
    stories = sortStoriesByUpdatedAt([...stories.filter((story) => story.id !== preview.id), preview]);
  }

  function touchStoryPreview(storyId: bigint, updatedAt: string, coverImageUrl?: string): void {
    stories = sortStoriesByUpdatedAt(
      stories.map((story) => {
        if (story.id !== storyId) {
          return story;
        }
        return {
          ...story,
          updated_at: updatedAt,
          cover_image_url: story.cover_image_url ?? coverImageUrl,
        };
      }),
    );
  }

  function sortUpdatesByCreatedAt(values: StoryUpdate[]): StoryUpdate[] {
    return [...values].sort((lhs, rhs) => rhs.created_at.localeCompare(lhs.created_at));
  }

  function describeUploadFile(file: File): { kind: MediaKind; mimeType: string } | null {
    const explicitMimeType = file.type.trim().toLowerCase();
    if (explicitMimeType.startsWith("image/")) {
      return { kind: MediaKind.Image, mimeType: explicitMimeType };
    }
    if (explicitMimeType.startsWith("video/")) {
      return { kind: MediaKind.Video, mimeType: explicitMimeType };
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (imageExtensions.has(extension)) {
      return { kind: MediaKind.Image, mimeType: `image/${extension === "jpg" ? "jpeg" : extension}` };
    }
    if (videoExtensions.has(extension)) {
      return { kind: MediaKind.Video, mimeType: extension === "mov" ? "video/quicktime" : `video/${extension}` };
    }

    return null;
  }

  function inferComposerKindFromFiles(files: File[]): ComposerKind | null {
    let hasImage = false;
    let hasVideo = false;

    for (const file of files) {
      const descriptor = describeUploadFile(file);
      if (!descriptor) {
        continue;
      }
      if (descriptor.kind === MediaKind.Video) {
        hasVideo = true;
      }
      if (descriptor.kind === MediaKind.Image) {
        hasImage = true;
      }
    }

    if (hasVideo) {
      return "Video";
    }
    if (hasImage) {
      return "PhotoSet";
    }
    return null;
  }

  function storyWatchLabel(): string {
    switch (storyWatchState) {
      case "live":
        return "Watch stream live";
      case "connecting":
        return "Connecting watch stream";
      case "error":
        return "Watch stream error";
      default:
        return "Watch stream idle";
    }
  }

  function stageName(stage: StoryStage): keyof typeof StoryStage {
    return StoryStage[stage] as keyof typeof StoryStage;
  }

  function visibilityName(visibility: StoryVisibility): keyof typeof StoryVisibility {
    return StoryVisibility[visibility] as keyof typeof StoryVisibility;
  }

  function updateKindName(kind: UpdateKind): keyof typeof UpdateKind {
    return UpdateKind[kind] as keyof typeof UpdateKind;
  }

  function mediaKindName(kind: MediaKind): keyof typeof MediaKind {
    return MediaKind[kind] as keyof typeof MediaKind;
  }

  function mediaStatusName(status: MediaStatus): keyof typeof MediaStatus {
    return MediaStatus[status] as keyof typeof MediaStatus;
  }

  function stageBadge(stage: StoryStage): string {
    switch (stageName(stage)) {
      case "Vegetative":
        return "bg-emerald-400/15 text-emerald-100 border-emerald-300/20";
      case "Flowering":
        return "bg-amber-300/15 text-amber-100 border-amber-200/20";
      case "Harvest":
        return "bg-sand-200/15 text-sand-100 border-sand-200/20";
      case "Planning":
        return "bg-sky-300/15 text-ocean-100 border-ocean-300/20";
      default:
        return "bg-white/8 text-ocean-100 border-white/10";
    }
  }

  function updateBadge(kind: UpdateKind): string {
    switch (updateKindName(kind)) {
      case "Measurement":
        return "bg-ocean-400/15 text-ocean-100 border-ocean-300/25";
      case "PhotoSet":
        return "bg-emerald-300/15 text-emerald-100 border-emerald-300/20";
      case "Video":
        return "bg-sand-200/15 text-sand-100 border-sand-200/20";
      default:
        return "bg-white/8 text-ocean-100 border-white/10";
    }
  }

  function uploadTone(status: string): string {
    switch (status) {
      case "Ready":
        return "text-emerald-200";
      case "Uploading":
        return "text-ocean-200";
      case "Processing":
        return "text-sand-100";
      case "Queued":
        return "text-ocean-100/80";
      default:
        return "text-rose-200";
    }
  }

  function storyGradient(story: StoryPreview | StoryDetail): string {
    return stageGradients[Number(story.stage) % stageGradients.length];
  }

  function mediaGradient(kind: MediaKind, id: bigint): string {
    if (kind === MediaKind.Video) {
      return "linear-gradient(135deg, rgba(92, 34, 28, 0.95), rgba(170, 79, 48, 0.82), rgba(236, 174, 102, 0.34))";
    }
    const idx = Number(id % BigInt(stageGradients.length));
    return stageGradients[idx];
  }

  function mediaLabel(filename: string, kind: MediaKind): string {
    return kind === MediaKind.Video ? `Video: ${filename}` : filename;
  }

  function measurementEntries(update: StoryUpdate): string[] {
    if (!update.measurements) {
      return [];
    }

    const measurements = update.measurements;
    const entries = [
      measurements.ec !== undefined ? `EC ${measurements.ec.toFixed(2)}` : null,
      measurements.ph !== undefined ? `pH ${measurements.ph.toFixed(2)}` : null,
      measurements.ppm !== undefined ? `PPM ${Math.round(measurements.ppm)}` : null,
      measurements.solution_temperature_c !== undefined ? `Solution ${measurements.solution_temperature_c.toFixed(1)}C` : null,
      measurements.air_temperature_c !== undefined ? `Air ${measurements.air_temperature_c.toFixed(1)}C` : null,
      measurements.humidity_pct !== undefined ? `Humidity ${measurements.humidity_pct.toFixed(0)}%` : null,
      measurements.water_level_pct !== undefined ? `Water ${measurements.water_level_pct.toFixed(0)}%` : null,
    ];

    return entries.filter((entry): entry is string => entry !== null);
  }

  function buildMeasurementPayload(kind: UpdateKind): MeasurementSnapshot | undefined {
    if (kind !== UpdateKind.Measurement) {
      return undefined;
    }

    return {
      ec: 1.92,
      ph: 5.88,
      ppm: 964,
      solution_temperature_c: 21.1,
      air_temperature_c: 24.7,
      humidity_pct: 60,
      water_level_pct: 72,
      note: "Logged from the Svelte journal screen through the Swift mock RPC backend.",
    };
  }

  function statusProgress(status: MediaStatus): number {
    switch (status) {
      case MediaStatus.Ready:
        return 100;
      case MediaStatus.Processing:
        return 78;
      case MediaStatus.Queued:
        return 20;
      case MediaStatus.Uploading:
        return 52;
      case MediaStatus.PendingUpload:
        return 5;
      default:
        return 0;
    }
  }

  function formatTimestamp(timestamp: string): string {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return timestamp;
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsed);
  }

  function relativeTime(timestamp: string): string {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return timestamp;
    }

    const deltaSeconds = Math.round((parsed.getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ["day", 60 * 60 * 24],
      ["hour", 60 * 60],
      ["minute", 60],
    ];

    for (const [unit, size] of units) {
      if (Math.abs(deltaSeconds) >= size || unit === "minute") {
        return rtf.format(Math.round(deltaSeconds / size), unit);
      }
    }

    return rtf.format(deltaSeconds, "second");
  }

  function formatBytes(bytes: bigint): string {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) {
      return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function formatError(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === "string" && error.length > 0) {
      return error;
    }
    return fallback;
  }
</script>

<section class="space-y-5">
  <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
    <div class="max-w-3xl">
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Grow journal</p>
      <h2 class="mt-2 text-2xl font-semibold text-white sm:text-3xl">Track a crop like a living story, not a pile of detached uploads.</h2>
      <p class="mt-3 text-sm leading-6 text-ocean-100/80">This screen now talks to the Swift mock journal services end to end: story creation, timeline updates, live watch events, and browser media uploads all move through the generated NPRPC contract.</p>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <div class="rounded-3xl border border-white/10 bg-black/20 px-4 py-3">
        <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Stories</p>
        <p class="mt-2 text-2xl font-semibold text-white">{summary.stories}</p>
      </div>
      <div class="rounded-3xl border border-white/10 bg-black/20 px-4 py-3">
        <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Updates</p>
        <p class="mt-2 text-2xl font-semibold text-white">{summary.updates}</p>
      </div>
      <div class="rounded-3xl border border-white/10 bg-black/20 px-4 py-3">
        <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Pending uploads</p>
        <p class="mt-2 text-2xl font-semibold text-white">{summary.pendingUploads}</p>
      </div>
    </div>
  </div>

  {#if loadingError}
    <div class="rounded-[1.5rem] border border-rose-300/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{loadingError}</div>
  {/if}

  {#if lastActionMessage}
    <div class="rounded-[1.5rem] border border-emerald-300/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">{lastActionMessage}</div>
  {/if}

  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
    <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
      Search stories
      <input bind:value={search} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" placeholder="Basil, tomato, reservoir..." />
    </label>

    <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
      Stage
      <select bind:value={stageFilter} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30">
        {#each stageOptions as stage}
          <option value={stage.value}>{stage.label}</option>
        {/each}
      </select>
    </label>
  </div>

  <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5 sm:p-6">
    <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
      <div class="max-w-2xl">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Create story</p>
        <p class="mt-2 text-sm leading-6 text-ocean-100/78">Start a new grow log directly against the server mock, then let the watch stream keep the selected story warm while updates and media arrive.</p>
      </div>
      <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void submitStory()} disabled={creatingStory || !createStoryTitle.trim() || !createStoryCrop.trim() || !createStoryDescription.trim()}>{creatingStory ? "Creating..." : "Create RPC story"}</button>
    </div>

    <div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Title
          <input bind:value={createStoryTitle} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="Reservoir reset week 1" />
        </label>
        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Crop
          <input bind:value={createStoryCrop} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="Tomato, basil, lettuce..." />
        </label>
        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Visibility
          <select bind:value={createStoryVisibility} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300">
            {#each visibilityOptions as visibility}
              <option value={visibility.value}>{visibility.label}</option>
            {/each}
          </select>
        </label>
        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Solution ID
          <input bind:value={createStorySolutionId} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="Optional" />
        </label>
      </div>

      <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
        Description
        <textarea bind:value={createStoryDescription} class="min-h-32 rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300"></textarea>
      </label>
    </div>
  </section>

  <div class="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
    <aside class="rounded-[1.75rem] border border-white/10 bg-black/12 p-3 sm:p-4">
      <div class="mb-3 flex items-center justify-between text-sm text-ocean-100/70">
        <span>{filteredStories.length} visible stories</span>
        <span>{stories.length} total</span>
      </div>

      {#if !storiesLoaded}
        <div class="rounded-[1.5rem] border border-white/10 bg-black/18 px-4 py-5 text-sm text-ocean-100/75">Connecting to the Swift journal service...</div>
      {:else if filteredStories.length === 0}
        <div class="rounded-[1.5rem] border border-white/10 bg-black/18 px-4 py-5 text-sm text-ocean-100/75">No stories match the current filter.</div>
      {:else}
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
        {#each filteredStories as story}
          <button
            type="button"
            class={`overflow-hidden rounded-[1.5rem] border text-left transition ${selectedStory?.id === story.id ? 'border-sand-200/50 bg-white/8 shadow-[0_18px_44px_rgba(0,0,0,0.28)]' : 'border-white/10 bg-black/18 hover:bg-white/8'}`}
            onclick={() => void selectStory(story.slug)}
          >
            <div class="h-28 px-4 py-4" style={`background:${storyGradient(story)}`}>
              <div class="flex items-start justify-between gap-3">
                <span class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${stageBadge(story.stage)}`}>{stageName(story.stage)}</span>
                <span class="rounded-full bg-black/30 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/80">{visibilityName(story.visibility)}</span>
              </div>
            </div>
            <div class="space-y-3 px-4 py-4">
              <div>
                <p class="text-lg font-semibold text-white">{story.title}</p>
                <p class="mt-1 text-sm text-ocean-100/75">{story.crop_name}</p>
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-ocean-100/70">
                <span class="rounded-full bg-white/6 px-2.5 py-1">{story.solution_name ?? "No solution linked"}</span>
                <span class="rounded-full bg-white/6 px-2.5 py-1">{relativeTime(story.updated_at)}</span>
              </div>
              <div class="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-ocean-200/60">
                <span>{story.author_name}</span>
                <span>{formatTimestamp(story.updated_at)}</span>
              </div>
            </div>
          </button>
        {/each}
        </div>
      {/if}
    </aside>

    {#if selectedStory}
      <div class="space-y-4">
        <section class="overflow-hidden rounded-[2rem] border border-white/10 bg-black/12">
          <div class="min-h-52 p-5 sm:p-6" style={`background:${storyGradient(selectedStory)}`}>
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="max-w-3xl">
                <div class="flex flex-wrap gap-2">
                  <span class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${stageBadge(selectedStory.stage)}`}>{stageName(selectedStory.stage)}</span>
                  <span class="rounded-full bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">{visibilityName(selectedStory.visibility)}</span>
                  {#if selectedStory.solution_name}
                    <span class="rounded-full bg-black/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">{selectedStory.solution_name}</span>
                  {/if}
                </div>
                <h3 class="mt-4 text-3xl font-semibold text-white sm:text-4xl">{selectedStory.title}</h3>
                <p class="mt-2 text-sm uppercase tracking-[0.22em] text-white/70">{selectedStory.crop_name} • {selectedStory.author_name}</p>
                <p class="mt-4 max-w-2xl text-sm leading-6 text-white/86">{selectedStory.description}</p>
              </div>

              <div class="space-y-3">
                <div class="rounded-[1.5rem] border border-white/15 bg-black/22 p-4 text-sm text-white/85">
                  <p class="text-xs uppercase tracking-[0.22em] text-white/65">Cover</p>
                  <p class="mt-2 max-w-52 leading-6">{selectedStory.cover_image_url ?? "No cover image yet. Attach one through the upload service and it will surface here."}</p>
                </div>
                <div class="rounded-[1.5rem] border border-white/15 bg-black/22 p-4 text-sm text-white/85">
                  <p class="text-xs uppercase tracking-[0.22em] text-white/65">Live watch</p>
                  <p class="mt-2 font-semibold">{storyWatchLabel()}</p>
                  <p class="mt-1 text-xs leading-5 text-white/70">The selected story keeps an open bidi stream so update creation, upload progress, and asset attachment can surface without a manual reload.</p>
                  {#if storyWatchError}
                    <p class="mt-2 text-xs text-rose-200">{storyWatchError}</p>
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <div class="grid gap-3 border-t border-white/10 bg-black/18 px-5 py-4 sm:grid-cols-3 sm:px-6">
            <div class="rounded-3xl bg-black/20 px-4 py-3">
              <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Created</p>
              <p class="mt-2 text-lg font-semibold text-white">{formatTimestamp(selectedStory.created_at)}</p>
            </div>
            <div class="rounded-3xl bg-black/20 px-4 py-3">
              <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Last update</p>
              <p class="mt-2 text-lg font-semibold text-white">{relativeTime(selectedStory.updated_at)}</p>
            </div>
            <div class="rounded-3xl bg-black/20 px-4 py-3">
              <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Timeline depth</p>
              <p class="mt-2 text-lg font-semibold text-white">{selectedUpdates.length} entries</p>
            </div>
          </div>
        </section>

        <div class="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section class="space-y-4">
            {#if loadingStory}
              <div class="rounded-[1.75rem] border border-white/10 bg-black/12 px-5 py-6 text-sm text-ocean-100/75">Loading story timeline...</div>
            {/if}

            {#each selectedUpdates as update}
              <article class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5 sm:p-6">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${updateBadge(update.kind)}`}>{updateKindName(update.kind)}</span>
                      <span class="text-xs uppercase tracking-[0.18em] text-ocean-200/60">{relativeTime(update.created_at)}</span>
                    </div>
                    <h4 class="mt-3 text-xl font-semibold text-white">{update.title ?? "Untitled update"}</h4>
                    <p class="mt-1 text-sm uppercase tracking-[0.18em] text-ocean-200/60">{update.author_name}</p>
                  </div>
                  <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10" onclick={() => { composerTitle = update.title ?? composerTitle; composerBody = `Follow-up to: ${update.title ?? 'latest update'}\n\n`; }}>Reply later</button>
                </div>

                {#if update.body.trim().length > 0}
                  <p class="mt-4 text-sm leading-7 text-ocean-50/90">{update.body}</p>
                {:else}
                  <p class="mt-4 text-sm italic leading-7 text-ocean-100/55">Media-only entry.</p>
                {/if}

                {#if measurementEntries(update).length > 0}
                  <div class="mt-4 flex flex-wrap gap-2">
                    {#each measurementEntries(update) as metric}
                      <span class="rounded-full border border-ocean-300/20 bg-ocean-400/10 px-3 py-1 text-xs font-medium text-ocean-100">{metric}</span>
                    {/each}
                  </div>
                {/if}

                {#if update.measurements?.note}
                  <p class="mt-3 rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-ocean-100/78">{update.measurements.note}</p>
                {/if}

                {#if update.media.length > 0}
                  <div class="mt-5 grid gap-3 md:grid-cols-2">
                    {#each update.media as media}
                      <div class="overflow-hidden rounded-[1.4rem] border border-white/10 bg-black/20">
                        <div class="h-36 px-4 py-4" style={`background:${mediaGradient(media.kind, media.id)}`}>
                          <div class="flex items-start justify-between gap-3">
                            <span class="rounded-full bg-black/28 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/85">{mediaKindName(media.kind)}</span>
                            <span class={`text-xs font-semibold uppercase tracking-[0.18em] ${uploadTone(mediaStatusName(media.status))}`}>{mediaStatusName(media.status)}</span>
                          </div>
                        </div>
                        <div class="space-y-2 px-4 py-4 text-sm text-ocean-100/80">
                          <p class="font-semibold text-white">{mediaLabel(media.original_filename, media.kind)}</p>
                          <p>{media.original_filename}</p>
                          <div class="flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-ocean-200/60">
                            <span>{formatBytes(media.byte_size)}</span>
                            <span>{media.mime_type}</span>
                            {#if media.duration_ms}
                              <span>{Math.round(Number(media.duration_ms) / 1000)}s</span>
                            {/if}
                          </div>
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </article>
            {/each}
          </section>

          <aside class="space-y-4">
            <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5">
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Upload queue</p>
              {#if selectedUploads.length > 0}
                <div class="mt-4 space-y-3">
                {#each selectedUploads as upload}
                  <div class="rounded-3xl border border-white/10 bg-black/18 p-4">
                    <div class="flex items-start justify-between gap-3">
                      <div>
                        <p class="font-semibold text-white">{upload.label}</p>
                        <p class="mt-1 text-xs uppercase tracking-[0.18em] text-ocean-200/60">{upload.kind} • {upload.detail}</p>
                      </div>
                      <span class={`text-xs font-semibold uppercase tracking-[0.18em] ${uploadTone(upload.status)}`}>{upload.status}</span>
                    </div>
                    <div class="mt-3 h-2 rounded-full bg-white/8">
                      <div class="h-full rounded-full bg-ocean-300" style={`width:${upload.progressPct}%`}></div>
                    </div>
                    <p class="mt-2 text-xs text-ocean-100/70">{upload.progressPct}% complete</p>
                  </div>
                {/each}
                </div>
              {:else}
                <p class="mt-4 text-sm text-ocean-100/75">No upload activity yet. Pick files in the composer below and they will stream through the upload RPC, report progress here, then attach back onto the selected story.</p>
              {/if}
            </section>

            <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5">
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Quick compose</p>
              <p class="mt-3 text-sm leading-6 text-ocean-100/72">Posting creates the update first, then image and video files stream in chunks through the upload service and attach to that update. Text is optional when media is attached.</p>
              <div class="mt-4 space-y-3">
                <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
                  Entry type
                  <select bind:value={composerKind} disabled={composerFiles.length > 0} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300 disabled:cursor-not-allowed disabled:opacity-60">
                    {#each composerKinds as kind}
                      <option value={kind}>{kind}</option>
                    {/each}
                  </select>
                  {#if composerFiles.length > 0}
                    <p class="text-[11px] font-medium normal-case tracking-normal text-ocean-100/65">Auto-set to {effectiveComposerKind} from the attached media.</p>
                  {/if}
                </label>
                <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
                  Title
                  <input bind:value={composerTitle} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" />
                </label>
                <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
                  Body
                  <textarea bind:value={composerBody} class="min-h-32 rounded-3xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="Optional if you are only attaching media."></textarea>
                </label>
                <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
                  Attach media
                  <input bind:this={composerFileInput} type="file" multiple accept="image/*,video/*" class="block w-full cursor-pointer rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-sm font-normal normal-case tracking-normal text-ocean-100 file:mr-4 file:rounded-xl file:border-0 file:bg-sand-200 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ocean-950" onchange={handleComposerFiles} />
                </label>
                {#if composerFiles.length > 0}
                  <div class="space-y-2">
                    {#each composerFiles as file, index}
                      <div class="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-ocean-100/82">
                        <div>
                          <p class="font-semibold text-white">{file.name}</p>
                          <p class="mt-1 text-xs uppercase tracking-[0.16em] text-ocean-200/60">{describeUploadFile(file)?.kind === MediaKind.Video ? "Video" : "Image"} • {formatBytes(BigInt(file.size))}</p>
                        </div>
                        <button type="button" class="rounded-xl border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-white/8" onclick={() => removeComposerFile(index)}>Remove</button>
                      </div>
                    {/each}
                  </div>
                {/if}
                <button type="button" class="touch-target w-full rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void submitUpdate()} disabled={submittingUpdate || !canSubmitUpdate}>{submittingUpdate ? "Posting..." : composerFiles.length > 0 ? `Post ${effectiveComposerKind} update and upload media` : `Post ${effectiveComposerKind} RPC update`}</button>
              </div>
            </section>

            <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5">
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Story direction</p>
              <div class="mt-4 flex flex-wrap gap-2 text-sm text-ocean-100/80">
                {#each storyDirection as stat}
                  <span class="rounded-full border border-white/10 bg-white/6 px-3 py-1.5">{stat}</span>
                {/each}
              </div>
            </section>
          </aside>
        </div>
      </div>
    {:else if storiesLoaded}
      <div class="rounded-[1.75rem] border border-white/10 bg-black/12 p-6 text-sm text-ocean-100/80">
        Select a story to load its timeline from the server.
      </div>
    {/if}
  </div>
</section>