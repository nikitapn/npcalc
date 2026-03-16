<script lang="ts">
  import { onMount } from "svelte";
  import Solution from "./Solution.svelte";
  import Virtual from "./Virtual.svelte";
  import { solutionCardFromRpc, type SolutionCardData } from "../lib/catalogData";
  import { getNscalcRpc } from "../lib/nscalcRpc";

  let search = $state("");
  let author = $state("");
  let solutions = $state<SolutionCardData[]>([]);
  let nextCursor = $state<string | null>(null);
  let loadingInitial = $state(true);
  let loadingMore = $state(false);
  let errorMessage = $state<string | null>(null);
  let activeRequest = 0;
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    void reloadSolutions();
  });

  $effect(() => {
    search;
    author;

    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }
    debounceHandle = setTimeout(() => {
      void reloadSolutions();
    }, 180);

    return () => {
      if (debounceHandle) {
        clearTimeout(debounceHandle);
      }
    };
  });

  const visibleSolutions = $derived(solutions);

  async function reloadSolutions(): Promise<void> {
    const requestId = ++activeRequest;
    loadingInitial = true;
    errorMessage = null;

    try {
      const { calculator } = await getNscalcRpc();
      const page = await calculator.ListSolutionsPage(search.trim(), author.trim(), "", 24);
      if (requestId !== activeRequest) {
        return;
      }
      solutions = page.items.map(solutionCardFromRpc);
      nextCursor = page.next_cursor ?? null;
    } catch (error) {
      if (requestId !== activeRequest) {
        return;
      }
      solutions = [];
      nextCursor = null;
      errorMessage = error instanceof Error ? error.message : "Failed to load solutions.";
    } finally {
      if (requestId === activeRequest) {
        loadingInitial = false;
      }
    }
  }

  async function loadMoreSolutions(): Promise<void> {
    if (!nextCursor || loadingMore || loadingInitial) {
      return;
    }

    const requestId = activeRequest;
    loadingMore = true;

    try {
      const { calculator } = await getNscalcRpc();
      const page = await calculator.ListSolutionsPage(search.trim(), author.trim(), nextCursor, 24);
      if (requestId !== activeRequest) {
        return;
      }
      solutions = [...solutions, ...page.items.map(solutionCardFromRpc)];
      nextCursor = page.next_cursor ?? null;
    } catch (error) {
      if (requestId !== activeRequest) {
        return;
      }
      errorMessage = error instanceof Error ? error.message : "Failed to load more solutions.";
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
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Solution library</p>
      <h2 class="mt-2 text-2xl font-semibold text-white sm:text-3xl">Scroll comfortably on phones without losing density on desktop.</h2>
    </div>
    <div class="flex flex-wrap items-center gap-3 text-sm text-ocean-100/75">
      <span class="rounded-full bg-white/6 px-3 py-1.5">{visibleSolutions.length} loaded</span>
      <span class="rounded-full bg-white/6 px-3 py-1.5">{nextCursor ? "More available" : "End of results"}</span>
    </div>
  </div>

  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
    <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
      Search by name
      <input bind:value={search} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" placeholder="Calcium, cucumber, bloom..." />
    </label>

    <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
      Author
      <input bind:value={author} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" placeholder="superuser, guest..." />
    </label>
  </div>

  {#if errorMessage}
    <div class="rounded-[1.75rem] border border-rose-200/20 bg-rose-950/20 px-4 py-4 text-sm text-rose-100">{errorMessage}</div>
  {/if}

  {#if loadingInitial}
    <div class="rounded-[1.75rem] border border-white/10 bg-black/10 px-4 py-10 text-sm text-ocean-100/75">Loading solutions from the RPC catalog...</div>
  {:else if visibleSolutions.length === 0}
    <div class="rounded-[1.75rem] border border-white/10 bg-black/10 px-4 py-10 text-sm text-ocean-100/75">No solutions match the current filters.</div>
  {:else}
    <Virtual
      items={visibleSolutions}
      itemHeight={372}
      minColumnWidth={320}
      gap={18}
      viewportClass="h-[68vh] rounded-[1.75rem] border border-white/10 bg-black/10 p-3 sm:p-4"
      getKey={(solution) => (solution as SolutionCardData).id}
    >
      {#snippet children(solution, index)}
        <Solution {solution} {index} />
      {/snippet}
    </Virtual>

    <div class="flex justify-center pt-1">
      <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void loadMoreSolutions()} disabled={!nextCursor || loadingMore}>
        {loadingMore ? "Loading more..." : nextCursor ? "Load more solutions" : "All solutions loaded"}
      </button>
    </div>
  {/if}
</section>
