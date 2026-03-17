<script lang="ts">
  import * as NPRPC from "nprpc";
  import * as nscalc from "@rpc/nscalc";
  import { onMount } from "svelte";
  import type { Calculation as RpcCalculation, Fertilizer as RpcFertilizer, Solution as RpcSolution } from "@rpc/nscalc";
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
  import { buildCalculatorReport, saveCalculatorReportPdf } from "../lib/calculatorPdf";
  import { fertilizerCardFromRpc } from "../lib/catalogData";
  import { getNscalcRpc } from "../lib/nscalcRpc";
  import { getCalculatorBootstrapCached, listFertilizersPageCached, listSolutionsPageCached } from "../lib/catalogRpcCache";

  type Props = {
    currentUser?: nscalc.RegisteredUser | null;
  };

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

  let { currentUser = null }: Props = $props();

  let calculationName = $state("New Calculation");
  let activeCalculationId = $state<number | null>(null);
  let savedCalculations = $state<RpcCalculation[]>([]);
  let loadingCalculations = $state(false);
  let savingCalculation = $state(false);
  let deletingCalculation = $state(false);
  let calculationError = $state<string | null>(null);
  let calculationMessage = $state<string | null>(null);
  let selectedSolutionId = $state<number | null>(null);
  let targetElements = $state<SolutionElements>(createEmptySolutionElements());
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
  let exportBusy = $state(false);
  let matrixEditMode = $state(false);
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
  let calculationsHydrated = false;

  onMount(() => {
    void loadBootstrap();
  });

  $effect(() => {
    currentUser;
    if (loadingBootstrap) {
      return;
    }

    void loadCalculations();
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
  const selectedFertilizerIdSet = $derived.by(() => new Set(selectedFertilizers.map((entry) => entry.fertilizerId)));
  const combinedFertilizerList = $derived.by(() => {
    const remaining = availableFertilizers.filter((fertilizer) => !selectedFertilizerIdSet.has(fertilizer.id));
    return {
      selected: selectedFertilizerRows,
      remaining,
    };
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

  const targetRatio = $derived.by(() => computeSolutionRatio(targetElements));
  const mixRatio = $derived.by(() => computeSolutionRatio(mixedElements));
  const targetEc = $derived.by(() => computeSolutionEc(targetElements));
  const mixEc = $derived.by(() => computeSolutionEc(mixedElements));
  const activeCalculationSelectValue = $derived.by(() => (activeCalculationId === null ? "" : String(activeCalculationId)));

  const mixMetrics = $derived.by<MixMetric[]>(() => {
    return elementOrder.map((key) => {
      const target = targetElements[key] ?? 0;
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
  const matrixRows = $derived.by(() => {
    return selectedFertilizerRows.map((row) => ({
      id: row.fertilizer.id,
      name: row.fertilizer.name,
      contributions: Object.fromEntries(
        elementOrder.map((key, index) => [key, (row.fertilizer.elements[index] ?? 0) * row.gramsPerLiter]),
      ) as Record<ElementKey, number>,
      totalGrams: row.totalGrams,
    }));
  });

  function setSelectedSolution(id: number): void {
    selectedSolutionId = id;
    const match = solutionCatalog.find((solution) => solution.id === id);
    if (match) {
      targetElements = solutionElementsFromRpcSolution(match);
    }
    solveSelectedDoses();
  }

  function createEmptySolutionElements(): SolutionElements {
    return Object.fromEntries(elementOrder.map((key) => [key, 0])) as SolutionElements;
  }

  function solutionElementsFromRpcSolution(solution: RpcSolution): SolutionElements {
    return solutionElementsFromRecord({
      NO3: solution.elements[0] ?? 0,
      NH4: solution.elements[1] ?? 0,
      P: solution.elements[2] ?? 0,
      K: solution.elements[3] ?? 0,
      Ca: solution.elements[4] ?? 0,
      Mg: solution.elements[5] ?? 0,
      S: solution.elements[6] ?? 0,
      Cl: solution.elements[7] ?? 0,
      Fe: solution.elements[8] ?? 0,
      Zn: solution.elements[9] ?? 0,
      B: solution.elements[10] ?? 0,
      Mn: solution.elements[11] ?? 0,
      Cu: solution.elements[12] ?? 0,
      Mo: solution.elements[13] ?? 0,
    });
  }

  function createCalculationName(): string {
    return selectedSolution?.name ?? "New Calculation";
  }

  function resetDraftCalculation(): void {
    activeCalculationId = null;
    calculationName = createCalculationName();
    targetElements = selectedSolution ? solutionElementsFromRpcSolution(selectedSolution) : createEmptySolutionElements();
    volumeLiters = 40;
    selectedFertilizers = [];
    calculatorMode = "auto";
    solverMessage = "Pick fertilizers to let the engine solve the dose set.";
    calculationError = null;
    calculationMessage = currentUser ? "New calculation draft ready." : "Guest calculations are read-only. Sign in to save your own draft.";
  }

  function parseStoredElements(elementsJSON: string): SolutionElements {
    try {
      const tuples = JSON.parse(elementsJSON) as Array<[number, number, number]>;
      return Object.fromEntries(
        elementOrder.map((key, index) => {
          const tuple = tuples[index];
          return [key, Number.isFinite(tuple?.[1]) ? tuple[1] : Number.isFinite(tuple?.[0]) ? tuple[0] : 0];
        }),
      ) as SolutionElements;
    } catch {
      return createEmptySolutionElements();
    }
  }

  function parseStoredFertilizerIds(idsJSON: string): number[] {
    try {
      const ids = JSON.parse(idsJSON) as number[];
      return ids.filter((id) => Number.isFinite(id));
    } catch {
      return [];
    }
  }

  function sameElements(left: SolutionElements, right: SolutionElements): boolean {
    return elementOrder.every((key) => Math.abs((left[key] ?? 0) - (right[key] ?? 0)) < 0.001);
  }

  function findMatchingSolutionId(elements: SolutionElements): number | null {
    for (const solution of solutionCatalog) {
      if (sameElements(solutionElementsFromRpcSolution(solution), elements)) {
        return solution.id;
      }
    }
    return null;
  }

  function applyCalculation(record: RpcCalculation): void {
    const storedElements = parseStoredElements(record.elements);
    const fertilizerIds = parseStoredFertilizerIds(record.fertilizersIds);

    activeCalculationId = record.id;
    calculationName = record.name || "Saved calculation";
    targetElements = storedElements;
    selectedSolutionId = findMatchingSolutionId(storedElements);
    volumeLiters = Number.isFinite(record.volume) && record.volume > 0 ? record.volume : 40;
    selectedFertilizers = fertilizerIds.map((fertilizerId) => ({ fertilizerId, gramsPerLiter: 0 }));
    calculatorMode = record.mode ? "manual" : "auto";

    queueMicrotask(() => {
      if (fertilizerIds.length > 0) {
        solveSelectedDoses();
        if (record.mode) {
          solverMessage = "Saved calculation restored. Doses were recomputed from the stored fertilizer set.";
        }
      } else {
        solverMessage = "Calculation loaded. Pick fertilizers to solve a new recipe.";
      }
    });
  }

  async function ensureCalculationCatalogCoverage(): Promise<void> {
    if (calculationsHydrated) {
      return;
    }

    const { calculator } = await getNscalcRpc();
    const data = await calculator.http.GetData();
    bootstrapSolutions = dedupeById([...data.solutions, ...bootstrapSolutions]);
    bootstrapFertilizers = dedupeById([...data.fertilizers, ...bootstrapFertilizers]);
    calculationsHydrated = true;
  }

  async function loadCalculations(preferredId?: number | null): Promise<void> {
    loadingCalculations = true;
    calculationError = null;

    try {
      const { calculator } = await getNscalcRpc();
      const calculations = currentUser
        ? await (async () => {
            const calculationsRef = NPRPC.make_ref<RpcCalculation[]>();
            await currentUser.GetMyCalculations(calculationsRef);
            return calculationsRef.value ?? [];
          })()
        : await calculator.http.GetGuestCalculations();

      savedCalculations = calculations;

      if (calculations.length > 0) {
        await ensureCalculationCatalogCoverage();
        const nextId = preferredId ?? activeCalculationId ?? calculations[0]?.id ?? null;
        const selectedCalculation = calculations.find((record) => record.id === nextId) ?? calculations[0];
        if (selectedCalculation) {
          applyCalculation(selectedCalculation);
        }
      } else if (activeCalculationId !== null || calculationName === "New Calculation") {
        resetDraftCalculation();
      }

      calculationMessage = currentUser
        ? calculations.length > 0
          ? `Loaded ${calculations.length} saved calculation${calculations.length === 1 ? "" : "s"}.`
          : "No saved calculations yet."
        : calculations.length > 0
          ? `Loaded ${calculations.length} guest calculation${calculations.length === 1 ? "" : "s"}.`
          : "No guest calculations are available.";
    } catch (error) {
      calculationError = error instanceof Error ? error.message : "Failed to load calculations.";
    } finally {
      loadingCalculations = false;
    }
  }

  function handleCalculationSelection(value: string): void {
    if (!value) {
      resetDraftCalculation();
      return;
    }

    const record = savedCalculations.find((item) => item.id === Number(value));
    if (record) {
      applyCalculation(record);
      calculationMessage = `Loaded ${record.name}.`;
      calculationError = null;
    }
  }

  function serializeCalculation(): RpcCalculation {
    return {
      id: activeCalculationId ?? 0,
      name: calculationName.trim() || createCalculationName(),
      elements: JSON.stringify(elementOrder.map((key) => {
        const value = targetElements[key] ?? 0;
        return [value, value, 0.5];
      })),
      fertilizersIds: JSON.stringify(selectedFertilizers.map((entry) => entry.fertilizerId)),
      volume: volumeLiters,
      mode: calculatorMode === "manual",
    };
  }

  async function saveCalculation(): Promise<void> {
    if (!currentUser) {
      calculationMessage = "Sign in to save calculations.";
      return;
    }

    savingCalculation = true;
    calculationError = null;

    try {
      const savedId = await currentUser.UpdateCalculation(serializeCalculation());
      await loadCalculations(savedId);
      calculationMessage = "Calculation saved.";
    } catch (error) {
      calculationError = error instanceof Error ? error.message : "Failed to save calculation.";
    } finally {
      savingCalculation = false;
    }
  }

  async function deleteCalculation(): Promise<void> {
    if (!currentUser || activeCalculationId === null) {
      calculationMessage = !currentUser ? "Sign in to delete saved calculations." : "Select a saved calculation to delete.";
      return;
    }

    deletingCalculation = true;
    calculationError = null;

    try {
      await currentUser.DeleteCalculation(activeCalculationId);
      activeCalculationId = null;
      await loadCalculations(null);
      calculationMessage = "Calculation deleted.";
    } catch (error) {
      calculationError = error instanceof Error ? error.message : "Failed to delete calculation.";
    } finally {
      deletingCalculation = false;
    }
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

  function unselectFertilizer(fertilizerId: number): void {
    if (!isSelected(fertilizerId)) {
      return;
    }
    toggleFertilizer(fertilizerId);
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

  function updateMass(fertilizerId: number, totalGramsText: string): void {
    const totalGrams = Number.parseFloat(totalGramsText);
    const gramsPerLiter = volumeLiters > 0 ? totalGrams / volumeLiters : 0;
    updateDose(fertilizerId, Number.isFinite(gramsPerLiter) ? String(gramsPerLiter) : "0");
  }

  function solveSelectedDoses(): void {
    if (elementOrder.every((key) => (targetElements[key] ?? 0) === 0)) {
      solverMessage = "Load a solution target before solving doses.";
      return;
    }

    if (selectedFertilizerRows.length === 0) {
      calculatorMode = "auto";
      solverMessage = "Pick fertilizers to let the engine solve the dose set.";
      return;
    }

    const solveResult = solveRecipe(targetElements, selectedFertilizerInputs);
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

  function formatMatrixContribution(value: number): string {
    return value < 0.001 ? "" : value.toFixed(2);
  }

  function roundDose(value: number): number {
    return Math.max(0, Math.round(value * 1000) / 1000);
  }

  async function savePdf(): Promise<void> {
    if (!selectedSolution || selectedFertilizerRows.length === 0) {
      solverMessage = "Pick a target and at least one fertilizer before exporting a PDF.";
      return;
    }

    exportBusy = true;
    try {
      const report = buildCalculatorReport({
        solutionName: calculationName.trim() || selectedSolution?.name || "Custom calculation",
        volumeLiters,
        rows: selectedFertilizerRows.map((row) => ({
          name: row.fertilizer.name,
          bottle: row.fertilizer.bottle,
          type: row.fertilizer.type,
          density: row.fertilizer.density,
          gramsPerLiter: row.gramsPerLiter,
          totalGrams: row.totalGrams,
        })),
        metrics: mixMetrics.map((metric) => ({
          key: metric.key,
          target: metric.target,
          mixed: metric.mixed,
          delta: metric.delta,
        })),
        totalTarget: targetTotal,
        totalMixed: mixedTotal,
        ratio: mixRatio,
        estimatedCost,
      });
      await saveCalculatorReportPdf(report, `${(calculationName.trim() || selectedSolution?.name || "custom-calculation").replace(/\s+/g, "-")}-recipe.pdf`);
      solverMessage = "PDF report downloaded.";
    } catch (error) {
      solverMessage = error instanceof Error ? error.message : "Failed to generate PDF report.";
    } finally {
      exportBusy = false;
    }
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
        targetElements = solutionElementsFromRpcSolution(bootstrapSolutions[0]);
      }

      if (selectedFertilizers.length === 0 && activeCalculationId === null) {
        const defaultDoses = [0.72, 0.34, 0.28];
        selectedFertilizers = bootstrapFertilizers.slice(0, 3).map((fertilizer, index) => ({
          fertilizerId: fertilizer.id,
          gramsPerLiter: defaultDoses[index] ?? suggestedDoseFor(fertilizer.id),
        }));
      }

      if (selectedFertilizers.length > 0) {
        queueMicrotask(() => solveSelectedDoses());
      }
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

  <div class="grid gap-4 2xl:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)] 2xl:items-start">
    <aside class="space-y-4">
      <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Calculations</p>
        <label class="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Calculation name
          <input bind:value={calculationName} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="New Calculation" />
        </label>
        <label class="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Saved calculations
          <select value={activeCalculationSelectValue} onchange={(event) => handleCalculationSelection((event.currentTarget as HTMLSelectElement).value)} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" disabled={loadingCalculations}>
            <option value="">{currentUser ? "Unsaved draft" : "Guest calculation or draft"}</option>
            {#each savedCalculations as calculation}
              <option value={calculation.id}>{calculation.name}</option>
            {/each}
          </select>
        </label>
        <div class="mt-4 flex flex-wrap gap-3">
          <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10" onclick={resetDraftCalculation}>New</button>
          <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void saveCalculation()} disabled={!currentUser || savingCalculation || loadingCalculations}>{savingCalculation ? "Saving..." : "Save"}</button>
          <button type="button" class="touch-target rounded-2xl border border-rose-200/20 bg-rose-950/20 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void deleteCalculation()} disabled={!currentUser || activeCalculationId === null || deletingCalculation || loadingCalculations}>{deletingCalculation ? "Deleting..." : "Delete"}</button>
        </div>
        <div class="mt-3 space-y-2 text-sm">
          {#if loadingCalculations}
            <p class="text-ocean-100/70">Loading calculations...</p>
          {:else if !currentUser}
            <p class="text-ocean-100/70">Guest calculations are loaded from the server. Sign in to save or delete your own calculations.</p>
          {/if}
          {#if calculationMessage}
            <p class="text-ocean-100/80">{calculationMessage}</p>
          {/if}
          {#if calculationError}
            <p class="text-rose-200">{calculationError}</p>
          {/if}
        </div>
      </section>

      <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5">
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Target recipe</p>
        <label class="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Search solutions
          <input bind:value={solutionSearch} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="Tomato, basil, cucumber..." />
        </label>
        <label class="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Solution preset
          <select value={selectedSolutionId ?? ""} onchange={(event) => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            if (!value) {
              selectedSolutionId = null;
              return;
            }
            setSelectedSolution(Number(value));
          }} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" disabled={loadingBootstrap || solutionSelectOptions.length === 0}>
            {#if solutionSelectOptions.length === 0}
              <option value="">{loadingBootstrap ? "Loading solutions..." : "No solutions found"}</option>
            {/if}
            {#if selectedSolutionId === null && solutionSelectOptions.length > 0}
              <option value="">Custom target</option>
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
              <p class="mt-2 text-lg font-semibold text-white">{formatPpm(targetElements[key] ?? 0)} ppm</p>
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
                <p class="mt-2 text-lg font-semibold text-white">{formatPpm(targetElements[key] ?? 0)} ppm</p>
              </div>
            {/each}
          </div>
        </details>
      </section>

    </aside>

    <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,1fr)] 2xl:items-start">
      <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5 sm:p-6 2xl:flex 2xl:max-h-[calc(100vh-10rem)] 2xl:flex-col">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Fertilizers</p>
            <p class="mt-2 text-sm leading-6 text-ocean-100/75">Search the library, select products, and adjust active doses from the same list.</p>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <div class="rounded-3xl bg-black/20 px-4 py-3 text-sm text-ocean-100/80">{selectedFertilizerRows.length} inputs active</div>
            <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void savePdf()} disabled={selectedFertilizerRows.length === 0 || exportBusy}>{exportBusy ? "Saving PDF..." : "Save PDF"}</button>
            <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={solveSelectedDoses} disabled={selectedFertilizerRows.length === 0}>Auto-solve doses</button>
          </div>
        </div>

        <label class="mt-4 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-ocean-200/75">
          Search fertilizers
          <input bind:value={fertilizerSearch} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" placeholder="Calcium, sulfate, blend..." />
        </label>
        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-ocean-100/70">
          <span class="rounded-full bg-black/20 px-3 py-1.5">{fertilizerSearch.trim().length > 0 ? "Search results" : "Most-used defaults"}</span>
          {#if loadingFertilizerSearch}
            <span class="rounded-full bg-black/20 px-3 py-1.5">Searching...</span>
          {/if}
        </div>

        <div class="mt-4 space-y-3 2xl:min-h-0 2xl:flex-1 2xl:overflow-y-auto 2xl:pr-1">
          {#if solverMessage}
            <div class="rounded-3xl border border-white/10 bg-black/18 px-4 py-3 text-sm text-ocean-100/80">{solverMessage}</div>
          {/if}

          {#if catalogError}
            <div class="rounded-3xl border border-rose-200/20 bg-rose-950/20 px-4 py-3 text-sm text-rose-100">{catalogError}</div>
          {/if}

          {#if combinedFertilizerList.selected.length === 0 && combinedFertilizerList.remaining.length === 0}
            <div class="rounded-[1.4rem] border border-white/10 bg-black/18 px-4 py-5 text-sm text-ocean-100/70">No fertilizers match the current query.</div>
          {/if}

          {#each combinedFertilizerList.selected as row}
            <div class="grid gap-3 rounded-[1.4rem] border border-sand-200/35 bg-white/8 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_8rem_auto] xl:items-end">
              <div class="min-w-0 sm:col-span-2 xl:col-span-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="wrap-break-word font-semibold text-white">{row.fertilizer.name}</p>
                  <span class="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ocean-100/75">Selected</span>
                </div>
                <p class="mt-1 wrap-break-word text-xs uppercase tracking-[0.16em] text-ocean-200/60">{row.fertilizer.userName} • {calculatorMode === "auto" ? "engine" : "manual"}</p>
              </div>
              <label class="min-w-0 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ocean-200/70">
                g / L
                <input type="number" min="0" step="0.01" value={row.gramsPerLiter} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none focus:border-ocean-300" oninput={(event) => updateDose(row.fertilizer.id, (event.currentTarget as HTMLInputElement).value)} />
              </label>
              <div class="flex items-end justify-end xl:justify-start">
                <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10" onclick={() => unselectFertilizer(row.fertilizer.id)}>Unselect</button>
              </div>
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

          {#each combinedFertilizerList.remaining as fertilizer}
            <button type="button" class="w-full rounded-[1.4rem] border border-white/10 bg-black/18 px-4 py-4 text-left transition hover:bg-white/6" onclick={() => toggleFertilizer(fertilizer.id)}>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-semibold text-white">{fertilizer.name}</p>
                  <p class="mt-1 text-xs uppercase tracking-[0.16em] text-ocean-200/60">{fertilizer.userName}</p>
                </div>
                <span class="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ocean-100/75">{formatMoney(fertilizer.cost)}</span>
              </div>
            </button>
          {/each}

          {#if fertilizerSearch.trim().length > 0}
            <div>
              <button type="button" class="touch-target w-full rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60" onclick={() => void searchFertilizers(false)} disabled={!nextFertilizerCursor || loadingMoreFertilizers}>
                {loadingMoreFertilizers ? "Loading more fertilizers..." : nextFertilizerCursor ? "Load more fertilizer matches" : "No more fertilizer matches"}
              </button>
            </div>
          {/if}
        </div>
      </section>

      <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5 sm:p-6 2xl:sticky 2xl:top-6">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Target vs mix</p>
            <p class="mt-2 text-sm leading-6 text-ocean-100/75">This uses the real client-side engine against RPC-backed target and fertilizer data: frequently used defaults load first, and search expands into the paged catalog only when needed.</p>
          </div>
          <div class="rounded-3xl bg-black/20 px-4 py-3 text-sm text-ocean-100/80">Target EC {targetEc.ec.toFixed(2)} • Mix EC {mixEc.ec.toFixed(2)} • N:K {formatRatio(mixRatio.nk)}</div>
        </div>

        <div class="mt-4 overflow-auto 2xl:max-h-[52vh]">
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

  <section class="rounded-[1.75rem] border border-white/10 bg-black/12 p-5 sm:p-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Solution matrix</p>
        <p class="mt-2 text-sm leading-6 text-ocean-100/75">Inspect how each selected fertilizer contributes to each nutrient and optionally tweak total grams directly.</p>
      </div>
      <label class="flex items-center gap-3 rounded-3xl bg-black/20 px-4 py-3 text-sm text-ocean-100/80">
        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-ocean-200/70">Edit mass</span>
        <input bind:checked={matrixEditMode} type="checkbox" class="h-4 w-4 accent-sand-200" />
      </label>
    </div>

    {#if matrixRows.length === 0}
      <div class="mt-4 rounded-[1.4rem] border border-white/10 bg-black/18 px-4 py-5 text-sm text-ocean-100/70">Solve or select fertilizers to populate the solution matrix.</div>
    {:else}
      <div class="mt-4 overflow-auto rounded-[1.4rem] border border-white/10 bg-black/12">
        <table class="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr class="bg-white/6 text-left text-xs uppercase tracking-[0.18em] text-ocean-200/70">
              <th class="sticky left-0 z-10 border-b border-white/10 bg-white/6 px-3 py-3">Fertilizer</th>
              {#each elementOrder as key}
                <th class="border-b border-white/10 px-3 py-3 text-right">{key === "NO3" ? "N-NO3" : key === "NH4" ? "N-NH4" : key}</th>
              {/each}
              <th class="border-b border-white/10 px-3 py-3 text-right">Mass (g.)</th>
            </tr>
          </thead>
          <tbody>
            {#each matrixRows as row}
              <tr class="text-ocean-100/80 even:bg-white/4">
                <td class="sticky left-0 z-10 border-b border-white/10 bg-ocean-900 px-3 py-3 font-semibold text-white">{row.name}</td>
                {#each elementOrder as key}
                  <td class="border-b border-white/10 px-3 py-3 text-right tabular-nums">{formatMatrixContribution(row.contributions[key])}</td>
                {/each}
                <td class="border-b border-white/10 px-3 py-2 text-right">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.totalGrams.toFixed(2)}
                    class="w-28 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right text-sm text-white outline-none focus:border-ocean-300 disabled:opacity-70"
                    readonly={!matrixEditMode}
                    oninput={(event) => updateMass(row.id, (event.currentTarget as HTMLInputElement).value)}
                  />
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</section>
