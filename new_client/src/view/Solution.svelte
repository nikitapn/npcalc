<script lang="ts">
  import { elementOrder, type ElementKey } from "../lib/calculatorEngine";
  import type { SolutionCardData } from "../lib/catalogData";

  const {
    solution,
    index,
    canEdit = false,
    isEditing = false,
    draftName = solution.name,
    draftElements,
    busy = false,
    errorMessage = null,
    successMessage = null,
    onBeginEdit = () => {},
    onCancelEdit = () => {},
    onDelete = () => {},
    onNameInput = (_value: string) => {},
    onElementInput = (_key: ElementKey, _value: string) => {},
    onSave = () => {},
  } = $props<{
    solution: SolutionCardData;
    index: number;
    canEdit?: boolean;
    isEditing?: boolean;
    draftName?: string;
    draftElements?: Record<ElementKey, string>;
    busy?: boolean;
    errorMessage?: string | null;
    successMessage?: string | null;
    onBeginEdit?: () => void;
    onCancelEdit?: () => void;
    onDelete?: () => void;
    onNameInput?: (value: string) => void;
    onElementInput?: (key: ElementKey, value: string) => void;
    onSave?: () => void;
  }>();

  const ratios = [
    ["NH4 %", solution.ratios.NH4Percent],
    ["N:K", solution.ratios.NK],
    ["K:Ca", solution.ratios.KCa],
    ["K:Mg", solution.ratios.KMg],
    ["Ca:Mg", solution.ratios.CaMg],
    ["Δ", solution.ratios.delta],
    ["EC", solution.ratios.EC],
  ];

  const elements = Object.entries(solution.elements);
  const editableElements = draftElements ?? Object.fromEntries(elementOrder.map((key) => [key, String(solution.rawElements[key] ?? 0)])) as Record<ElementKey, string>;
</script>

<article class="panel-surface hairline h-full rounded-[1.75rem] p-4 sm:p-5">
  <div class="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
    <div class="min-w-0">
      <p class="text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-ocean-300/80">Solution #{index + 1}</p>
      <h3 class="mt-1 text-lg font-semibold text-white">{solution.name}</h3>
      <p class="mt-1 text-sm text-ocean-100/70">by {solution.author}</p>
    </div>
    <span class="rounded-full border border-sand-200/25 bg-sand-200/10 px-3 py-1 text-xs font-medium text-sand-100">Live target</span>
  </div>

  {#if canEdit}
    <div class="mt-4 rounded-2xl border border-white/10 bg-black/15 px-3 py-3">
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-ocean-300/70">Solution editor</p>
        <div class="flex flex-wrap gap-2">
          {#if isEditing}
            <button type="button" class="touch-target rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-medium text-ocean-50 transition hover:bg-white/10" onclick={onCancelEdit} disabled={busy}>
              Close
            </button>
          {:else}
            <button type="button" class="touch-target rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-medium text-ocean-50 transition hover:bg-white/10" onclick={onBeginEdit} disabled={busy}>
              Edit solution
            </button>
          {/if}
          <button type="button" class="touch-target rounded-2xl border border-rose-300/25 bg-rose-950/20 px-3 text-xs font-medium text-rose-100 transition hover:bg-rose-950/35 disabled:cursor-not-allowed disabled:opacity-60" onclick={onDelete} disabled={busy}>
            Delete
          </button>
        </div>
      </div>

      {#if !isEditing && successMessage}
        <p class="mt-3 rounded-2xl border border-emerald-200/20 bg-emerald-950/20 px-3 py-2 text-sm text-emerald-100">{successMessage}</p>
      {/if}

      {#if isEditing}
        <div class="mt-3 grid gap-3">
          <label class="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ocean-200/70">
            Name
            <input class="touch-target rounded-2xl border border-white/10 bg-black/20 px-3 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" value={draftName} oninput={(event) => onNameInput((event.currentTarget as HTMLInputElement).value)} disabled={busy} />
          </label>

          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-ocean-200/70">Elements</p>
            <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {#each elementOrder as key}
                <label class="flex flex-col gap-1 rounded-2xl bg-black/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ocean-100/65">
                  {key}
                  <input class="touch-target rounded-xl border border-white/10 bg-black/20 px-2 py-1 text-sm font-normal normal-case tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" type="number" min="0" step="0.01" value={editableElements[key]} oninput={(event) => onElementInput(key, (event.currentTarget as HTMLInputElement).value)} disabled={busy} />
                </label>
              {/each}
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100 disabled:cursor-not-allowed disabled:opacity-60" onclick={onSave} disabled={busy}>
              {busy ? "Saving..." : "Save solution"}
            </button>
          </div>

          {#if errorMessage}
            <p class="rounded-2xl border border-rose-200/20 bg-rose-950/20 px-3 py-2 text-sm text-rose-100">{errorMessage}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <div class="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/75">Elements</p>
      <dl class="mt-3 grid grid-cols-2 gap-2 text-sm">
        {#each elements as [name, value]}
          <div class="rounded-2xl bg-black/20 px-3 py-2">
            <dt class="text-ocean-100/65">{name}</dt>
            <dd class="mt-1 text-base font-semibold text-white">{value}</dd>
          </div>
        {/each}
      </dl>
    </div>

    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/75">Ratios</p>
      <dl class="mt-3 grid gap-2 text-sm">
        {#each ratios as [label, value]}
          <div class="flex items-center justify-between rounded-2xl bg-white/6 px-3 py-2.5">
            <dt class="text-ocean-100/70">{label}</dt>
            <dd class="font-semibold text-white">{value}</dd>
          </div>
        {/each}
      </dl>
    </div>
  </div>
</article>


