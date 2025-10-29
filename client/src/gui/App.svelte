<svelte:options accessors/>

<svelte:head>
	<link rel="stylesheet" href="style/svelte-material-ui/bare.css" />
</svelte:head>

<script lang="ts">
  import Banner from 'gui/misc/Banner.svelte'
  import Footer from 'gui/misc/Footer.svelte'
  import { fade } from 'svelte/transition'
  import { onMount, onDestroy } from 'svelte'
  import { init as init_mouse, handleResize } from 'mouse/main'

  export let content: HTMLDivElement;

  let user_made_a_bad_decision = false;

  let canvas: HTMLCanvasElement;
  let resizeTimeout: number;

  const updateCanvasSize = () => {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    // Debounce resize to avoid excessive reinitialization
    if (resizeTimeout) {
      clearTimeout(resizeTimeout);
    }

    resizeTimeout = window.setTimeout(async () => {
      await handleResize(newWidth, newHeight);
    }, 250); // Wait 250ms after last resize event
  };

  onMount(() => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init_mouse(canvas);

    // Listen for window resize
    window.addEventListener('resize', updateCanvasSize);
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
    z-index: 100;
  }
</style>

<div>
  <canvas class="overflow" bind:this={canvas} width="800" height="600"></canvas>
  {#if !user_made_a_bad_decision}
  <div transition:fade="{{duration: 5000}}">
    <div bind:this={content} />
    <Footer />
  </div>
  {/if}
  <Banner bind:user_made_a_bad_decision={user_made_a_bad_decision}/>
</div>