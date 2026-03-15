<script lang="ts" generics="T">
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

  type Props = {
    items?: T[];
    itemHeight?: number;
    gap?: number;
    minColumnWidth?: number;
    overscan?: number;
    viewportClass?: string;
    getKey?: (item: T, index: number) => string | number;
    children: Snippet<[T, number]>;
  };

  let {
    items = [],
    itemHeight = 320,
    gap = 16,
    minColumnWidth = 320,
    overscan = 2,
    viewportClass = "",
    getKey,
    children,
  }: Props = $props();

  let viewport: HTMLDivElement | null = null;
  let viewportHeight = $state(0);
  let viewportWidth = $state(0);
  let scrollTop = $state(0);

  const columns = $derived(Math.max(1, Math.floor((viewportWidth + gap) / (minColumnWidth + gap))));
  const totalRows = $derived(Math.ceil(items.length / columns));
  const rowStride = $derived(itemHeight + gap);
  const totalHeight = $derived(totalRows > 0 ? totalRows * itemHeight + Math.max(0, totalRows - 1) * gap : 0);
  const startRow = $derived(Math.max(0, Math.floor(scrollTop / rowStride) - overscan));
  const visibleRows = $derived(Math.max(1, Math.ceil(viewportHeight / rowStride) + overscan * 2));
  const endRow = $derived(Math.min(totalRows, startRow + visibleRows));
  const startIndex = $derived(startRow * columns);
  const endIndex = $derived(Math.min(items.length, endRow * columns));
  const offsetY = $derived(startRow * rowStride);
  const visibleItems = $derived(items.slice(startIndex, endIndex));

  function syncMetrics() {
    if (!viewport) return;
    viewportHeight = viewport.clientHeight;
    viewportWidth = viewport.clientWidth;
    scrollTop = viewport.scrollTop;
  }

  onMount(() => {
    syncMetrics();

    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(() => syncMetrics());
    observer.observe(viewport);
    window.addEventListener("resize", syncMetrics);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncMetrics);
    };
  });
</script>

<div bind:this={viewport} class={`overflow-auto overscroll-contain ${viewportClass}`} onscroll={syncMetrics}>
  {#if items.length === 0}
    <div class="grid min-h-[18rem] place-items-center rounded-[1.75rem] border border-dashed border-white/15 bg-black/10 p-8 text-center text-sm text-ocean-100/65">
      No items match the current filters.
    </div>
  {:else}
    <div class="relative" style={`height: ${totalHeight}px;`}>
      <div
        class="absolute inset-x-0 top-0 grid"
        style={`transform: translateY(${offsetY}px); grid-template-columns: repeat(${columns}, minmax(0, 1fr)); gap: ${gap}px;`}
      >
        {#each visibleItems as item, localIndex (getKey ? getKey(item, startIndex + localIndex) : startIndex + localIndex)}
          <div style={`min-height: ${itemHeight}px;`}>
            {@render children(item, startIndex + localIndex)}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
