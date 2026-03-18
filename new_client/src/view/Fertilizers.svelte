<script lang="ts">
  import * as nscalc from "@rpc/nscalc";
  import { onMount } from "svelte";
  import Virtual from "./Virtual.svelte";
  import { fertilizerCardFromRpc, type FertilizerCardData } from "../lib/catalogData";
  import { invalidateFertilizersCatalogCache, listFertilizersPageCached } from "../lib/catalogRpcCache";
  import { getFertilizersViewState, setFertilizersViewState } from "../lib/catalogViewState";

  type Props = {
    currentUserName?: string | null;
    currentUser?: nscalc.RegisteredUser | null;
  };

  let { currentUserName = null, currentUser = null }: Props = $props();

  const initialState = getFertilizersViewState();

  let search = $state(initialState.search);
  let fertilizers = $state<FertilizerCardData[]>(initialState.items);
  let nextCursor = $state<string | null>(initialState.nextCursor);
  let loadingInitial = $state(!initialState.ready);
  let loadingMore = $state(false);
  let errorMessage = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);
  let activeRequest = 0;
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  let filtersInitialized = false;
  let editingFertilizerId = $state<number | null>(null);
  let formulaDraftById = $state<Record<number, string>>({});
  let fertilizerBusyById = $state<Record<number, boolean>>({});
  let fertilizerErrorById = $state<Record<number, string | null>>({});
  let fertilizerMessageById = $state<Record<number, string | null>>({});
  let createPanelOpen = $state(false);
  let createName = $state("");
  let createFormula = $state("");
  let createBusy = $state(false);
  let createError = $state<string | null>(null);
  let createMessage = $state<string | null>(null);

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
      statusMessage = null;
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

  function toggleCreatePanel(): void {
    createPanelOpen = !createPanelOpen;
  }

  function canEditFertilizer(fertilizer: FertilizerCardData): boolean {
    return Boolean(currentUser && currentUserName && currentUserName === fertilizer.author);
  }

  function bottleLabel(bottle: nscalc.FertilizerBottle | null | undefined, formula?: string | null): string {
    return bottle === nscalc.FertilizerBottle.A ? "Tank A" : bottle === nscalc.FertilizerBottle.B ? "Tank B" : "Tank C";
  }

  function bottleBadgeClass(bottle: nscalc.FertilizerBottle | null | undefined, formula?: string | null): string {
    if (bottle === nscalc.FertilizerBottle.B) {
      return "border-emerald-300/30 bg-emerald-400/14 text-emerald-100";
    }
    if (bottle === nscalc.FertilizerBottle.C) {
      return "border-rose-300/30 bg-rose-400/14 text-rose-100";
    }
    return "border-sand-200/35 bg-sand-200/12 text-sand-50";
  }

  function fertilizerCardClass(bottle: nscalc.FertilizerBottle | null | undefined, formula?: string | null): string {
    if (bottle === nscalc.FertilizerBottle.B) {
      return "border-emerald-300/28 bg-[linear-gradient(180deg,rgba(8,79,61,0.92),rgba(6,46,41,0.96))]";
    }
    if (bottle === nscalc.FertilizerBottle.C) {
      return "border-rose-300/28 bg-[linear-gradient(180deg,rgba(108,24,52,0.9),rgba(63,15,33,0.96))]";
    }
    return "border-sand-200/24 bg-[linear-gradient(180deg,rgba(74,55,26,0.78),rgba(38,28,18,0.92))]";
  }

  function formulaDraftFor(fertilizer: FertilizerCardData): string {
    return formulaDraftById[fertilizer.id] ?? fertilizer.formula;
  }

  function beginEdit(fertilizer: FertilizerCardData): void {
    editingFertilizerId = fertilizer.id;
    formulaDraftById = {
      ...formulaDraftById,
      [fertilizer.id]: fertilizer.formula,
    };
    fertilizerErrorById = {
      ...fertilizerErrorById,
      [fertilizer.id]: null,
    };
    fertilizerMessageById = {
      ...fertilizerMessageById,
      [fertilizer.id]: null,
    };
    statusMessage = null;
  }

  function cancelEdit(fertilizer: FertilizerCardData): void {
    editingFertilizerId = editingFertilizerId === fertilizer.id ? null : editingFertilizerId;
    formulaDraftById = {
      ...formulaDraftById,
      [fertilizer.id]: fertilizer.formula,
    };
    fertilizerErrorById = {
      ...fertilizerErrorById,
      [fertilizer.id]: null,
    };
    fertilizerMessageById = {
      ...fertilizerMessageById,
      [fertilizer.id]: null,
    };
  }

  function updateFormulaDraft(id: number, value: string): void {
    formulaDraftById = {
      ...formulaDraftById,
      [id]: value,
    };
    fertilizerErrorById = {
      ...fertilizerErrorById,
      [id]: null,
    };
    fertilizerMessageById = {
      ...fertilizerMessageById,
      [id]: null,
    };
    statusMessage = null;
  }

  async function refreshVisibleFertilizers(): Promise<FertilizerCardData[]> {
    const page = await listFertilizersPageCached(search.trim(), "", Math.max(fertilizers.length, 24));
    const refreshed = page.items.map(fertilizerCardFromRpc);
    fertilizers = refreshed;
    nextCursor = page.nextCursor;
    return refreshed;
  }

  async function verifyFertilizer(fertilizer: FertilizerCardData): Promise<void> {
    if (!currentUser) {
      fertilizerErrorById = {
        ...fertilizerErrorById,
        [fertilizer.id]: "Log in again before editing fertilizers.",
      };
      return;
    }

    const nextFormula = formulaDraftFor(fertilizer).trim();
    if (!nextFormula) {
      fertilizerErrorById = {
        ...fertilizerErrorById,
        [fertilizer.id]: "Enter a formula before verifying.",
      };
      return;
    }

    fertilizerBusyById = {
      ...fertilizerBusyById,
      [fertilizer.id]: true,
    };
    fertilizerErrorById = {
      ...fertilizerErrorById,
      [fertilizer.id]: null,
    };
    fertilizerMessageById = {
      ...fertilizerMessageById,
      [fertilizer.id]: "Verifying with backend parser...",
    };

    try {
      await currentUser.SetFertilizerFormula(fertilizer.id, nextFormula);
      invalidateFertilizersCatalogCache();
      const refreshed = await refreshVisibleFertilizers();
      const updated = refreshed.find((item) => item.id === fertilizer.id);
      formulaDraftById = {
        ...formulaDraftById,
        [fertilizer.id]: updated?.formula ?? nextFormula,
      };
      editingFertilizerId = editingFertilizerId === fertilizer.id ? null : editingFertilizerId;
      fertilizerMessageById = {
        ...fertilizerMessageById,
        [fertilizer.id]: "Verified. Parsed elements refreshed from backend.",
      };
      statusMessage = null;
    } catch (error) {
      if (error instanceof nscalc.InvalidArgument) {
        fertilizerErrorById = {
          ...fertilizerErrorById,
          [fertilizer.id]: error.msg,
        };
      } else if (error instanceof nscalc.PermissionViolation) {
        fertilizerErrorById = {
          ...fertilizerErrorById,
          [fertilizer.id]: error.msg || "You can only edit your own fertilizers.",
        };
      } else {
        fertilizerErrorById = {
          ...fertilizerErrorById,
          [fertilizer.id]: error instanceof Error ? error.message : "Failed to verify fertilizer formula.",
        };
      }
      fertilizerMessageById = {
        ...fertilizerMessageById,
        [fertilizer.id]: null,
      };
    } finally {
      fertilizerBusyById = {
        ...fertilizerBusyById,
        [fertilizer.id]: false,
      };
    }
  }

  async function deleteFertilizer(fertilizer: FertilizerCardData): Promise<void> {
    if (!currentUser) {
      errorMessage = "Log in again before deleting fertilizers.";
      return;
    }
    if (!window.confirm(`Delete fertilizer \"${fertilizer.name}\"?`)) {
      return;
    }

    fertilizerBusyById = {
      ...fertilizerBusyById,
      [fertilizer.id]: true,
    };
    fertilizerErrorById = {
      ...fertilizerErrorById,
      [fertilizer.id]: null,
    };
    errorMessage = null;
    statusMessage = null;

    try {
      await currentUser.DeleteFertilizer(fertilizer.id);
      invalidateFertilizersCatalogCache();
      await refreshVisibleFertilizers();
      editingFertilizerId = editingFertilizerId === fertilizer.id ? null : editingFertilizerId;
      statusMessage = "Fertilizer deleted.";
    } catch (error) {
      if (error instanceof nscalc.PermissionViolation) {
        errorMessage = error.msg || "You can only delete your own fertilizers.";
      } else {
        errorMessage = error instanceof Error ? error.message : "Failed to delete fertilizer.";
      }
    } finally {
      fertilizerBusyById = {
        ...fertilizerBusyById,
        [fertilizer.id]: false,
      };
    }
  }

  async function createFertilizer(): Promise<void> {
    if (!currentUser) {
      createError = "Log in before creating fertilizers.";
      return;
    }

    const nextName = createName.trim();
    const nextFormula = createFormula.trim();
    if (!nextName) {
      createError = "Enter a fertilizer name.";
      return;
    }
    if (!nextFormula) {
      createError = "Enter a formula before creating the fertilizer.";
      return;
    }

    createBusy = true;
    createError = null;
    createMessage = "Creating fertilizer...";
    statusMessage = null;

    try {
      await currentUser.AddFertilizer(nextName, nextFormula);
      invalidateFertilizersCatalogCache();
      await refreshVisibleFertilizers();
      createName = "";
      createFormula = "";
      createPanelOpen = false;
      createMessage = "Fertilizer created.";
      statusMessage = null;
    } catch (error) {
      if (error instanceof nscalc.InvalidArgument) {
        createError = error.msg;
      } else {
        createError = error instanceof Error ? error.message : "Failed to create fertilizer.";
      }
      createMessage = null;
    } finally {
      createBusy = false;
    }
  }

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

  <div class="rounded-[1.75rem] border border-white/10 bg-black/10 p-4 sm:p-5">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/75">Create fertilizer</p>
        <p class="mt-1 text-sm text-ocean-100/70">Add a new product by name and let the backend formula parser populate the card.</p>
      </div>
      <div class="flex items-center gap-3">
        {#if !currentUser}
          <p class="text-sm text-ocean-100/65">Log in to create or edit your own fertilizers.</p>
        {/if}
        <button type="button" class="touch-target rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60" onclick={toggleCreatePanel} disabled={!currentUser || createBusy}>
          {createPanelOpen ? "Hide form" : "New fertilizer"}
        </button>
      </div>
    </div>

    {#if createMessage}
      <p class="mt-4 rounded-2xl border border-emerald-200/20 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">{createMessage}</p>
    {/if}

    {#if createPanelOpen}
      <div class="mt-4 grid gap-3">
        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
          Fertilizer name
          <input bind:value={createName} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30 disabled:opacity-60" placeholder="Calcium nitrate stock" disabled={!currentUser || createBusy} />
        </label>

        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
          Formula
          <textarea bind:value={createFormula} class="min-h-28 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm font-normal normal-case tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30 disabled:opacity-60" placeholder="bottle := A; formula Ca(NO3)2 * 4H2O purity 99.8;" disabled={!currentUser || createBusy}></textarea>
        </label>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void createFertilizer()} disabled={!currentUser || createBusy}>
            {createBusy ? "Creating..." : "Create fertilizer"}
          </button>
        </div>

        {#if createError}
          <p class="rounded-2xl border border-rose-200/20 bg-rose-950/20 px-3 py-2 text-sm text-rose-100">{createError}</p>
        {/if}
      </div>
    {/if}
  </div>

  {#if errorMessage}
    <div class="rounded-[1.75rem] border border-rose-200/20 bg-rose-950/20 px-4 py-4 text-sm text-rose-100">{errorMessage}</div>
  {:else if statusMessage}
    <div class="rounded-[1.75rem] border border-emerald-200/20 bg-emerald-950/20 px-4 py-4 text-sm text-emerald-100">{statusMessage}</div>
  {/if}

  {#if loadingInitial}
    <div class="rounded-[1.75rem] border border-white/10 bg-black/10 px-4 py-10 text-sm text-ocean-100/75">Loading fertilizers from the RPC catalog...</div>
  {:else if filteredFertilizers.length === 0}
    <div class="rounded-[1.75rem] border border-white/10 bg-black/10 px-4 py-10 text-sm text-ocean-100/75">No fertilizers match the current search.</div>
  {:else}
    <Virtual
      items={filteredFertilizers}
      itemHeight={500}
      minColumnWidth={280}
      gap={18}
      autoMeasure={true}
      frameClass="h-[62vh] rounded-[1.75rem] border border-white/10 bg-black/10"
      viewportClass="h-full p-3 sm:p-4"
      getKey={(fertilizer) => (fertilizer as FertilizerCardData).id}
    >
      {#snippet children(fertilizer)}
        <article class={`hairline h-full rounded-[1.75rem] border p-4 ${fertilizerCardClass(fertilizer.bottle, fertilizer.formula)}`}>
          <div class="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
            <div class="min-w-0">
              <p class="text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/75">Product card</p>
              <h3 class="mt-1 text-lg font-semibold text-white">{fertilizer.name}</h3>
              <p class="mt-1 text-sm text-ocean-100/70">by {fertilizer.author}</p>
            </div>
            <div class="flex flex-col items-end gap-2">
              <span class={`rounded-full border px-3 py-1 text-xs font-medium ${bottleBadgeClass(fertilizer.bottle, fertilizer.formula)}`}>{bottleLabel(fertilizer.bottle, fertilizer.formula)}</span>
              <span class="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-white">${fertilizer.cost}</span>
            </div>
          </div>

          <div class="mt-4 rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-ocean-300/70">Formula</p>
            <p class="mt-2 wrap-break-word font-mono text-xs leading-6 text-ocean-50/80">{fertilizer.formula || "No formula saved."}</p>
          </div>

          {#if canEditFertilizer(fertilizer)}
            <div class="mt-4 rounded-2xl border border-white/10 bg-black/15 px-3 py-3">
              <div class="flex items-center justify-between gap-3">
                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-ocean-300/70">Formula editor</p>
                <div class="flex flex-wrap gap-2">
                  {#if editingFertilizerId === fertilizer.id}
                    <button type="button" class="touch-target rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-medium text-ocean-50 transition hover:bg-white/10" onclick={() => cancelEdit(fertilizer)} disabled={fertilizerBusyById[fertilizer.id] ?? false}>
                      Close
                    </button>
                  {:else}
                    <button type="button" class="touch-target rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-medium text-ocean-50 transition hover:bg-white/10" onclick={() => beginEdit(fertilizer)} disabled={fertilizerBusyById[fertilizer.id] ?? false}>
                      Edit formula
                    </button>
                  {/if}
                  <button type="button" class="touch-target rounded-2xl border border-rose-300/25 bg-rose-950/20 px-3 text-xs font-medium text-rose-100 transition hover:bg-rose-950/35 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void deleteFertilizer(fertilizer)} disabled={fertilizerBusyById[fertilizer.id] ?? false}>
                    Delete
                  </button>
                </div>
              </div>

              {#if editingFertilizerId !== fertilizer.id && fertilizerMessageById[fertilizer.id]}
                <p class="mt-3 rounded-2xl border border-emerald-200/20 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">{fertilizerMessageById[fertilizer.id]}</p>
              {/if}

              {#if editingFertilizerId === fertilizer.id}
                <label class="mt-3 flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ocean-200/70">
                  Backend parsed formula
                  <textarea
                    class="min-h-26 rounded-2xl border border-white/10 bg-black/20 px-3 py-3 font-mono text-xs normal-case tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30"
                    value={formulaDraftFor(fertilizer)}
                    oninput={(event) => updateFormulaDraft(fertilizer.id, (event.currentTarget as HTMLTextAreaElement).value)}
                    placeholder="formula Ca(NO3)2*4H2O"
                    disabled={fertilizerBusyById[fertilizer.id] ?? false}
                  ></textarea>
                </label>

                <div class="mt-3 flex flex-wrap gap-2">
                  <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void verifyFertilizer(fertilizer)} disabled={fertilizerBusyById[fertilizer.id] ?? false}>
                    {fertilizerBusyById[fertilizer.id] ? "Verifying..." : "Verify"}
                  </button>
                  <button type="button" class="touch-target rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => updateFormulaDraft(fertilizer.id, fertilizer.formula)} disabled={fertilizerBusyById[fertilizer.id] ?? false}>
                    Reset
                  </button>
                </div>

                {#if fertilizerErrorById[fertilizer.id]}
                  <p class="mt-3 rounded-2xl border border-rose-200/20 bg-rose-950/20 px-3 py-2 text-sm text-rose-100">{fertilizerErrorById[fertilizer.id]}</p>
                {/if}
              {/if}
            </div>
          {/if}

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