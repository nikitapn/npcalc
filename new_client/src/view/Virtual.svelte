<script lang="ts" generics="T">
  import { onMount, tick } from "svelte";
  import type { Snippet } from "svelte";

  type Props = {
    items?: T[];
    itemHeight?: number;
    gap?: number;
    minColumnWidth?: number;
    overscan?: number;
    autoMeasure?: boolean;
    frameClass?: string;
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
    autoMeasure = false,
    frameClass = "",
    viewportClass = "",
    getKey,
    children,
  }: Props = $props();

  let viewport: HTMLDivElement | null = null;
  let viewportHeight = $state(0);
  let viewportWidth = $state(0);
  let scrollTop = $state(0);
  let measuredItemHeight = $state<number | null>(null);
  let scrollFrame = 0;

  const columns = $derived(Math.max(1, Math.floor((viewportWidth + gap) / (minColumnWidth + gap))));
  const effectiveItemHeight = $derived(autoMeasure ? Math.max(itemHeight, measuredItemHeight ?? 0) : itemHeight);
  const totalRows = $derived(Math.ceil(items.length / columns));
  const rowStride = $derived(effectiveItemHeight + gap);
  const totalHeight = $derived(totalRows > 0 ? totalRows * effectiveItemHeight + Math.max(0, totalRows - 1) * gap : 0);
  const startRow = $derived(Math.max(0, Math.floor(scrollTop / rowStride) - overscan));
  const visibleRows = $derived(Math.max(1, Math.ceil(viewportHeight / rowStride) + overscan * 2));
  const endRow = $derived(Math.min(totalRows, startRow + visibleRows));
  const startIndex = $derived(startRow * columns);
  const endIndex = $derived(Math.min(items.length, endRow * columns));
  const offsetY = $derived(startRow * rowStride);
  const visibleItems = $derived(items.slice(startIndex, endIndex));

  function syncViewportSize() {
    if (!viewport) return;
    viewportHeight = viewport.clientHeight;
    viewportWidth = viewport.clientWidth;
  }

  function syncScrollPosition() {
    if (!viewport) return;
    scrollTop = viewport.scrollTop;
  }

  function handleScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      syncScrollPosition();
    });
  }

  async function measureItemHeight() {
    if (!autoMeasure || !viewport || items.length === 0) {
      return;
    }

    await tick();

    const firstItem = viewport.querySelector<HTMLElement>("[data-virtual-item]");
    if (!firstItem) {
      return;
    }

    const nextHeight = Math.ceil(firstItem.getBoundingClientRect().height);
    if (nextHeight > 0 && nextHeight !== measuredItemHeight) {
      measuredItemHeight = nextHeight;
    }
  }

  $effect(() => {
    if (!autoMeasure) {
      return;
    }

    columns;
    startIndex;
    endIndex;
    viewportWidth;
    viewportHeight;
    void measureItemHeight();
  });

  onMount(() => {
    syncViewportSize();
    syncScrollPosition();
    void measureItemHeight();

    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncViewportSize();
      void measureItemHeight();
    });
    observer.observe(viewport);
    window.addEventListener("resize", syncViewportSize);

    return () => {
      if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
      }
      observer.disconnect();
      window.removeEventListener("resize", syncViewportSize);
    };
  });
</script>

<div class={`overflow-hidden ${frameClass}`}>
  <div bind:this={viewport} class={`h-full overflow-auto overscroll-contain ${viewportClass}`} onscroll={handleScroll}>
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
            <div data-virtual-item style={`min-height: ${effectiveItemHeight}px;`}>
              {@render children(item, startIndex + localIndex)}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
