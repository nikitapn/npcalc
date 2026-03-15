<script lang="ts">
  import Journal from "./view/Journal.svelte";
  import Solutions from "./view/Solutions.svelte";
  import Fertilizers from "./view/Fertilizers.svelte";
  import { mockSolutions, mockFertilizers } from "./lib/mockData";

  type View = "journal" | "calculator" | "solutions" | "fertilizers" | "chat" | "about";

  const navItems: Array<{ id: View; label: string; blurb: string }> = [
    { id: "journal", label: "Journal", blurb: "Capture crop progress as a story feed." },
    { id: "calculator", label: "Calculator", blurb: "Mix recipes fast on touch screens." },
    { id: "solutions", label: "Solutions", blurb: "Browse reusable nutrient targets." },
    { id: "fertilizers", label: "Fertilizers", blurb: "Inspect products and element ratios." },
    { id: "chat", label: "Chat", blurb: "Realtime collaboration can land here." },
    { id: "about", label: "About", blurb: "Project notes and rollout status." },
  ];

  let mobileMenuEnabled = $state(false);
  let currentView = $state<View>("journal");

  function changeView(view: View) {
    mobileMenuEnabled = false;
    currentView = view;
  }

  const activeItem = $derived(navItems.find((item) => item.id === currentView) ?? navItems[0]);
</script>

