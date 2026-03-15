<script lang="ts">
  import Solution from "./Solution.svelte";
  import Virtual from "./Virtual.svelte";
  import { mockSolutions, type SolutionCardData } from "../lib/mockData";

  let search = $state("");
  let author = $state("all");

  const authors = Array.from(new Set(mockSolutions.map((solution: SolutionCardData) => solution.author)));
  const filteredSolutions = $derived.by(() => {
    const query = search.trim().toLowerCase();

    return mockSolutions.filter((solution: SolutionCardData) => {
      const matchesName = query.length === 0 || solution.name.toLowerCase().includes(query);
      const matchesAuthor = author === "all" || solution.author === author;
      return matchesName && matchesAuthor;
    });
  });
</script>

<section class="space-y-5">
  <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Solution library</p>
      <h2 class="mt-2 text-2xl font-semibold text-white sm:text-3xl">Scroll comfortably on phones without losing density on desktop.</h2>
    </div>
    <div class="flex flex-wrap items-center gap-3 text-sm text-ocean-100/75">
      <span class="rounded-full bg-white/6 px-3 py-1.5">{filteredSolutions.length} visible</span>
      <span class="rounded-full bg-white/6 px-3 py-1.5">{mockSolutions.length} total</span>
    </div>
  </div>

  <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
    <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
      Search by name
      <input bind:value={search} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" placeholder="Calcium, cucumber, bloom..." />
    </label>

    <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-ocean-300/80">
      Author
      <select bind:value={author} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm font-normal tracking-normal text-white outline-none transition focus:border-ocean-300 focus:bg-black/30">
        <option value="all">All authors</option>
        {#each authors as authorName}
          <option value={authorName}>{authorName}</option>
        {/each}
      </select>
    </label>
  </div>

  <Virtual
    items={filteredSolutions}
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
</section>
