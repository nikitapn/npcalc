export type SiteEventVariant = "fireworks" | "snow";

export type SiteEventIntensity = "gentle" | "showtime";

export type SiteEventConfig = {
  variant: SiteEventVariant;
  enabled: boolean;
  autoPlay: boolean;
  startAt: string;
  endAt: string;
  durationSeconds: number;
  intensity: SiteEventIntensity;
  updatedAt: string;
  updatedBy: string | null;
};

export function createDefaultSiteEventConfig(): SiteEventConfig {
  return {
    variant: "fireworks",
    enabled: false,
    autoPlay: true,
    startAt: "",
    endAt: "",
    durationSeconds: 18,
    intensity: "showtime",
    updatedAt: "",
    updatedBy: null,
  };
}

export function normalizeSiteEventConfig(value: Partial<SiteEventConfig> | null | undefined): SiteEventConfig {
  const defaults = createDefaultSiteEventConfig();
  const durationSeconds = Number(value?.durationSeconds);
  const intensity = value?.intensity === "gentle" || value?.intensity === "showtime" ? value.intensity : defaults.intensity;
  const variant = value?.variant === "snow" || value?.variant === "fireworks" ? value.variant : defaults.variant;

  return {
    variant,
    enabled: Boolean(value?.enabled),
    autoPlay: value?.autoPlay ?? defaults.autoPlay,
    startAt: typeof value?.startAt === "string" ? value.startAt : defaults.startAt,
    endAt: typeof value?.endAt === "string" ? value.endAt : defaults.endAt,
    durationSeconds: Number.isFinite(durationSeconds) ? Math.min(30, Math.max(8, Math.round(durationSeconds))) : defaults.durationSeconds,
    intensity,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : defaults.updatedAt,
    updatedBy: typeof value?.updatedBy === "string" ? value.updatedBy : defaults.updatedBy,
  };
}

export function parseSiteEventConfig(value: string): SiteEventConfig {
  try {
    return normalizeSiteEventConfig(JSON.parse(value) as Partial<SiteEventConfig>);
  } catch {
    return createDefaultSiteEventConfig();
  }
}

export function stringifySiteEventConfig(config: SiteEventConfig): string {
  return JSON.stringify(normalizeSiteEventConfig(config));
}

export function isSiteEventActive(config: SiteEventConfig, now = new Date()): boolean {
  if (!config.enabled) {
    return false;
  }

  const startsAt = parseLocalDateTime(config.startAt);
  const endsAt = parseLocalDateTime(config.endAt);

  if (startsAt && now < startsAt) {
    return false;
  }

  if (endsAt && now > endsAt) {
    return false;
  }

  return true;
}

export function describeSiteEventWindow(config: SiteEventConfig): string {
  const startsAt = parseLocalDateTime(config.startAt);
  const endsAt = parseLocalDateTime(config.endAt);

  if (startsAt && endsAt) {
    return `Runs ${formatDateTime(startsAt)} to ${formatDateTime(endsAt)}`;
  }

  if (startsAt) {
    return `Starts ${formatDateTime(startsAt)}`;
  }

  if (endsAt) {
    return `Runs until ${formatDateTime(endsAt)}`;
  }

  return "Runs whenever autoplay is enabled.";
}

export function getSiteEventSessionSignature(config: SiteEventConfig): string {
  return [
    config.variant,
    config.enabled ? "1" : "0",
    config.autoPlay ? "1" : "0",
    config.startAt,
    config.endAt,
    String(config.durationSeconds),
    config.intensity,
  ].join("|");
}

export function getSiteEventVariantLabel(config: SiteEventConfig): string {
  return config.variant === "snow" ? "Winter snowfall" : "New Year fireworks";
}

export function getSiteEventVariantDescription(variant: SiteEventVariant): string {
  return variant === "snow"
    ? "Slow drifting snow with a light atmospheric overlay."
    : "A short celebratory burst of fireworks when the page opens.";
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}