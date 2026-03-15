<script lang="ts">
  import type { SolutionCardData } from "../lib/mockData";

  const { solution, index } = $props<{ solution: SolutionCardData; index: number }>();

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
</script>

<article class="panel-surface hairline h-full rounded-[1.75rem] p-4 sm:p-5">
  <div class="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
    <div class="min-w-0">
      <p class="text-[0.7rem] font-semibold uppercase tracking-[0.25em] text-ocean-300/80">Solution #{index + 1}</p>
      <h3 class="mt-1 truncate text-lg font-semibold text-white">{solution.name}</h3>
      <p class="mt-1 text-sm text-ocean-100/70">by {solution.author}</p>
    </div>
    <span class="rounded-full border border-sand-200/25 bg-sand-200/10 px-3 py-1 text-xs font-medium text-sand-100">Live target</span>
  </div>

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