<svelte:head>
  <title>NScalc Grow Journal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="relative min-h-screen overflow-hidden">
  <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(125,198,255,0.12),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(201,138,53,0.12),transparent_18%)]"></div>

  <header class="sticky top-0 z-20 border-b border-white/10 bg-ocean-900/80 backdrop-blur-xl">
    <div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-2xl">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-ocean-300">NScalc</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">A mobile-first grow journal with nutrient context built in.</h1>
          <p class="mt-3 text-sm leading-6 text-ocean-100/80 sm:text-base">The new shell keeps stories, measurements, and upload status readable on phones first, while leaving room for the calculator and solution library beside it.</p>
        </div>

        <form class="panel-surface hairline grid gap-3 rounded-3xl p-3 sm:grid-cols-2 lg:min-w-[28rem] lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
          <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
            Email
            <input class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" type="email" placeholder="grower@example.com" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
            Password
            <input class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" type="password" placeholder="••••••••" />
          </label>
          <button type="button" class="touch-target rounded-2xl bg-ocean-400 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-ocean-300">Log in</button>
          <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10">Register</button>
        </form>
      </div>

      <div class="mt-5 flex items-center justify-between md:hidden">
        <div>
          <p class="text-xs uppercase tracking-[0.25em] text-ocean-300/80">Current view</p>
          <p class="mt-1 text-lg font-semibold text-white">{activeItem.label}</p>
        </div>
        <button
          type="button"
          class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-medium text-white transition hover:bg-white/10"
          onclick={() => (mobileMenuEnabled = !mobileMenuEnabled)}
        >
          {mobileMenuEnabled ? "Close menu" : "Open menu"}
        </button>
      </div>

      <nav class:mt-5={true} class:hidden={!mobileMenuEnabled} class="hidden md:block">
        <div class="flex gap-2 overflow-x-auto pb-1">
          {#each navItems as item}
            <button
              type="button"
              class={`touch-target shrink-0 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${currentView === item.id ? 'bg-sand-200 text-ocean-950' : 'bg-white/5 text-ocean-50 hover:bg-white/10'}`}
              onclick={() => changeView(item.id)}
            >
              <span class="block font-semibold">{item.label}</span>
              <span class={`mt-1 block text-xs ${currentView === item.id ? 'text-ocean-800/80' : 'text-ocean-100/65'}`}>{item.blurb}</span>
            </button>
          {/each}
        </div>
      </nav>
    </div>
  </header>

  <main class="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
    <section class="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(18rem,0.85fr)]">
      <div class="panel-surface rounded-[2rem] p-4 sm:p-6">
        {#if currentView === "journal"}
          <Journal />
        {:else if currentView === "calculator"}
          <div class="grid gap-6 lg:grid-cols-[1.25fr_0.95fr]">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Calculator cockpit</p>
              <h2 class="mt-2 text-2xl font-semibold text-white sm:text-3xl">Rework the heavy desktop spreadsheet into thumb-friendly panels.</h2>
              <p class="mt-3 max-w-2xl text-sm leading-6 text-ocean-100/80">Primary inputs should become stacked cards, formula sections should collapse on small screens, and the recipe preview should pin below the controls instead of fighting for horizontal space.</p>

              <div class="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-3xl bg-black/20 p-4">
                  <p class="text-xs uppercase tracking-[0.2em] text-ocean-300/70">NH4 %</p>
                  <p class="mt-2 text-3xl font-semibold text-white">7.11</p>
                </div>
                <div class="rounded-3xl bg-black/20 p-4">
                  <p class="text-xs uppercase tracking-[0.2em] text-ocean-300/70">N:K</p>
                  <p class="mt-2 text-3xl font-semibold text-white">0.96</p>
                </div>
                <div class="rounded-3xl bg-black/20 p-4">
                  <p class="text-xs uppercase tracking-[0.2em] text-ocean-300/70">K:Ca</p>
                  <p class="mt-2 text-3xl font-semibold text-white">1.47</p>
                </div>
                <div class="rounded-3xl bg-black/20 p-4">
                  <p class="text-xs uppercase tracking-[0.2em] text-ocean-300/70">EC</p>
                  <p class="mt-2 text-3xl font-semibold text-white">2.38</p>
                </div>
              </div>
            </div>

            <div class="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-sand-200">Migration notes</p>
              <ul class="mt-4 space-y-3 text-sm leading-6 text-ocean-100/80">
                <li>Touch targets should stay above 44px for sliders, toggles, and ingredient selectors.</li>
                <li>Complex nutrient tables should collapse into accordion sections on narrow widths.</li>
                <li>Persistent action buttons should be bottom-aligned on phones to avoid header reach.</li>
              </ul>
            </div>
          </div>
        {:else if currentView === "solutions"}
          <Solutions />
        {:else if currentView === "fertilizers"}
          <Fertilizers />
        {:else if currentView === "chat"}
          <div class="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Realtime shell</p>
              <h2 class="mt-2 text-2xl font-semibold text-white">Chat should feel like messaging, not a spreadsheet sidebar.</h2>
              <p class="mt-3 text-sm leading-6 text-ocean-100/80">A phone-friendly chat view wants a message list, composer pinned to the bottom, and strong separation between collaboration and calculation tools.</p>
            </div>
            <div class="rounded-[1.75rem] border border-white/10 bg-black/20 p-4">
              <div class="space-y-3">
                <div class="ml-auto max-w-[80%] rounded-3xl rounded-br-md bg-ocean-400 px-4 py-3 text-sm text-ocean-950">Stream-based chat is wired on the server, but the new client can use a proper mobile conversation layout.</div>
                <div class="max-w-[82%] rounded-3xl rounded-bl-md bg-white/10 px-4 py-3 text-sm text-ocean-50">Keep the composer sticky, support attachment chips, and treat presence separately from the feed.</div>
              </div>
              <div class="mt-4 flex gap-3">
                <input class="touch-target min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-ocean-300" placeholder="Type a message" />
                <button type="button" class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950">Send</button>
              </div>
            </div>
          </div>
        {:else}
          <div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">About this pass</p>
              <h2 class="mt-2 text-2xl font-semibold text-white">The current work is about layout and interaction reliability.</h2>
              <p class="mt-3 text-sm leading-6 text-ocean-100/80">Tailwind 4 gives you a faster styling loop, Svelte 5 is already in place, and the new virtualized grid is designed around predictable card heights instead of measuring arbitrary HTML after the fact.</p>
            </div>
            <div class="rounded-[1.75rem] border border-white/10 bg-black/20 p-5 text-sm leading-6 text-ocean-100/80">
              <p>The next step after this UI pass is to bind these screens to the NPRPC data model and session flow, while keeping the same mobile-first shell.</p>
            </div>
          </div>
        {/if}
      </div>

      <aside class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <section class="panel-surface rounded-[2rem] p-5">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Data snapshot</p>
          <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-3xl bg-black/20 p-4">
              <p class="text-ocean-100/70">Journal</p>
              <p class="mt-1 text-lg font-semibold text-white">RPC-backed</p>
            </div>
            <div class="rounded-3xl bg-black/20 p-4">
              <p class="text-ocean-100/70">Transport</p>
              <p class="mt-1 text-lg font-semibold text-white">NPRPC</p>
            </div>
            <div class="rounded-3xl bg-black/20 p-4">
              <p class="text-ocean-100/70">Solutions</p>
              <p class="mt-1 text-2xl font-semibold text-white">{mockSolutions.length}</p>
            </div>
            <div class="rounded-3xl bg-black/20 p-4">
              <p class="text-ocean-100/70">Fertilizers</p>
              <p class="mt-1 text-2xl font-semibold text-white">{mockFertilizers.length}</p>
            </div>
          </div>
        </section>

        <section class="panel-surface rounded-[2rem] p-5">
          <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Mobile priorities</p>
          <ol class="mt-4 space-y-3 text-sm leading-6 text-ocean-100/80">
            <li>Keep story context visible while uploads continue in the background.</li>
            <li>Collapse dense control groups into stacked sections.</li>
            <li>Avoid desktop-only hover affordances for core actions.</li>
          </ol>
        </section>
      </aside>
    </section>
  </main>
</div>