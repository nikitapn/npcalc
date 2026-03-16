<script lang="ts">
  import { onMount } from "svelte";
  import type { Fertilizer as RpcFertilizer, Solution as RpcSolution } from "@rpc/nscalc";
  import {
    computeElementsFromDoses,
    computeSolutionEc,
    computeSolutionRatio,
    elementOrder,
    solveRecipe,
    solutionElementsFromRecord,
    type ElementKey,
    type FertilizerInput,
    type SolutionElements,
  } from "../lib/calculatorEngine";
  import { fertilizerCardFromRpc } from "../lib/catalogData";
  import { getNscalcRpc } from "../lib/nscalcRpc";
  import { getCalculatorBootstrapCached, listFertilizersPageCached, listSolutionsPageCached } from "../lib/catalogRpcCache";

  type SelectedFertilizer = {
    fertilizerId: number;
    gramsPerLiter: number;
  };
  type MixMetric = {
    key: ElementKey;
    label: string;
    target: number;
    mixed: number;
    delta: number;
  };

  const featuredElements: ElementKey[] = ["NO3", "NH4", "P", "K", "Ca", "Mg"];
  const traceElements: ElementKey[] = ["S", "Cl", "Fe", "Zn", "B", "Mn", "Cu", "Mo"];

  let selectedSolutionId = $state<number | null>(null);
  let volumeLiters = $state(40);
  let solutionSearch = $state("");
  let fertilizerSearch = $state("");
  let calculatorMode = $state<"auto" | "manual">("auto");
  let solverMessage = $state<string | null>(null);
  let catalogError = $state<string | null>(null);
  let loadingBootstrap = $state(true);
  let loadingSolutionSearch = $state(false);
  let loadingFertilizerSearch = $state(false);
  let loadingMoreSolutions = $state(false);
  let loadingMoreFertilizers = $state(false);
  let nextSolutionCursor = $state<string | null>(null);
  let nextFertilizerCursor = $state<string | null>(null);
  let bootstrapSolutions = $state<RpcSolution[]>([]);
  let bootstrapFertilizers = $state<RpcFertilizer[]>([]);
  let solutionSearchResults = $state<RpcSolution[]>([]);
  let fertilizerSearchResults = $state<RpcFertilizer[]>([]);
  let solutionRequestToken = 0;
  let fertilizerRequestToken = 0;
  let solutionDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  let fertilizerDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  let selectedFertilizers = $state<SelectedFertilizer[]>([]);

  onMount(() => {
    void loadBootstrap();
  });

  $effect(() => {
    solutionSearch;
    if (loadingBootstrap) {
      return;
    }

    if (solutionDebounceHandle) {
      clearTimeout(solutionDebounceHandle);
    }

    const query = solutionSearch.trim();
    if (query.length === 0) {
      solutionSearchResults = [];
      nextSolutionCursor = null;
      loadingSolutionSearch = false;
      return;
    }

    solutionDebounceHandle = setTimeout(() => {
      void searchSolutions(true);
    }, 180);

    return () => {
      if (solutionDebounceHandle) {
        clearTimeout(solutionDebounceHandle);
      }
    };
  });

  $effect(() => {
    fertilizerSearch;
    if (loadingBootstrap) {
      return;
    }

    if (fertilizerDebounceHandle) {
      clearTimeout(fertilizerDebounceHandle);
    }

    const query = fertilizerSearch.trim();
    if (query.length === 0) {
      fertilizerSearchResults = [];
      nextFertilizerCursor = null;
      loadingFertilizerSearch = false;
      return;
    }

    fertilizerDebounceHandle = setTimeout(() => {
      void searchFertilizers(true);
    }, 180);

    return () => {
      if (fertilizerDebounceHandle) {
        clearTimeout(fertilizerDebounceHandle);
      }
    };
  });

  const solutionCatalog = $derived.by(() => dedupeById([...bootstrapSolutions, ...solutionSearchResults]));
  const fertilizerCatalog = $derived.by(() => dedupeById([...bootstrapFertilizers, ...fertilizerSearchResults]));
  const availableSolutions = $derived.by(() => (solutionSearch.trim().length > 0 ? solutionSearchResults : bootstrapSolutions));
  const availableFertilizers = $derived.by(() => (fertilizerSearch.trim().length > 0 ? fertilizerSearchResults : bootstrapFertilizers));
  const selectedSolution = $derived.by(() => {
    if (selectedSolutionId !== null) {
      const match = solutionCatalog.find((solution) => solution.id === selectedSolutionId);
      if (match) {
        return match;
      }
    }
    return availableSolutions[0] ?? null;
  });
  const solutionSelectOptions = $derived.by(() => {
    const seed = selectedSolution ? [selectedSolution, ...availableSolutions] : availableSolutions;
    return dedupeById(seed);
  });
  const fertilizerCards = $derived.by(() => availableFertilizers.map(fertilizerCardFromRpc));

  const selectedFertilizerRows = $derived.by(() => {
    return selectedFertilizers
      .map((entry) => {
        const fertilizer = fertilizerCatalog.find((item) => item.id === entry.fertilizerId);
        if (!fertilizer) {
          return null;
        }

        return {
          ...entry,
          fertilizer,
          fertilizerCard: fertilizerCardFromRpc(fertilizer),
          totalGrams: entry.gramsPerLiter * volumeLiters,
          estimatedCost: entry.gramsPerLiter * volumeLiters * fertilizer.cost,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  });

  const selectedSolutionElements = $derived.by<SolutionElements>(() => {
    return solutionElementsFromRecord({
      NO3: selectedSolution?.elements[0] ?? 0,
      NH4: selectedSolution?.elements[1] ?? 0,
      P: selectedSolution?.elements[2] ?? 0,
      K: selectedSolution?.elements[3] ?? 0,
      Ca: selectedSolution?.elements[4] ?? 0,
      Mg: selectedSolution?.elements[5] ?? 0,
      S: selectedSolution?.elements[6] ?? 0,
      Cl: selectedSolution?.elements[7] ?? 0,
      Fe: selectedSolution?.elements[8] ?? 0,
      Zn: selectedSolution?.elements[9] ?? 0,
      B: selectedSolution?.elements[10] ?? 0,
      Mn: selectedSolution?.elements[11] ?? 0,
      Cu: selectedSolution?.elements[12] ?? 0,
      Mo: selectedSolution?.elements[13] ?? 0,
    });
  });

  const selectedFertilizerInputs = $derived.by<FertilizerInput[]>(() => {
    return selectedFertilizerRows.map((row) => ({
      id: row.fertilizer.id,
      name: row.fertilizer.name,
      cost: row.fertilizer.cost,
      elements: {
        NO3: row.fertilizer.elements[0] ?? 0,
        NH4: row.fertilizer.elements[1] ?? 0,
        P: row.fertilizer.elements[2] ?? 0,
        K: row.fertilizer.elements[3] ?? 0,
        Ca: row.fertilizer.elements[4] ?? 0,
        Mg: row.fertilizer.elements[5] ?? 0,
        S: row.fertilizer.elements[6] ?? 0,
      },
    }));
  });

  const mixedElements = $derived.by<SolutionElements>(() => {
    return computeElementsFromDoses(selectedFertilizerInputs, selectedFertilizerRows.map((row) => row.gramsPerLiter));
  });

  const targetRatio = $derived.by(() => computeSolutionRatio(selectedSolutionElements));
  const mixRatio = $derived.by(() => computeSolutionRatio(mixedElements));
  const targetEc = $derived.by(() => computeSolutionEc(selectedSolutionElements));
  const mixEc = $derived.by(() => computeSolutionEc(mixedElements));

  const mixMetrics = $derived.by<MixMetric[]>(() => {
    return elementOrder.map((key) => {
      const target = selectedSolutionElements[key] ?? 0;
      const mixed = mixedElements[key] ?? 0;
      return {
        key,
        label: key,
        target,
        mixed,
        delta: mixed - target,
      };
    });
  });

  const targetTotal = $derived.by(() => mixMetrics.reduce((sum, metric) => sum + metric.target, 0));
  const mixedTotal = $derived.by(() => mixMetrics.reduce((sum, metric) => sum + metric.mixed, 0));
  const estimatedEc = $derived.by(() => mixEc.ec);
  const estimatedCost = $derived.by(() => selectedFertilizerRows.reduce((sum, row) => sum + row.estimatedCost, 0));
  const doseSummary = $derived.by(() => selectedFertilizerRows.reduce((sum, row) => sum + row.gramsPerLiter, 0));
  const solverResidual = $derived.by(() => Math.sqrt(mixMetrics.reduce((sum, metric) => sum + metric.delta * metric.delta, 0)));

  function setSelectedSolution(id: number): void {
    selectedSolutionId = id;
    solveSelectedDoses();
  }

  function toggleFertilizer(fertilizerId: number): void {
    const existing = selectedFertilizers.find((entry) => entry.fertilizerId === fertilizerId);
    if (existing) {
      selectedFertilizers = selectedFertilizers.filter((entry) => entry.fertilizerId !== fertilizerId);
      solveSelectedDoses();
      return;
    }

    selectedFertilizers = [
      ...selectedFertilizers,
      { fertilizerId, gramsPerLiter: suggestedDoseFor(fertilizerId) },
    ];
    solveSelectedDoses();
  }

  function updateDose(fertilizerId: number, gramsPerLiterText: string): void {
    const gramsPerLiter = Number.parseFloat(gramsPerLiterText);
    calculatorMode = "manual";
    solverMessage = "Manual tweak mode. Use Auto-solve doses to return to the engine output.";
    selectedFertilizers = selectedFertilizers.map((entry) => {
      if (entry.fertilizerId !== fertilizerId) {
        return entry;
      }
      return {
        ...entry,
        gramsPerLiter: Number.isFinite(gramsPerLiter) && gramsPerLiter >= 0 ? gramsPerLiter : 0,
      };
    });
  }

  function solveSelectedDoses(): void {
    if (!selectedSolution) {
      solverMessage = "Load a solution target before solving doses.";
      return;
    }

    if (selectedFertilizerRows.length === 0) {
      calculatorMode = "auto";
      solverMessage = "Pick fertilizers to let the engine solve the dose set.";
      return;
    }

    const solveResult = solveRecipe(selectedSolutionElements, selectedFertilizerInputs);
    selectedFertilizers = selectedFertilizerRows.map((row, index) => ({
      fertilizerId: row.fertilizer.id,
      gramsPerLiter: roundDose(solveResult.doses[index] ?? 0),
    }));
    calculatorMode = "auto";
    solverMessage = `Engine solved ${selectedFertilizerRows.length} fertilizer inputs with residual ${solveResult.residual.toFixed(1)}.`;
  }

  function suggestedDoseFor(fertilizerId: number): number {
    return 0.18 + ((fertilizerId * 13) % 7) * 0.08;
  }

  function isSelected(fertilizerId: number): boolean {
    return selectedFertilizers.some((entry) => entry.fertilizerId === fertilizerId);
  }

  function metricTone(delta: number): string {
    const absDelta = Math.abs(delta);
    if (absDelta < 5) {
      return "text-emerald-200";
    }
    if (absDelta < 20) {
      return "text-sand-100";
    }
    return "text-rose-200";
  }

  function formatPpm(value: number): string {
    return value >= 10 ? value.toFixed(0) : value.toFixed(2);
  }

  function formatMass(value: number): string {
    return value >= 10 ? value.toFixed(0) : value.toFixed(2);
  }

  function formatMoney(value: number): string {
    return `$${value.toFixed(2)}`;
  }

  function formatRatio(value: number): string {
    return value === 0 ? "0.00" : value.toFixed(2);
  }

  function roundDose(value: number): number {
    return Math.max(0, Math.round(value * 1000) / 1000);
  }

  async function loadBootstrap(): Promise<void> {
    loadingBootstrap = true;
    catalogError = null;

    try {
      const bootstrap = await getCalculatorBootstrapCached(8, 12);
      bootstrapSolutions = bootstrap.solutions;
      bootstrapFertilizers = bootstrap.fertilizers;

      if (selectedSolutionId === null && bootstrapSolutions[0]) {
        selectedSolutionId = bootstrapSolutions[0].id;
      }

      if (selectedFertilizers.length === 0) {
        const defaultDoses = [0.72, 0.34, 0.28];
        selectedFertilizers = bootstrapFertilizers.slice(0, 3).map((fertilizer, index) => ({
          fertilizerId: fertilizer.id,
          gramsPerLiter: defaultDoses[index] ?? suggestedDoseFor(fertilizer.id),
        }));
      }

      queueMicrotask(() => solveSelectedDoses());
    } catch (error) {
      catalogError = error instanceof Error ? error.message : "Failed to load calculator bootstrap data.";
      solverMessage = "Calculator catalog data could not be loaded from the RPC backend.";
    } finally {
      loadingBootstrap = false;
    }
  }

  async function searchSolutions(reset: boolean): Promise<void> {
    const query = solutionSearch.trim();
    if (!query) {
      solutionSearchResults = [];
      nextSolutionCursor = null;
      return;
    }

    const requestId = ++solutionRequestToken;
    if (reset) {
      loadingSolutionSearch = true;
    } else {
      loadingMoreSolutions = true;
    }

    try {
      const page = await listSolutionsPageCached(query, "", reset ? "" : (nextSolutionCursor ?? ""), 12);
      if (requestId !== solutionRequestToken) {
        return;
      }

      const items = page.items;
      solutionSearchResults = reset ? items : dedupeById([...solutionSearchResults, ...items]);
      nextSolutionCursor = page.nextCursor;
    } catch (error) {
      if (requestId !== solutionRequestToken) {
        return;
      }
      catalogError = error instanceof Error ? error.message : "Failed to search solutions.";
    } finally {
      if (requestId === solutionRequestToken) {
        loadingSolutionSearch = false;
        loadingMoreSolutions = false;
      }
    }
  }

  async function searchFertilizers(reset: boolean): Promise<void> {
    const query = fertilizerSearch.trim();
    if (!query) {
      fertilizerSearchResults = [];
      nextFertilizerCursor = null;
      return;
    }

    const requestId = ++fertilizerRequestToken;
    if (reset) {
      loadingFertilizerSearch = true;
    } else {
      loadingMoreFertilizers = true;
    }

    try {
      const page = await listFertilizersPageCached(query, reset ? "" : (nextFertilizerCursor ?? ""), 24);
      if (requestId !== fertilizerRequestToken) {
        return;
      }

      const items = page.items;
      fertilizerSearchResults = reset ? items : dedupeById([...fertilizerSearchResults, ...items]);
      nextFertilizerCursor = page.nextCursor;
    } catch (error) {
      if (requestId !== fertilizerRequestToken) {
        return;
      }
      catalogError = error instanceof Error ? error.message : "Failed to search fertilizers.";
    } finally {
      if (requestId === fertilizerRequestToken) {
        loadingFertilizerSearch = false;
        loadingMoreFertilizers = false;
      }
    }
  }

  function dedupeById<T extends { id: number }>(items: T[]): T[] {
    const seen = new Set<number>();
    const result: T[] = [];

    for (const item of items) {
      if (seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      result.push(item);
    }

    return result;
  }
</script>

<section class="space-y-5">
  <div class="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
    <div class="max-w-3xl">
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Calculator cockpit</p>
      <h2 class="mt-2 text-2xl font-semibold text-white sm:text-3xl">Build a recipe from target solution numbers instead of staring at migration notes.</h2>
      <p class="mt-3 text-sm leading-6 text-ocean-100/80">The calculator now boots from frequently used solutions and fertilizers fetched over RPC, then expands into cursor-paged search when you need something outside the default shelf.</p>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      <div class="rounded-3xl border border-white/10 bg-black/20 px-4 py-3">
        <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Target NH4 %</p>
        <p class="mt-2 text-2xl font-semibold text-white">{targetRatio.nh4Percent.toFixed(1)}</p>
      </div>
      <div class="rounded-3xl border border-white/10 bg-black/20 px-4 py-3">
        <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Mix NH4 %</p>
        <p class="mt-2 text-2xl font-semibold text-white">{mixRatio.nh4Percent.toFixed(1)}</p>
      </div>
      <div class="rounded-3xl border border-white/10 bg-black/20 px-4 py-3">
        <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Mix EC</p>
        <p class="mt-2 text-2xl font-semibold text-white">{estimatedEc.toFixed(2)}</p>
      </div>
      <div class="rounded-3xl border border-white/10 bg-black/20 px-4 py-3">
        <p class="text-xs uppercase tracking-[0.22em] text-ocean-300/70">Residual</p>
        <p class="mt-2 text-2xl font-semibold text-white">{solverResidual.toFixed(1)}</p>
      </div>
    </div>
  </div>

  <div class="grid gap-4 2xl:grid-cols-[22rem_minmax(0,1fr)]">
    <aside class="space-y-4">
      <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Target recipe</p>
        <label class="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Search solutions
          <input bind:value={solutionSearch} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="Tomato, basil, cucumber..." />
        </label>
        <label class="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Solution preset
          <select value={selectedSolutionId ?? ""} onchange={(event) => setSelectedSolution(Number((event.currentTarget as HTMLSelectElement).value))} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" disabled={loadingBootstrap || solutionSelectOptions.length === 0}>
            {#if solutionSelectOptions.length === 0}
              <option value="">{loadingBootstrap ? "Loading solutions..." : "No solutions found"}</option>
            {/if}
            {#each solutionSelectOptions as solution}
              <option value={solution.id}>{solution.name}</option>
            {/each}
          </select>
        </label>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-ocean-100/70">
          <span class="rounded-full bg-black/20 px-3 py-1.5">{solutionSearch.trim().length > 0 ? "Search mode" : "Most-used defaults"}</span>
          {#if loadingSolutionSearch}
            <span class="rounded-full bg-black/20 px-3 py-1.5">Searching...</span>
          {/if}
        </div>
        {#if solutionSearch.trim().length > 0}
          <div class="mt-3">
            <button type="button" class="touch-target w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void searchSolutions(false)} disabled={!nextSolutionCursor || loadingMoreSolutions}>
              {loadingMoreSolutions ? "Loading more solutions..." : nextSolutionCursor ? "Load more solution matches" : "No more solution matches"}
            </button>
          </div>
        {/if}
        <label class="mt-3 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Tank volume
          <input bind:value={volumeLiters} type="number" min="1" step="1" class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" />
        </label>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
          {#each featuredElements as key}
            <div class="rounded-3xl bg-black/18 px-4 py-3">
              <p class="text-xs uppercase tracking-[0.18em] text-ocean-300/70">{key}</p>
              <p class="mt-2 text-lg font-semibold text-white">{formatPpm(selectedSolutionElements[key] ?? 0)} ppm</p>
            </div>
          {/each}
        </div>

        <details class="mt-4 rounded-3xl border border-white/10 bg-black/14 px-4 py-3 text-ocean-100/78">
          <summary class="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.2em] text-ocean-300/80">
            Secondary + micronutrients
          </summary>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
            {#each traceElements as key}
              <div class="rounded-3xl bg-black/18 px-4 py-3">
                <p class="text-xs uppercase tracking-[0.18em] text-ocean-300/70">{key}</p>
                <p class="mt-2 text-lg font-semibold text-white">{formatPpm(selectedSolutionElements[key] ?? 0)} ppm</p>
              </div>
            {/each}
          </div>
        </details>
      </section>

      <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Fertilizer library</p>
        <label class="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Search
          <input bind:value={fertilizerSearch} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="Calcium, sulfate, blend..." />
        </label>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-ocean-100/70">
          <span class="rounded-full bg-black/20 px-3 py-1.5">{fertilizerSearch.trim().length > 0 ? "Search results" : "Most-used defaults"}</span>
          {#if loadingFertilizerSearch}
            <span class="rounded-full bg-black/20 px-3 py-1.5">Searching...</span>
          {/if}
        </div>
        <div class="mt-4 max-h-112 space-y-3 overflow-y-auto pr-1">
          {#each fertilizerCards as fertilizer}
            <button type="button" class={`w-full rounded-[1.4rem] border px-4 py-4 text-left transition ${isSelected(fertilizer.id) ? 'border-sand-200/35 bg-white/8' : 'border-white/10 bg-black/18 hover:bg-white/6'}`} onclick={() => toggleFertilizer(fertilizer.id)}>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-white">{fertilizer.name}</p>
                  <p class="mt-1 text-xs uppercase tracking-[0.16em] text-ocean-200/60">{fertilizer.author}</p>
                </div>
                <span class="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ocean-100/75">{isSelected(fertilizer.id) ? 'Selected' : formatMoney(Number.parseFloat(fertilizer.cost))}</span>
              </div>
            </button>
          {/each}
        </div>
        {#if fertilizerSearch.trim().length > 0}
          <div class="mt-3">
            <button type="button" class="touch-target w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void searchFertilizers(false)} disabled={!nextFertilizerCursor || loadingMoreFertilizers}>
              {loadingMoreFertilizers ? "Loading more fertilizers..." : nextFertilizerCursor ? "Load more fertilizer matches" : "No more fertilizer matches"}
            </button>
          </div>
        {/if}
      </section>
    </aside>

    <div class="space-y-4">
      <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5 sm:p-6">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Selected fertilizers</p>
            <p class="mt-2 text-sm leading-6 text-ocean-100/75">The engine solves a non-negative dose set against the selected target. You can still override grams per liter manually after solving.</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <div class="rounded-3xl bg-black/20 px-4 py-3 text-sm text-ocean-100/80">{selectedFertilizerRows.length} inputs active</div>
            <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={solveSelectedDoses} disabled={selectedFertilizerRows.length === 0}>Auto-solve doses</button>
          </div>
        </div>

        {#if solverMessage}
          <div class="mt-4 rounded-3xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-ocean-100/80">{solverMessage}</div>
        {/if}

        {#if catalogError}
          <div class="mt-4 rounded-3xl border border-rose-200/20 bg-rose-950/20 px-4 py-3 text-sm text-rose-100">{catalogError}</div>
        {/if}

        {#if selectedFertilizerRows.length === 0}
          <div class="mt-4 rounded-[1.4rem] border border-white/10 bg-black/18 px-4 py-5 text-sm text-ocean-100/70">Pick at least one fertilizer from the library to start dosing.</div>
        {:else}
          <div class="mt-4 space-y-3">
            {#each selectedFertilizerRows as row}
              <div class="grid gap-3 rounded-[1.4rem] border border-white/10 bg-black/18 p-4 sm:grid-cols-2 2xl:grid-cols-[minmax(0,1.2fr)_8rem_9rem_8rem] 2xl:items-end">
                <div class="min-w-0 sm:col-span-2 2xl:col-span-1">
                  <p class="wrap-break-word font-semibold text-white">{row.fertilizer.name}</p>
                  <p class="mt-1 wrap-break-word text-xs uppercase tracking-[0.16em] text-ocean-200/60">{row.fertilizer.userName} • {calculatorMode === "auto" ? "engine" : "manual"}</p>
                </div>
                <label class="min-w-0 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ocean-200/70">
                  g / L
                  <input type="number" min="0" step="0.01" value={row.gramsPerLiter} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" oninput={(event) => updateDose(row.fertilizer.id, (event.currentTarget as HTMLInputElement).value)} />
                </label>
                <div class="min-w-0 rounded-2xl bg-black/20 px-4 py-3 text-sm text-ocean-100/80">
                  <p class="text-xs uppercase tracking-[0.16em] text-ocean-200/60">Tank mass</p>
                  <p class="mt-1 font-semibold text-white">{formatMass(row.totalGrams)} g</p>
                </div>
                <div class="min-w-0 rounded-2xl bg-black/20 px-4 py-3 text-sm text-ocean-100/80">
                  <p class="text-xs uppercase tracking-[0.16em] text-ocean-200/60">Cost</p>
                  <p class="mt-1 font-semibold text-white">{formatMoney(row.estimatedCost)}</p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5 sm:p-6">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Target vs mix</p>
            <p class="mt-2 text-sm leading-6 text-ocean-100/75">This uses the real client-side engine against RPC-backed target and fertilizer data: frequently used defaults load first, and search expands into the paged catalog only when needed.</p>
          </div>
          <div class="rounded-3xl bg-black/20 px-4 py-3 text-sm text-ocean-100/80">Target EC {targetEc.ec.toFixed(2)} • Mix EC {mixEc.ec.toFixed(2)} • N:K {formatRatio(mixRatio.nk)}</div>
        </div>

        <div class="mt-4 overflow-x-auto">
          <table class="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr class="text-left text-xs uppercase tracking-[0.18em] text-ocean-200/60">
                <th class="px-3 py-2">Element</th>
                <th class="px-3 py-2">Target</th>
                <th class="px-3 py-2">Mix</th>
                <th class="px-3 py-2">Delta</th>
              </tr>
            </thead>
            <tbody>
              {#each mixMetrics as metric}
                <tr class="rounded-2xl bg-black/18 text-ocean-100/80">
                  <td class="rounded-l-2xl px-3 py-3 font-semibold text-white">{metric.label}</td>
                  <td class="px-3 py-3">{formatPpm(metric.target)}</td>
                  <td class="px-3 py-3">{formatPpm(metric.mixed)}</td>
                  <td class={`rounded-r-2xl px-3 py-3 font-semibold ${metricTone(metric.delta)}`}>{metric.delta >= 0 ? '+' : ''}{formatPpm(metric.delta)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-3">
          <div class="rounded-3xl bg-black/18 px-4 py-4">
            <p class="text-xs uppercase tracking-[0.18em] text-ocean-300/70">Total target</p>
            <p class="mt-2 text-2xl font-semibold text-white">{formatPpm(targetTotal)}</p>
          </div>
          <div class="rounded-3xl bg-black/18 px-4 py-4">
            <p class="text-xs uppercase tracking-[0.18em] text-ocean-300/70">Total mixed</p>
            <p class="mt-2 text-2xl font-semibold text-white">{formatPpm(mixedTotal)}</p>
          </div>
          <div class="rounded-3xl bg-black/18 px-4 py-4">
            <p class="text-xs uppercase tracking-[0.18em] text-ocean-300/70">Delta</p>
            <p class={`mt-2 text-2xl font-semibold ${metricTone(mixedTotal - targetTotal)}`}>{mixedTotal - targetTotal >= 0 ? '+' : ''}{formatPpm(mixedTotal - targetTotal)}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</section>
