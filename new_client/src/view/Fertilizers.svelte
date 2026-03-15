<script lang="ts">
  import Virtual from "./Virtual.svelte";
  import { mockFertilizers, type FertilizerCardData } from "../lib/mockData";

  let search = $state("");

  const filteredFertilizers = $derived.by(() => {
    const query = search.trim().toLowerCase();
    return mockFertilizers.filter((fertilizer: FertilizerCardData) => query.length === 0 || fertilizer.name.toLowerCase().includes(query));
  });
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

  <Virtual
    items={filteredFertilizers}
    itemHeight={250}
    minColumnWidth={280}
    gap={18}
    viewportClass="h-[62vh] rounded-[1.75rem] border border-white/10 bg-black/10 p-3 sm:p-4"
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
</section>