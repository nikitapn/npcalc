<script lang="ts">
  import { onMount } from "svelte";
  import Virtual from "./Virtual.svelte";
  import { fertilizerCardFromRpc, type FertilizerCardData } from "../lib/catalogData";
  import { listFertilizersPageCached } from "../lib/catalogRpcCache";
  import { getFertilizersViewState, setFertilizersViewState } from "../lib/catalogViewState";

  const initialState = getFertilizersViewState();

  let search = $state(initialState.search);
  let fertilizers = $state<FertilizerCardData[]>(initialState.items);
  let nextCursor = $state<string | null>(initialState.nextCursor);
  let loadingInitial = $state(!initialState.ready);
  let loadingMore = $state(false);
  let errorMessage = $state<string | null>(null);
  let activeRequest = 0;
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  let filtersInitialized = false;

  onMount(() => {
    if (!initialState.ready) {
      void reloadFertilizers();
    }
  });

  $effect(() => {
    search;

    if (!filtersInitialized) {
      filtersInitialized = true;
      return;
    }

    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }
    debounceHandle = setTimeout(() => {
      void reloadFertilizers();
    }, 180);

    return () => {
      if (debounceHandle) {
        clearTimeout(debounceHandle);
      }
    };
  });

  $effect(() => {
    setFertilizersViewState({
      ready: !loadingInitial,
      search,
      items: fertilizers,
      nextCursor,
    });
  });

  const filteredFertilizers = $derived(fertilizers);

  async function reloadFertilizers(): Promise<void> {
    const requestId = ++activeRequest;
    loadingInitial = true;
    errorMessage = null;

    try {
      const page = await listFertilizersPageCached(search.trim(), "", 24);
      if (requestId !== activeRequest) {
        return;
      }
      fertilizers = page.items.map(fertilizerCardFromRpc);
      nextCursor = page.nextCursor;
    } catch (error) {
      if (requestId !== activeRequest) {
        return;
      }
      fertilizers = [];
      nextCursor = null;
      errorMessage = error instanceof Error ? error.message : "Failed to load fertilizers.";
    } finally {
      if (requestId === activeRequest) {
        loadingInitial = false;
      }
    }
  }

  async function loadMoreFertilizers(): Promise<void> {
    if (!nextCursor || loadingMore || loadingInitial) {
      return;
    }

    const requestId = activeRequest;
    loadingMore = true;

    try {
      const page = await listFertilizersPageCached(search.trim(), nextCursor, 24);
      if (requestId !== activeRequest) {
        return;
      }
      fertilizers = [...fertilizers, ...page.items.map(fertilizerCardFromRpc)];
      nextCursor = page.nextCursor;
    } catch (error) {
      if (requestId !== activeRequest) {
        return;
      }
      errorMessage = error instanceof Error ? error.message : "Failed to load more fertilizers.";
    } finally {
      if (requestId === activeRequest) {
        loadingMore = false;
      }
    }
  }
</script>

<section class="space-y-5">
  <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Fertilizer shelf</p>
      <h2 class="mt-2 text-2xl font-semibold text-white sm:text-3xl">Cards stay legible on phones and can scale into a denser product grid.</h2>
    </div>
    <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80 lg:min-w-[18rem]">
      Search products
      <input bind:value={search} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" placeholder="Magnesium, sulfate, nitrate..." />
    </label>
  </div>

  <div class="flex flex-wrap items-center gap-3 text-sm text-ocean-100/75">
    <span class="rounded-full bg-white/6 px-3 py-1.5">{filteredFertilizers.length} loaded</span>
    <span class="rounded-full bg-white/6 px-3 py-1.5">{nextCursor ? "More available" : "End of results"}</span>
  </div>

  {#if errorMessage}
    <div class="rounded-[1.75rem] border border-rose-200/20 bg-rose-950/20 px-4 py-4 text-sm text-rose-100">{errorMessage}</div>
  {/if}

  {#if loadingInitial}
    <div class="rounded-[1.75rem] border border-white/10 bg-black/10 px-4 py-10 text-sm text-ocean-100/75">Loading fertilizers from the RPC catalog...</div>
  {:else if filteredFertilizers.length === 0}
    <div class="rounded-[1.75rem] border border-white/10 bg-black/10 px-4 py-10 text-sm text-ocean-100/75">No fertilizers match the current search.</div>
  {:else}
    <Virtual
      items={filteredFertilizers}
      itemHeight={250}
      minColumnWidth={280}
      gap={18}
      frameClass="h-[62vh] rounded-[1.75rem] border border-white/10 bg-black/10"
      viewportClass="h-full p-3 sm:p-4"
      getKey={(fertilizer) => (fertilizer as FertilizerCardData).id}
    >
      {#snippet children(fertilizer)}
        <article class="panel-surface hairline h-full rounded-[1.75rem] p-4">
          <div class="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/75">Product card</p>
              <h3 class="mt-1 truncate text-lg font-semibold text-white">{fertilizer.name}</h3>
              <p class="mt-1 text-sm text-ocean-100/70">by {fertilizer.author}</p>
            </div>
            <span class="rounded-full border border-sand-200/25 bg-sand-200/10 px-3 py-1 text-xs font-medium text-sand-100">${fertilizer.cost}</span>
          </div>

          <dl class="mt-4 grid grid-cols-2 gap-2 text-sm">
            {#each Object.entries(fertilizer.elements) as [name, value]}
              <div class="rounded-2xl bg-black/20 px-3 py-2">
                <dt class="text-ocean-100/65">{name}</dt>
                <dd class="mt-1 font-semibold text-white">{value}%</dd>
              </div>
            {/each}
          </dl>
        </article>
      {/snippet}
    </Virtual>

    <div class="flex justify-center pt-1">
      <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void loadMoreFertilizers()} disabled={!nextCursor || loadingMore}>
        {loadingMore ? "Loading more..." : nextCursor ? "Load more fertilizers" : "All fertilizers loaded"}
      </button>
    </div>
  {/if}
</section>