<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { getJournalRpc } from "./journalRpc";
  import { loadShakaPlayer } from "./loadShakaPlayer";

  type PlaybackState = "loading" | "playing" | "error";

  let { assetId, title, posterUrl = null }: { assetId: bigint; title: string; posterUrl?: string | null } = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let status = $state<PlaybackState>("loading");
  let errorMessage = $state<string | null>(null);
  let bytesLoaded = $state(0);
  let playerInstance: any = null;
  let shakaLibrary: any = null;
  let schemeRegistered = false;

  function parseByteRange(header: string): [bigint, bigint] {
    const match = header.match(/bytes=(\d+)-(\d*)/i);
    if (!match) {
      throw new Error(`Unsupported Range header: ${header}`);
    }

    const offset = BigInt(match[1]);
    if (!match[2]) {
      return [offset, 0n];
    }

    const end = BigInt(match[2]);
    return [offset, end - offset + 1n];
  }

  async function mergeStream(stream: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    for await (const chunk of stream) {
      chunks.push(chunk);
      totalLength += chunk.byteLength;
    }

    const output = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
      output.set(chunk, position);
      position += chunk.byteLength;
    }
    return output;
  }

  async function ensureSchemeRegistered(shaka: any): Promise<void> {
    if (schemeRegistered) {
      return;
    }

    const { media } = await getJournalRpc();
    shaka.net.NetworkingEngine.registerScheme(
      "nprpc-journal",
      (uri: string, request: any, type: number) => {
        const MANIFEST = 0;
        return shaka.util.AbortableOperation.notAbortable(
          (async (): Promise<any> => {
            const url = new URL(uri);
            const requestedAssetId = BigInt(url.hostname);
            const representation = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

            let bytes: Uint8Array;

            if (type === MANIFEST) {
              const manifest = await media.GetVideoDashManifest(requestedAssetId);
              bytes = new TextEncoder().encode(manifest);
            } else {
              const rangeHeader = request.headers?.Range ?? request.headers?.range;
              if (!rangeHeader) {
                throw new Error(`Missing Range header for media request: ${uri}`);
              }
              const [offset, length] = parseByteRange(rangeHeader);
              const stream = await media.GetVideoDashSegmentRange(requestedAssetId, offset, length, representation);
              bytes = await mergeStream(stream as AsyncIterable<Uint8Array>);
              bytesLoaded += bytes.byteLength;
            }

            return {
              uri,
              headers: {},
              data: bytes.buffer,
              fromCache: false,
              timeMs: 0,
            };
          })(),
        );
      },
    );

    schemeRegistered = true;
  }

  async function releaseScheme(): Promise<void> {
    if (!schemeRegistered || !shakaLibrary) {
      return;
    }

    try {
      shakaLibrary.net.NetworkingEngine.unregisterScheme("nprpc-journal");
    } catch {
    }
    schemeRegistered = false;
  }

  async function startPlayback(): Promise<void> {
    if (!videoEl) {
      return;
    }

    status = "loading";
    errorMessage = null;
    bytesLoaded = 0;

    try {
      if (playerInstance) {
        try {
          await playerInstance.destroy();
        } catch {
        }
        playerInstance = null;
      }

      shakaLibrary = await loadShakaPlayer();
      shakaLibrary.polyfill.installAll();

      if (!shakaLibrary.Player.isBrowserSupported()) {
        throw new Error("This browser is not supported by Shaka Player.");
      }

      await ensureSchemeRegistered(shakaLibrary);

      playerInstance = new shakaLibrary.Player();
      await playerInstance.attach(videoEl);
      playerInstance.addEventListener("error", (event: any) => {
        const detail = event.detail;
        errorMessage = detail?.message ?? `Shaka error ${detail?.code ?? "unknown"}`;
        status = "error";
      });

      await playerInstance.load(`nprpc-journal://${assetId}/adaptive.mpd`);
      await videoEl.play().catch(() => undefined);
      status = "playing";
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Playback failed.";
      status = "error";
    }
  }

  onMount(() => {
    void startPlayback();
  });

  onDestroy(() => {
    void (async () => {
      if (playerInstance) {
        try {
          await playerInstance.destroy();
        } catch {
        }
        playerInstance = null;
      }
      await releaseScheme();
    })();
  });
</script>

<div class="space-y-3">
  <div class="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/45">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={videoEl} class="aspect-video w-full bg-black object-contain" controls playsinline poster={posterUrl ?? undefined}></video>

    {#if status === "loading"}
      <div class="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
        <p class="text-sm font-medium text-white/85">Loading adaptive stream...</p>
      </div>
    {/if}

    {#if status === "error"}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center">
        <p class="text-sm font-semibold text-rose-200">Playback failed</p>
        <p class="max-w-md text-sm leading-6 text-white/72">{errorMessage}</p>
        <button type="button" class="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12" onclick={() => void startPlayback()}>
          Retry stream
        </button>
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 bg-black/16 px-4 py-3 text-sm text-ocean-100/78">
    <div>
      <p class="font-semibold text-white">{title}</p>
      <p class="mt-1 text-xs uppercase tracking-[0.18em] text-ocean-200/60">Adaptive DASH via NPRPC + Shaka</p>
    </div>
    <p class="text-xs uppercase tracking-[0.18em] text-ocean-200/60">{(bytesLoaded / 1024 / 1024).toFixed(1)} MB received</p>
  </div>
</div>