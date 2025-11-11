<svelte:options accessors/>

<svelte:head>
	<link rel="stylesheet" href="style/svelte-material-ui/bare.css" />
</svelte:head>

<script lang="ts">
  import Footer from 'gui/misc/Footer.svelte'
  import { onMount, onDestroy } from 'svelte'
  import { init as init_mouse, handleResize, startFireworks } from 'mouse/main'
  import SeizureWarning from 'gui/misc/SeizureWarning.svelte'

  export let content: HTMLDivElement;

  let canvas: HTMLCanvasElement;
  let resizeTimeout: number;
  let showWarning = true;
  let fireworksEnabled = false;
  let showCalculator = false;

  const updateCanvasSize = () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    // Debounce resize to avoid excessive reinitialization
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }

    resizeTimeout = window.setTimeout(async () => {
      if (fireworksEnabled) {
        await handleResize(newWidth, newHeight);
      }
    }, 250); // Wait 250ms after last resize event
  };

  function onProceed(event: CustomEvent) {
    fireworksEnabled = event.detail.withFireworks;
    showWarning = false;
    if (fireworksEnabled) {
      startFireworks();
    } else {
      showCalculator = true;
    }
  }

  onMount(() => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init_mouse(canvas);
    window.addEventListener('resize', updateCanvasSize);

    document.addEventListener('fireworksFinished', () => {
      showCalculator = true;
    });
  });

  onDestroy(() => {
    window.removeEventListener('resize', updateCanvasSize);
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }
  });
  
</script>

<style>
  * :global(.margins) {
    margin: 18px 0 24px;
  }

  * :global(.columns) {
    display: flex;
    flex-wrap: wrap;
  }

  * :global(.columns > *) {
    flex-basis: 0;
    min-width:155px;
    margin-right: 12px;
  }
  * :global(.columns > *:last-child) {
    margin-right: 0;
  }

  * :global(.columns .mdc-text-field),
  * :global(.columns .mdc-text-field + .mdc-text-field-helper-line) {
    width: 218px;
  }

  * :global(.columns .status) {
    width: auto;
    word-break: break-all;
    overflow-wrap: break-word;
  }


  * :global(.rows) {
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
  }

  * :global(.rows > *) {
    flex-basis: 0;
    min-width: 470px;
    min-height: 48px;
    margin-top: 48px;
  }
  
  * :global(.rows > *:last-child) {
    margin-bottom: 0;
  }

  .overflow {
    position: fixed;
    top: 0;
    left: 0;
    pointer-events:none;
    z-index: -1;
  }

  .hidden {
    display: none;
  }
</style>

<div>
  <canvas class="overflow" bind:this={canvas}></canvas>
  {#if showWarning}
    <SeizureWarning on:proceed={onProceed} />
  {/if}
  <div class:hidden={!showCalculator}>
    <div bind:this={content} />
    <Footer />
  </div>
</div>