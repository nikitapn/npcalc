import type { SiteEventIntensity } from "../adminEvents";

type FireworksLaunchOptions = {
  durationSeconds: number;
  intensity: SiteEventIntensity;
  onFinish?: () => void;
};

type FireworksOverlayController = {
  stop(): void;
};

type Rocket = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  explodeAt: number;
  hue: number;
  stage: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  alpha: number;
};

type IntensityProfile = {
  salvoRange: [number, number];
  intervalRange: [number, number];
  particleRange: [number, number];
  speedRange: [number, number];
  trailSize: number;
  childChance: number;
};

const GENTLE_PROFILE: IntensityProfile = {
  salvoRange: [1, 2],
  intervalRange: [0.45, 0.9],
  particleRange: [22, 38],
  speedRange: [220, 360],
  trailSize: 2,
  childChance: 0.18,
};

const SHOWTIME_PROFILE: IntensityProfile = {
  salvoRange: [2, 4],
  intervalRange: [0.18, 0.42],
  particleRange: [42, 74],
  speedRange: [300, 520],
  trailSize: 3,
  childChance: 0.34,
};

export function launchFireworksOverlay(options: FireworksLaunchOptions): FireworksOverlayController {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.zIndex = "95";
  canvas.style.pointerEvents = "none";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.opacity = "0";
  canvas.style.transition = "opacity 240ms ease";
  document.body.append(canvas);

  const rawContext = canvas.getContext("2d");
  if (!rawContext) {
    canvas.remove();
    throw new Error("2D canvas is not available for fireworks.");
  }
  const context = rawContext;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const profile = reducedMotion || options.intensity === "gentle" ? GENTLE_PROFILE : SHOWTIME_PROFILE;
  const durationSeconds = Math.max(4, options.durationSeconds);
  const rockets: Rocket[] = [];
  const particles: Particle[] = [];
  const gravity = reducedMotion ? 90 : 128;
  let width = 0;
  let height = 0;
  let destroyed = false;
  let animationFrame = 0;
  let elapsed = 0;
  let spawnClock = 0;
  let nextLaunchIn = randomInRange(profile.intervalRange);
  let lastTimestamp = performance.now();

  function resize(): void {
    const ratio = window.devicePixelRatio || 1;
    width = Math.max(window.innerWidth, 1);
    height = Math.max(window.innerHeight, 1);
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function launchSalvo(): void {
    const salvoCount = randomInt(profile.salvoRange[0], profile.salvoRange[1]);
    for (let index = 0; index < salvoCount; index += 1) {
      const sideBias = index % 2 === 0 ? 0.28 : 0.72;
      const x = width * sideBias + randomBetween(-width * 0.18, width * 0.18);
      rockets.push({
        x,
        y: height + randomBetween(18, 90),
        vx: randomBetween(-26, 26),
        vy: -randomBetween(height * 0.45, height * 0.7),
        explodeAt: randomBetween(height * 0.14, height * 0.5),
        hue: randomBetween(0, 360),
        stage: 0,
      });
    }
  }

  function spawnTrail(rocket: Rocket): void {
    particles.push({
      x: rocket.x,
      y: rocket.y,
      vx: randomBetween(-18, 18),
      vy: randomBetween(10, 40),
      life: 0.24,
      maxLife: 0.24,
      size: randomBetween(profile.trailSize, profile.trailSize + 2),
      hue: 32 + randomBetween(-10, 18),
      alpha: 0.5,
    });
  }

  function explodeRocket(rocket: Rocket): void {
    const burstCount = randomInt(profile.particleRange[0], profile.particleRange[1]);
    const speedBase = randomBetween(profile.speedRange[0], profile.speedRange[1]);
    for (let index = 0; index < burstCount; index += 1) {
      const angle = (Math.PI * 2 * index) / burstCount + randomBetween(-0.18, 0.18);
      const speed = speedBase * randomBetween(0.45, 1.04);
      particles.push({
        x: rocket.x,
        y: rocket.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: randomBetween(0.8, 1.6),
        maxLife: randomBetween(0.8, 1.6),
        size: randomBetween(1.8, 4.8),
        hue: (rocket.hue + randomBetween(-28, 28) + 360) % 360,
        alpha: 1,
      });
    }

    if (rocket.stage === 0 && Math.random() < profile.childChance) {
      const childCount = randomInt(3, 6);
      for (let index = 0; index < childCount; index += 1) {
        rockets.push({
          x: rocket.x,
          y: rocket.y,
          vx: randomBetween(-80, 80),
          vy: randomBetween(-120, -48),
          explodeAt: rocket.y - randomBetween(40, 120),
          hue: (rocket.hue + randomBetween(-48, 48) + 360) % 360,
          stage: 1,
        });
      }
    }
  }

  function renderFrame(deltaSeconds: number): void {
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "rgba(3, 8, 18, 0.18)";
    context.fillRect(0, 0, width, height);

    const glow = context.createRadialGradient(width * 0.5, height * 0.32, 0, width * 0.5, height * 0.32, height * 0.72);
    glow.addColorStop(0, "rgba(12, 61, 109, 0.08)");
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, width, height);

    context.globalCompositeOperation = "lighter";

    for (let index = rockets.length - 1; index >= 0; index -= 1) {
      const rocket = rockets[index];
      rocket.vy += gravity * deltaSeconds;
      rocket.x += rocket.vx * deltaSeconds;
      rocket.y += rocket.vy * deltaSeconds;
      spawnTrail(rocket);

      context.beginPath();
      context.fillStyle = `hsla(${rocket.hue} 92% 68% / 0.95)`;
      context.arc(rocket.x, rocket.y, rocket.stage === 0 ? 2.3 : 1.8, 0, Math.PI * 2);
      context.fill();

      if (rocket.vy >= 0 || rocket.y <= rocket.explodeAt) {
        explodeRocket(rocket);
        rockets.splice(index, 1);
      }
    }

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= deltaSeconds;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }

      particle.vy += gravity * 0.4 * deltaSeconds;
      particle.vx *= 0.993;
      particle.vy *= 0.993;
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;

      const progress = particle.life / particle.maxLife;
      const radius = particle.size * (0.45 + progress * 0.8);
      context.beginPath();
      context.fillStyle = `hsla(${particle.hue} 96% 68% / ${particle.alpha * progress})`;
      context.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      context.fill();
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
    window.setTimeout(() => canvas.remove(), 220);
    options.onFinish?.();
  }

  function tick(timestamp: number): void {
    if (destroyed) {
      return;
    }

    const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.045);
    lastTimestamp = timestamp;
    elapsed += deltaSeconds;
    spawnClock += deltaSeconds;

    if (elapsed <= durationSeconds && spawnClock >= nextLaunchIn) {
      launchSalvo();
      spawnClock = 0;
      nextLaunchIn = randomInRange(profile.intervalRange);
    }

    renderFrame(deltaSeconds);

    if (elapsed > durationSeconds && rockets.length === 0 && particles.length === 0) {
      stop();
      return;
    }

    animationFrame = requestAnimationFrame(tick);
  }

  resize();
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

function randomInt(min: number, max: number): number {
  return Math.floor(randomBetween(min, max + 1));
}

function randomInRange([min, max]: [number, number]): number {
  return randomBetween(min, max);
}