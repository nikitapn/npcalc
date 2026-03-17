import type { SiteEventIntensity } from "../adminEvents";

type SnowLaunchOptions = {
  durationSeconds: number;
  intensity: SiteEventIntensity;
  onFinish?: () => void;
};

type SnowOverlayController = {
  stop(): void;
};

type Snowflake = {
  x: number;
  y: number;
  radius: number;
  vy: number;
  drift: number;
  wobble: number;
  alpha: number;
};

export function launchSnowOverlay(options: SnowLaunchOptions): SnowOverlayController {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.zIndex = "95";
  canvas.style.pointerEvents = "none";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.opacity = "0";
  canvas.style.transition = "opacity 260ms ease";
  document.body.append(canvas);

  const rawContext = canvas.getContext("2d");
  if (!rawContext) {
    canvas.remove();
    throw new Error("2D canvas is not available for snow.");
  }
  const context = rawContext;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const intensity = reducedMotion ? "gentle" : options.intensity;
  const targetCount = intensity === "showtime" ? 180 : 96;
  const durationSeconds = Math.max(6, options.durationSeconds);
  const snowflakes: Snowflake[] = [];
  let width = 0;
  let height = 0;
  let destroyed = false;
  let animationFrame = 0;
  let elapsed = 0;
  let lastTimestamp = performance.now();

  function resize(): void {
    const ratio = window.devicePixelRatio || 1;
    width = Math.max(window.innerWidth, 1);
    height = Math.max(window.innerHeight, 1);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function createSnowflake(resetAboveViewport = false): Snowflake {
    return {
      x: Math.random() * width,
      y: resetAboveViewport ? -Math.random() * height * 0.2 : Math.random() * height,
      radius: intensity === "showtime" ? randomBetween(1.2, 4.8) : randomBetween(1.4, 3.6),
      vy: intensity === "showtime" ? randomBetween(18, 58) : randomBetween(14, 38),
      drift: randomBetween(-18, 18),
      wobble: randomBetween(0, Math.PI * 2),
      alpha: randomBetween(0.38, 0.95),
    };
  }

  function seedSnowflakes(): void {
    snowflakes.length = 0;
    for (let index = 0; index < targetCount; index += 1) {
      snowflakes.push(createSnowflake(index < targetCount * 0.4));
    }
  }

  function stop(): void {
    if (destroyed) {
      return;
    }
    destroyed = true;
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("resize", resize);
    canvas.style.opacity = "0";
    window.setTimeout(() => canvas.remove(), 240);
    options.onFinish?.();
  }

  function tick(timestamp: number): void {
    if (destroyed) {
      return;
    }

    const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
    lastTimestamp = timestamp;
    elapsed += deltaSeconds;

    context.clearRect(0, 0, width, height);
    const haze = context.createLinearGradient(0, 0, 0, height);
    haze.addColorStop(0, "rgba(188, 220, 255, 0.08)");
    haze.addColorStop(1, "rgba(4, 11, 20, 0)");
    context.fillStyle = haze;
    context.fillRect(0, 0, width, height);

    for (const snowflake of snowflakes) {
      snowflake.wobble += deltaSeconds * randomBetween(0.8, 1.8);
      snowflake.y += snowflake.vy * deltaSeconds;
      snowflake.x += (snowflake.drift + Math.sin(snowflake.wobble) * 12) * deltaSeconds;

      if (snowflake.y > height + 10 || snowflake.x < -24 || snowflake.x > width + 24) {
        Object.assign(snowflake, createSnowflake(true));
        continue;
      }

      context.beginPath();
      context.fillStyle = `rgba(240, 247, 255, ${snowflake.alpha})`;
      context.arc(snowflake.x, snowflake.y, snowflake.radius, 0, Math.PI * 2);
      context.fill();
    }

    if (elapsed > durationSeconds) {
      stop();
      return;
    }

    animationFrame = requestAnimationFrame(tick);
  }

  resize();
  seedSnowflakes();
  window.addEventListener("resize", resize);
  requestAnimationFrame(() => {
    canvas.style.opacity = "1";
  });
  animationFrame = requestAnimationFrame(tick);

  return { stop };
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}