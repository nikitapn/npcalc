<script lang="ts">
  import * as nscalc from "@rpc/nscalc";
  import { onMount } from "svelte";
  import Solution from "./Solution.svelte";
  import Virtual from "./Virtual.svelte";
  import { elementOrder, type ElementKey } from "../lib/calculatorEngine";
  import { solutionCardFromRpc, type SolutionCardData } from "../lib/catalogData";
  import { invalidateSolutionsCatalogCache, listSolutionsPageCached } from "../lib/catalogRpcCache";
  import { getSolutionsViewState, setSolutionsViewState } from "../lib/catalogViewState";

  type Props = {
    currentUserName?: string | null;
    currentUser?: nscalc.RegisteredUser | null;
  };

  let { currentUserName = null, currentUser = null }: Props = $props();

  const initialState = getSolutionsViewState();

  let search = $state(initialState.search);
  let author = $state(initialState.author);
  let solutions = $state<SolutionCardData[]>(initialState.items);
  let nextCursor = $state<string | null>(initialState.nextCursor);
  let loadingInitial = $state(!initialState.ready);
  let loadingMore = $state(false);
  let errorMessage = $state<string | null>(null);
  let statusMessage = $state<string | null>(null);
  let activeRequest = 0;
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  let filtersInitialized = false;
  let editingSolutionId = $state<number | null>(null);
  let solutionNameDraftById = $state<Record<number, string>>({});
  let solutionElementDraftById = $state<Record<number, Record<ElementKey, string>>>({});
  let solutionBusyById = $state<Record<number, boolean>>({});
  let solutionErrorById = $state<Record<number, string | null>>({});
  let solutionMessageById = $state<Record<number, string | null>>({});
  let createPanelOpen = $state(false);
  let createName = $state("");
  let createElementDraft = $state(makeElementDraft());
  let createBusy = $state(false);
  let createError = $state<string | null>(null);
  let createMessage = $state<string | null>(null);

  onMount(() => {
    if (!initialState.ready) {
      void reloadSolutions();
    }
  });

  $effect(() => {
    search;
    author;

    if (!filtersInitialized) {
      filtersInitialized = true;
      return;
    }

    if (debounceHandle) {
      clearTimeout(debounceHandle);
    }
    debounceHandle = setTimeout(() => {
      statusMessage = null;
      void reloadSolutions();
    }, 180);

    return () => {
      if (debounceHandle) {
        clearTimeout(debounceHandle);
      }
    };
  });

  $effect(() => {
    setSolutionsViewState({
      ready: !loadingInitial,
      search,
      author,
      items: solutions,
      nextCursor,
    });
  });

  const visibleSolutions = $derived(solutions);

  function makeElementDraft(values?: Partial<Record<ElementKey, number>>): Record<ElementKey, string> {
    return Object.fromEntries(elementOrder.map((key) => [key, formatDraftValue(values?.[key] ?? 0)])) as Record<ElementKey, string>;
  }

  function formatDraftValue(value: number): string {
    return String(value);
  }

  function toggleCreatePanel(): void {
    createPanelOpen = !createPanelOpen;
  }

  function canEditSolution(solution: SolutionCardData): boolean {
    return Boolean(currentUser && currentUserName && currentUserName === solution.author);
  }

  function solutionNameDraftFor(solution: SolutionCardData): string {
    return solutionNameDraftById[solution.id] ?? solution.name;
  }

  function solutionElementDraftFor(solution: SolutionCardData): Record<ElementKey, string> {
    return solutionElementDraftById[solution.id] ?? makeElementDraft(solution.rawElements);
  }

  function beginEdit(solution: SolutionCardData): void {
    editingSolutionId = solution.id;
    solutionNameDraftById = {
      ...solutionNameDraftById,
      [solution.id]: solution.name,
    };
    solutionElementDraftById = {
      ...solutionElementDraftById,
      [solution.id]: makeElementDraft(solution.rawElements),
    };
    solutionErrorById = {
      ...solutionErrorById,
      [solution.id]: null,
    };
    solutionMessageById = {
      ...solutionMessageById,
      [solution.id]: null,
    };
    statusMessage = null;
  }

  function cancelEdit(solution: SolutionCardData): void {
    editingSolutionId = editingSolutionId === solution.id ? null : editingSolutionId;
    solutionNameDraftById = {
      ...solutionNameDraftById,
      [solution.id]: solution.name,
    };
    solutionElementDraftById = {
      ...solutionElementDraftById,
      [solution.id]: makeElementDraft(solution.rawElements),
    };
    solutionErrorById = {
      ...solutionErrorById,
      [solution.id]: null,
    };
    solutionMessageById = {
      ...solutionMessageById,
      [solution.id]: null,
    };
  }

  function updateSolutionNameDraft(id: number, value: string): void {
    solutionNameDraftById = {
      ...solutionNameDraftById,
      [id]: value,
    };
    solutionErrorById = {
      ...solutionErrorById,
      [id]: null,
    };
    solutionMessageById = {
      ...solutionMessageById,
      [id]: null,
    };
  }

  function updateSolutionElementDraft(id: number, key: ElementKey, value: string): void {
    solutionElementDraftById = {
      ...solutionElementDraftById,
      [id]: {
        ...solutionElementDraftFor(solutions.find((solution) => solution.id === id) ?? visibleSolutions[0]),
        [key]: value,
      },
    };
    solutionErrorById = {
      ...solutionErrorById,
      [id]: null,
    };
    solutionMessageById = {
      ...solutionMessageById,
      [id]: null,
    };
  }

  function updateCreateElementDraft(key: ElementKey, value: string): void {
    createElementDraft = {
      ...createElementDraft,
      [key]: value,
    };
    createError = null;
    createMessage = null;
    statusMessage = null;
  }

  function parseElementDraft(draft: Record<ElementKey, string>): Record<ElementKey, number> {
    const result = {} as Record<ElementKey, number>;
    for (const key of elementOrder) {
      const raw = draft[key]?.trim() ?? "";
      const parsed = raw === "" ? 0 : Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid ${key} value.`);
      }
      result[key] = parsed;
    }
    return result;
  }

  function toSolutionElementPayload(values: Record<ElementKey, number>): nscalc.SolutionElement[] {
    return elementOrder.map((key, index) => ({ index, value: values[key] ?? 0 }));
  }

  function toFloat64Array(values: Record<ElementKey, number>): Float64Array {
    return new Float64Array(elementOrder.map((key) => values[key] ?? 0));
  }

  async function refreshVisibleSolutions(): Promise<SolutionCardData[]> {
    const page = await listSolutionsPageCached(search.trim(), author.trim(), "", Math.max(solutions.length, 24));
    const refreshed = page.items.map(solutionCardFromRpc);
    solutions = refreshed;
    nextCursor = page.nextCursor;
    return refreshed;
  }

  async function saveSolution(solution: SolutionCardData): Promise<void> {
    if (!currentUser) {
      solutionErrorById = {
        ...solutionErrorById,
        [solution.id]: "Log in again before editing solutions.",
      };
      return;
    }

    const nextName = solutionNameDraftFor(solution).trim();
    if (!nextName) {
      solutionErrorById = {
        ...solutionErrorById,
        [solution.id]: "Enter a solution name.",
      };
      return;
    }

    let parsedElements: Record<ElementKey, number>;
    try {
      parsedElements = parseElementDraft(solutionElementDraftFor(solution));
    } catch (error) {
      solutionErrorById = {
        ...solutionErrorById,
        [solution.id]: error instanceof Error ? error.message : "Invalid solution elements.",
      };
      return;
    }

    solutionBusyById = {
      ...solutionBusyById,
      [solution.id]: true,
    };
    solutionErrorById = {
      ...solutionErrorById,
      [solution.id]: null,
    };
    solutionMessageById = {
      ...solutionMessageById,
      [solution.id]: "Saving solution...",
    };

    try {
      await currentUser.SetSolutionName(solution.id, nextName);
      await currentUser.SetSolutionElements(solution.id, toSolutionElementPayload(parsedElements));
      invalidateSolutionsCatalogCache();
      const refreshed = await refreshVisibleSolutions();
      const updated = refreshed.find((item) => item.id === solution.id);
      if (updated) {
        solutionNameDraftById = {
          ...solutionNameDraftById,
          [solution.id]: updated.name,
        };
        solutionElementDraftById = {
          ...solutionElementDraftById,
          [solution.id]: makeElementDraft(updated.rawElements),
        };
      }
      editingSolutionId = editingSolutionId === solution.id ? null : editingSolutionId;
      solutionMessageById = {
        ...solutionMessageById,
        [solution.id]: "Solution saved.",
      };
      statusMessage = null;
    } catch (error) {
      if (error instanceof nscalc.PermissionViolation) {
        solutionErrorById = {
          ...solutionErrorById,
          [solution.id]: error.msg || "You can only edit your own solutions.",
        };
      } else {
        solutionErrorById = {
          ...solutionErrorById,
          [solution.id]: error instanceof Error ? error.message : "Failed to save solution.",
        };
      }
      solutionMessageById = {
        ...solutionMessageById,
        [solution.id]: null,
      };
    } finally {
      solutionBusyById = {
        ...solutionBusyById,
        [solution.id]: false,
      };
    }
  }

  async function deleteSolution(solution: SolutionCardData): Promise<void> {
    if (!currentUser) {
      errorMessage = "Log in again before deleting solutions.";
      return;
    }
    if (!window.confirm(`Delete solution \"${solution.name}\"?`)) {
      return;
    }

    solutionBusyById = {
      ...solutionBusyById,
      [solution.id]: true,
    };
    solutionErrorById = {
      ...solutionErrorById,
      [solution.id]: null,
    };
    errorMessage = null;
    statusMessage = null;

    try {
      await currentUser.DeleteSolution(solution.id);
      invalidateSolutionsCatalogCache();
      await refreshVisibleSolutions();
      editingSolutionId = editingSolutionId === solution.id ? null : editingSolutionId;
      statusMessage = "Solution deleted.";
    } catch (error) {
      if (error instanceof nscalc.PermissionViolation) {
        errorMessage = error.msg || "You can only delete your own solutions.";
      } else {
        errorMessage = error instanceof Error ? error.message : "Failed to delete solution.";
      }
    } finally {
      solutionBusyById = {
        ...solutionBusyById,
        [solution.id]: false,
      };
    }
  }

  async function createSolution(): Promise<void> {
    if (!currentUser) {
      createError = "Log in before creating solutions.";
      return;
    }

    const nextName = createName.trim();
    if (!nextName) {
      createError = "Enter a solution name.";
      return;
    }

    let parsedElements: Record<ElementKey, number>;
    try {
      parsedElements = parseElementDraft(createElementDraft);
    } catch (error) {
      createError = error instanceof Error ? error.message : "Invalid solution elements.";
      return;
    }

    createBusy = true;
    createError = null;
    createMessage = "Creating solution...";
    statusMessage = null;

    try {
      await currentUser.AddSolution(nextName, toFloat64Array(parsedElements));
      invalidateSolutionsCatalogCache();
      await refreshVisibleSolutions();
      createName = "";
      createElementDraft = makeElementDraft();
      createPanelOpen = false;
      createMessage = "Solution created.";
      statusMessage = null;
    } catch (error) {
      createError = error instanceof Error ? error.message : "Failed to create solution.";
      createMessage = null;
    } finally {
      createBusy = false;
    }
  }

  async function reloadSolutions(): Promise<void> {
    const requestId = ++activeRequest;
    loadingInitial = true;
    errorMessage = null;

    try {
      const page = await listSolutionsPageCached(search.trim(), author.trim(), "", 24);
      if (requestId !== activeRequest) {
        return;
      }
      solutions = page.items.map(solutionCardFromRpc);
      nextCursor = page.nextCursor;
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
      const page = await listSolutionsPageCached(search.trim(), author.trim(), nextCursor, 24);
      if (requestId !== activeRequest) {
        return;
      }
      solutions = [...solutions, ...page.items.map(solutionCardFromRpc)];
      nextCursor = page.nextCursor;
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

  <div class="rounded-[1.75rem] border border-white/10 bg-black/10 p-4 sm:p-5">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/75">Create solution</p>
        <p class="mt-1 text-sm text-ocean-100/70">Build a new solution card directly from the shelf and save it to the backend.</p>
      </div>
      <div class="flex items-center gap-3">
        {#if !currentUser}
          <p class="text-sm text-ocean-100/65">Log in to create or edit your own solutions.</p>
        {/if}
        <button type="button" class="touch-target rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-60" onclick={toggleCreatePanel} disabled={!currentUser || createBusy}>
          {createPanelOpen ? "Hide form" : "New solution"}
        </button>
      </div>
    </div>

    {#if createMessage}
      <p class="mt-4 rounded-2xl border border-emerald-200/20 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">{createMessage}</p>
    {/if}

    {#if createPanelOpen}
      <div class="mt-4 grid gap-3">
        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
          Solution name
          <input bind:value={createName} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30 disabled:opacity-60" placeholder="Bloom target week 3" disabled={!currentUser || createBusy} />
        </label>

        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/75">Elements</p>
          <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {#each elementOrder as key}
              <label class="flex flex-col gap-1 rounded-2xl bg-black/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-100/65">
                {key}
                <input class="touch-target rounded-xl border border-white/10 bg-black/20 px-2 py-1 text-sm font-normal normal-case tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30 disabled:opacity-60" type="number" min="0" step="0.01" value={createElementDraft[key]} oninput={(event) => updateCreateElementDraft(key, (event.currentTarget as HTMLInputElement).value)} disabled={!currentUser || createBusy} />
              </label>
            {/each}
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void createSolution()} disabled={!currentUser || createBusy}>
            {createBusy ? "Creating..." : "Create solution"}
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
    <div class="rounded-[1.75rem] border border-white/10 bg-black/10 px-4 py-10 text-sm text-ocean-100/75">Loading solutions from the RPC catalog...</div>
  {:else if visibleSolutions.length === 0}
    <div class="rounded-[1.75rem] border border-white/10 bg-black/10 px-4 py-10 text-sm text-ocean-100/75">No solutions match the current filters.</div>
  {:else}
    <Virtual
      items={visibleSolutions}
      itemHeight={640}
      minColumnWidth={320}
      gap={18}
      autoMeasure={true}
      frameClass="h-[68vh] rounded-[1.75rem] border border-white/10 bg-black/10"
      viewportClass="h-full p-3 sm:p-4"
      getKey={(solution) => (solution as SolutionCardData).id}
    >
      {#snippet children(solution, index)}
        <Solution
          {solution}
          {index}
          canEdit={canEditSolution(solution)}
          isEditing={editingSolutionId === solution.id}
          draftName={solutionNameDraftFor(solution)}
          draftElements={solutionElementDraftFor(solution)}
          busy={solutionBusyById[solution.id] ?? false}
          errorMessage={solutionErrorById[solution.id] ?? null}
          successMessage={solutionMessageById[solution.id] ?? null}
          onBeginEdit={() => beginEdit(solution)}
          onCancelEdit={() => cancelEdit(solution)}
          onDelete={() => void deleteSolution(solution)}
          onNameInput={(value) => updateSolutionNameDraft(solution.id, value)}
          onElementInput={(key, value) => updateSolutionElementDraft(solution.id, key, value)}
          onSave={() => void saveSolution(solution)}
        />
      {/snippet}
    </Virtual>

    <div class="flex justify-center pt-1">
      <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void loadMoreSolutions()} disabled={!nextCursor || loadingMore}>
        {loadingMore ? "Loading more..." : nextCursor ? "Load more solutions" : "All solutions loaded"}
      </button>
    </div>
  {/if}
</section>
