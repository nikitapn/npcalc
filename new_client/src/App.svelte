<script lang="ts">
  import { onMount } from "svelte";
  import Calculator from "./view/Calculator.svelte";
  import Journal from "./view/Journal.svelte";
  import Solutions from "./view/Solutions.svelte";
  import Fertilizers from "./view/Fertilizers.svelte";
  import {
    createDefaultSiteEventConfig,
    describeSiteEventWindow,
    getSiteEventSessionSignature,
    getSiteEventVariantDescription,
    getSiteEventVariantLabel,
    isSiteEventActive,
    parseSiteEventConfig,
    stringifySiteEventConfig,
    type SiteEventConfig,
  } from "./lib/adminEvents";
  import { getCookie, setCookie } from "./lib/cookies";
  import { getNscalcRpc } from "./lib/nscalcRpc";
  import * as nscalc from "@rpc/nscalc";

  type AuthState = {
    name: string;
    sessionId: string;
    isAdmin: boolean;
  } | null;

  type View = "journal" | "calculator" | "solutions" | "fertilizers" | "chat" | "about";

  type FireworksOverlayController = {
    stop(): void;
  };

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
  let email = $state("superuser@nscalc.com");
  let password = $state("1234");
  let authState = $state<AuthState>(null);
  let authBusy = $state(false);
  let authError = $state<string | null>(null);
  let eventConfig = $state<SiteEventConfig>(createDefaultSiteEventConfig());
  let eventDraft = $state<SiteEventConfig>(createDefaultSiteEventConfig());
  let eventLoading = $state(true);
  let eventSaving = $state(false);
  let eventPanelOpen = $state(false);
  let eventMessage = $state<string | null>(null);
  let eventRuntimeBusy = $state(false);
  let eventRuntime = $state<FireworksOverlayController | null>(null);

  function changeView(view: View) {
    mobileMenuEnabled = false;
    currentView = view;
  }

  const activeItem = $derived(navItems.find((item) => item.id === currentView) ?? navItems[0]);
  const eventIsLive = $derived(isSiteEventActive(eventConfig));
  const eventWindowLabel = $derived(describeSiteEventWindow(eventConfig));
  const eventDraftDirty = $derived(JSON.stringify(eventDraft) !== JSON.stringify(eventConfig));

  onMount(() => {
    let refreshTimer = window.setInterval(() => {
      void loadSiteEventConfig(false);
    }, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadSiteEventConfig(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    void loadSiteEventConfig(true);
    void restoreSession();

    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      stopFireworks("Event stopped.");
    };
  });

  async function restoreSession(): Promise<void> {
    const sessionId = getCookie("sid");
    if (!sessionId) {
      return;
    }

    authBusy = true;
    authError = null;
    try {
      const { authorizator } = await getNscalcRpc();
      const userData = await authorizator.LogInWithSessionId(sessionId);
      authState = {
        name: userData.name,
        sessionId: userData.sessionId,
        isAdmin: userData.isAdmin,
      };
      setCookie("sid", userData.sessionId);
    } catch {
      setCookie("sid", null);
      authState = null;
    } finally {
      authBusy = false;
    }
  }

  async function logIn(): Promise<void> {
    if (!email.trim() || !password.trim()) {
      authError = "Enter an email and password.";
      return;
    }

    authBusy = true;
    authError = null;
    try {
      const { authorizator } = await getNscalcRpc();
      const userData = await authorizator.LogIn(email.trim(), password);
      authState = {
        name: userData.name,
        sessionId: userData.sessionId,
        isAdmin: userData.isAdmin,
      };
      setCookie("sid", userData.sessionId);
      password = "";
    } catch (error) {
      authState = null;
      if (error instanceof nscalc.AuthorizationFailed) {
        const reason = () => {
          switch (error.reason) {
            case nscalc.AuthorizationFailed_Reason.email_does_not_exist:
              return "No account found with that email.";
            case nscalc.AuthorizationFailed_Reason.incorrect_password:
              return "Incorrect password.";
            default:
              return "Unknown error.";
          }
        };
        authError = `Login failed: ${reason()}`;
      } else {
        authError = error instanceof Error ? error.message : "Login failed.";
      }
    } finally {
      authBusy = false;
    }
  }

  async function logOut(): Promise<void> {
    const sessionId = authState?.sessionId ?? getCookie("sid");
    authBusy = true;
    authError = null;
    try {
      if (sessionId) {
        const { authorizator } = await getNscalcRpc();
        await authorizator.LogOut(sessionId);
      }
    } catch (error) {
      authError = error instanceof Error ? error.message : "Logout failed.";
    } finally {
      setCookie("sid", null);
      authState = null;
      authBusy = false;
    }
  }

  function clearEventWindow(): void {
    eventDraft.startAt = "";
    eventDraft.endAt = "";
    eventMessage = "Schedule window cleared.";
  }

  function resetEventDraft(): void {
    eventDraft = { ...eventConfig };
    eventMessage = "Draft reset to server config.";
  }

  function stopFireworks(message = "Preview stopped."): void {
    if (!eventRuntime) {
      return;
    }
    const activeRuntime = eventRuntime;
    eventRuntime = null;
    eventMessage = message;
    activeRuntime.stop();
  }

  async function startEventPlayback(trigger: "preview" | "auto", config: SiteEventConfig): Promise<boolean> {
    if (eventRuntimeBusy) {
      return false;
    }

    if (eventRuntime) {
      eventMessage = trigger === "preview" ? "Fireworks are already running." : eventMessage;
      return false;
    }

    eventRuntimeBusy = true;
    eventMessage = trigger === "preview" ? "Loading event preview..." : "Loading seasonal event...";

    try {
      let stoppedManually = false;
      const handleFinish = () => {
        eventRuntime = null;
        if (!stoppedManually) {
          eventMessage = trigger === "preview" ? "Preview finished." : `${getSiteEventVariantLabel(config)} completed.`;
        }
      };
      const runtime = config.variant === "snow"
        ? (await import("./lib/eventEffects/snowRuntime")).launchSnowOverlay({
            durationSeconds: config.durationSeconds,
            intensity: config.intensity,
            onFinish: handleFinish,
          })
        : (await import("./lib/eventEffects/fireworksRuntime")).launchFireworksOverlay({
            durationSeconds: config.durationSeconds,
            intensity: config.intensity,
            onFinish: handleFinish,
          });
      eventRuntime = {
        stop() {
          stoppedManually = true;
          runtime.stop();
        },
      };
      eventMessage = trigger === "preview" ? `${getSiteEventVariantLabel(config)} preview is live.` : `${getSiteEventVariantLabel(config)} triggered.`;
      return true;
    } catch (error) {
      eventRuntime = null;
      eventMessage = error instanceof Error ? error.message : "Unable to start event effect.";
      return false;
    } finally {
      eventRuntimeBusy = false;
    }
  }

  async function loadSiteEventConfig(showLoadingState: boolean): Promise<void> {
    if (showLoadingState) {
      eventLoading = true;
    }

    try {
      const { siteEvents } = await getNscalcRpc();
      const configJSON = await siteEvents.http.GetSiteEventConfig();
      const config = parseSiteEventConfig(configJSON);
      eventConfig = config;
      if (!authState?.isAdmin || !eventDraftDirty) {
        eventDraft = { ...config };
      }
      await maybeAutoplayEvent(config);
    } catch (error) {
      if (showLoadingState) {
        eventMessage = error instanceof Error ? error.message : "Unable to load site event config.";
      }
    } finally {
      eventLoading = false;
    }
  }

  async function saveSiteEventConfig(): Promise<void> {
    const sessionId = authState?.sessionId;
    if (!sessionId) {
      eventMessage = "Log in as an admin to save event changes.";
      return;
    }

    eventSaving = true;
    eventMessage = "Saving shared event config...";

    try {
      const { siteEvents } = await getNscalcRpc();
      const savedJSON = await siteEvents.http.SetSiteEventConfig(sessionId, stringifySiteEventConfig(eventDraft));
      const savedConfig = parseSiteEventConfig(savedJSON);
      eventConfig = savedConfig;
      eventDraft = { ...savedConfig };
      eventMessage = `Saved ${getSiteEventVariantLabel(savedConfig)} for all visitors.`;
      await maybeAutoplayEvent(savedConfig);
    } catch (error) {
      if (error instanceof nscalc.AuthorizationFailed) {
        eventMessage = "Your admin session expired. Log in again and retry.";
      } else if (error instanceof nscalc.PermissionViolation) {
        eventMessage = error.msg;
      } else if (error instanceof nscalc.InvalidArgument) {
        eventMessage = error.msg;
      } else {
        eventMessage = error instanceof Error ? error.message : "Unable to save site event config.";
      }
    } finally {
      eventSaving = false;
    }
  }

  async function maybeAutoplayEvent(config = eventConfig): Promise<void> {
    if (!config.enabled || !config.autoPlay || !isSiteEventActive(config)) {
      return;
    }

    const signature = getSiteEventSessionSignature(config);
    if (window.sessionStorage.getItem("nscalc.site-event-autoplay") === signature) {
      return;
    }

    const started = await startEventPlayback("auto", config);
    if (started) {
      window.sessionStorage.setItem("nscalc.site-event-autoplay", signature);
    }
  }
</script>

<svelte:head>
  <title>NScalc Grow Journal</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<div class="relative min-h-screen overflow-hidden">
  <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(125,198,255,0.12),transparent_22%),radial-gradient(circle_at_bottom_left,rgba(201,138,53,0.12),transparent_18%)]"></div>

  <header class="sticky top-0 z-20 border-b border-white/10 bg-ocean-900/80 backdrop-blur-xl">
    <div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between 2xl:gap-6">
        <div class="max-w-2xl">
          <p class="text-xs font-semibold uppercase tracking-[0.3em] text-ocean-300">NScalc</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">A mobile-first grow journal with nutrient context built in.</h1>
          <p class="mt-3 text-sm leading-6 text-ocean-100/80 sm:text-base">The new shell keeps stories, measurements, and upload status readable on phones first, while leaving room for the calculator and solution library beside it.</p>
        </div>

        <form class="panel-surface hairline grid w-full gap-3 rounded-3xl p-3 sm:grid-cols-2 lg:max-w-3xl lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] lg:items-end xl:max-w-184" onsubmit={(event) => { event.preventDefault(); void logIn(); }}>
          <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
            Email
            <input bind:value={email} class="touch-target min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" type="email" placeholder="grower@example.com" />
          </label>
          <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
            Password
            <input bind:value={password} class="touch-target min-w-0 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" type="password" placeholder="••••••••" />
          </label>
          <button type="submit" class="touch-target rounded-2xl bg-ocean-400 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-ocean-300 lg:self-end" disabled={authBusy}>{authBusy ? "Working..." : authState ? "Refresh login" : "Log in"}</button>
          {#if authState}
            <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 lg:self-end" onclick={() => void logOut()} disabled={authBusy}>Log out</button>
          {:else}
            <button type="button" class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 lg:self-end" disabled>Register</button>
          {/if}
          {#if authState || authError}
            <div class="sm:col-span-2 lg:col-span-4">
              {#if authState}
                <p class="text-xs text-ocean-100/80">Signed in as {authState.name}{authState.isAdmin ? " • moderator controls enabled" : ""}.</p>
              {/if}
              {#if authError}
                <p class="mt-1 text-xs text-rose-200">{authError}</p>
              {/if}
            </div>
          {/if}
        </form>
      </div>

      {#if eventConfig.enabled}
        <div class="mt-4 rounded-3xl border border-sand-200/22 bg-sand-200/10 px-4 py-3 text-sm text-sand-50">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-sand-100/85">Seasonal event</p>
              <p class="mt-1 font-semibold text-white">{getSiteEventVariantLabel(eventConfig)} {eventIsLive ? "is live now" : "is armed"}.</p>
              <p class="mt-1 text-xs text-sand-100/78">{eventWindowLabel}</p>
            </div>
            {#if authState?.isAdmin}
              <button
                type="button"
                class="touch-target rounded-2xl border border-white/15 bg-white/8 px-4 text-sm font-semibold text-white transition hover:bg-white/12"
                onclick={() => (eventPanelOpen = !eventPanelOpen)}
              >
                {eventPanelOpen ? "Hide event panel" : "Manage event"}
              </button>
            {/if}
          </div>
        </div>
      {/if}

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
        <div class="flex flex-wrap gap-2 pb-1">
          {#each navItems as item}
            <button
              type="button"
              class={`touch-target min-w-56 flex-1 rounded-2xl px-4 py-3 text-left text-sm font-medium transition lg:min-w-0 lg:flex-none ${currentView === item.id ? 'bg-sand-200 text-ocean-950' : 'bg-white/5 text-ocean-50 hover:bg-white/10'}`}
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
    <section class={`grid gap-4 ${currentView === "calculator" && !authState?.isAdmin ? 'grid-cols-1' : '2xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:items-start'}`}>
      <div class={`panel-surface relative rounded-4xl p-4 sm:p-6 ${currentView === "journal" ? 'z-30' : ''}`}>
        {#if currentView === "journal"}
          <Journal moderatorSessionId={authState?.sessionId ?? null} canModerate={authState?.isAdmin ?? false} moderatorName={authState?.name ?? null} />
        {:else if currentView === "calculator"}
          <Calculator />
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

      {#if currentView !== "calculator" || authState?.isAdmin}
        <aside class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
          {#if authState?.isAdmin}
            <section class="panel-surface rounded-4xl p-5">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Admin event panel</p>
                  <h2 class="mt-2 text-xl font-semibold text-white">Seasonal runtime controls</h2>
                  <p class="mt-2 text-sm leading-6 text-ocean-100/78">This pass stores the schedule in local browser storage and loads the fireworks code only when a live event or preview actually starts.</p>
                </div>
                <button
                  type="button"
                  class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  onclick={() => (eventPanelOpen = !eventPanelOpen)}
                >
                  {eventPanelOpen ? "Collapse" : "Expand"}
                </button>
              </div>

              <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div class="rounded-3xl bg-black/20 p-4">
                  <p class="text-ocean-100/70">Runtime</p>
                  <p class="mt-1 text-lg font-semibold text-white">{eventRuntime ? "Live" : "Idle"}</p>
                </div>
                <div class="rounded-3xl bg-black/20 p-4">
                  <p class="text-ocean-100/70">Schedule</p>
                  <p class="mt-1 text-lg font-semibold text-white">{eventIsLive ? "Active" : eventConfig.enabled ? "Armed" : "Off"}</p>
                </div>
              </div>

              {#if eventPanelOpen}
                <div class="mt-5 space-y-4 rounded-[1.75rem] border border-white/10 bg-black/18 p-4">
                  <div class="rounded-3xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-ocean-50">
                    <p class="font-semibold text-white">Shared server event</p>
                    <p class="mt-1 text-xs text-ocean-100/70">{eventLoading ? "Loading from server..." : `Last update ${eventConfig.updatedAt || "not yet saved"}${eventConfig.updatedBy ? ` by ${eventConfig.updatedBy}` : ""}.`}</p>
                  </div>

                  <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
                    Variant
                    <select bind:value={eventDraft.variant} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30">
                      <option value="fireworks">New Year fireworks</option>
                      <option value="snow">Winter snowfall</option>
                    </select>
                  </label>

                  <label class="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-ocean-50">
                    <div>
                      <span class="block font-semibold text-white">Enable shared event</span>
                      <span class="mt-1 block text-xs text-ocean-100/70">Keeps the event armed for the configured window.</span>
                    </div>
                    <input bind:checked={eventDraft.enabled} class="h-5 w-5 accent-sand-200" type="checkbox" />
                  </label>

                  <label class="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-ocean-50">
                    <div>
                      <span class="block font-semibold text-white">Autoplay when users open the site</span>
                      <span class="mt-1 block text-xs text-ocean-100/70">If no window is set, this will run on every fresh visit in this browser.</span>
                    </div>
                    <input bind:checked={eventDraft.autoPlay} class="h-5 w-5 accent-sand-200" type="checkbox" />
                  </label>

                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
                      Starts
                      <input bind:value={eventDraft.startAt} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" type="datetime-local" />
                    </label>
                    <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
                      Ends
                      <input bind:value={eventDraft.endAt} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30" type="datetime-local" />
                    </label>
                  </div>

                  <div class="grid gap-3 sm:grid-cols-2">
                    <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
                      Duration
                      <select bind:value={eventDraft.durationSeconds} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30">
                        <option value={10}>10 seconds</option>
                        <option value={18}>18 seconds</option>
                        <option value={24}>24 seconds</option>
                        <option value={30}>30 seconds</option>
                      </select>
                    </label>
                    <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.2em] text-ocean-200/70">
                      Intensity
                      <select bind:value={eventDraft.intensity} class="touch-target rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-ocean-300 focus:bg-black/30">
                        <option value="gentle">Gentle</option>
                        <option value="showtime">Showtime</option>
                      </select>
                    </label>
                  </div>

                  <div class="rounded-3xl border border-sand-200/18 bg-sand-200/8 px-4 py-3 text-sm text-sand-50">
                    <p class="font-semibold text-white">{getSiteEventVariantLabel(eventDraft)}</p>
                    <p class="mt-1 text-xs text-sand-100/80">{getSiteEventVariantDescription(eventDraft.variant)}</p>
                    <p class="mt-2 text-xs text-sand-100/75">{describeSiteEventWindow(eventDraft)}</p>
                  </div>

                  <div class="flex flex-wrap gap-3">
                    <button
                      type="button"
                      class="touch-target rounded-2xl bg-sand-200 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-sand-100"
                      onclick={() => void startEventPlayback("preview", eventDraft)}
                      disabled={eventRuntimeBusy}
                    >
                      {eventRuntimeBusy ? "Loading..." : `Preview ${eventDraft.variant === "snow" ? "snow" : "fireworks"}`}
                    </button>
                    <button
                      type="button"
                      class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                      onclick={() => stopFireworks()}
                      disabled={!eventRuntime}
                    >
                      Stop preview
                    </button>
                    <button
                      type="button"
                      class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                      onclick={clearEventWindow}
                    >
                      Clear schedule
                    </button>
                    <button
                      type="button"
                      class="touch-target rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                      onclick={resetEventDraft}
                      disabled={!eventDraftDirty}
                    >
                      Reset draft
                    </button>
                    <button
                      type="button"
                      class="touch-target rounded-2xl bg-ocean-400 px-4 text-sm font-semibold text-ocean-950 transition hover:bg-ocean-300"
                      onclick={() => void saveSiteEventConfig()}
                      disabled={eventSaving || !eventDraftDirty}
                    >
                      {eventSaving ? "Saving..." : "Save shared event"}
                    </button>
                  </div>

                  {#if eventMessage}
                    <p class="text-sm text-ocean-100/80">{eventMessage}</p>
                  {/if}
                </div>
              {/if}
            </section>
          {/if}

          {#if currentView !== "calculator"}
            <section class="panel-surface rounded-4xl p-5">
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
                  <p class="mt-1 text-lg font-semibold text-white">Cursor-paged</p>
                </div>
                <div class="rounded-3xl bg-black/20 p-4">
                  <p class="text-ocean-100/70">Fertilizers</p>
                  <p class="mt-1 text-lg font-semibold text-white">Cursor-paged</p>
                </div>
              </div>
            </section>

            <section class="panel-surface rounded-4xl p-5">
              <p class="text-xs font-semibold uppercase tracking-[0.25em] text-ocean-300">Mobile priorities</p>
              <ol class="mt-4 space-y-3 text-sm leading-6 text-ocean-100/80">
                <li>Keep story context visible while uploads continue in the background.</li>
                <li>Collapse dense control groups into stacked sections.</li>
                <li>Avoid desktop-only hover affordances for core actions.</li>
              </ol>
            </section>
          {/if}
        </aside>
      {/if}
    </section>
  </main>
</div>