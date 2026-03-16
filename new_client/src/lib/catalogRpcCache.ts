import type { Fertilizer, Solution } from "@rpc/nscalc";
import { getNscalcRpc } from "./nscalcRpc";

type SolutionPageResult = {
  items: Solution[];
  nextCursor: string | null;
};

type FertilizerPageResult = {
  items: Fertilizer[];
  nextCursor: string | null;
};

type BootstrapResult = {
  solutions: Solution[];
  fertilizers: Fertilizer[];
};

type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  promise?: Promise<T>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

const solutionPageCache = new Map<string, CacheEntry<SolutionPageResult>>();
const fertilizerPageCache = new Map<string, CacheEntry<FertilizerPageResult>>();
const bootstrapCache = new Map<string, CacheEntry<BootstrapResult>>();

function buildKey(parts: Array<string | number | null | undefined>): string {
  return JSON.stringify(parts);
}

async function resolveCached<T>(cache: Map<string, CacheEntry<T>>, key: string, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key);

  if (entry?.value && entry.expiresAt > now) {
    return entry.value;
  }

  if (entry?.promise) {
    return entry.promise;
  }

  const promise = loader()
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    expiresAt: now + CACHE_TTL_MS,
    promise,
  });

  return promise;
}

export function clearCatalogRpcCache(): void {
  solutionPageCache.clear();
  fertilizerPageCache.clear();
  bootstrapCache.clear();
}

export async function listSolutionsPageCached(query: string, author: string, cursor: string, limit: number): Promise<SolutionPageResult> {
  const key = buildKey(["solutions", query, author, cursor, limit]);
  return resolveCached(solutionPageCache, key, async () => {
    const { calculator } = await getNscalcRpc();
    const page = await calculator.ListSolutionsPage(query, author, cursor, limit);
    return {
      items: Array.from(page.items),
      nextCursor: page.next_cursor ?? null,
    };
  });
}

export async function listFertilizersPageCached(query: string, cursor: string, limit: number): Promise<FertilizerPageResult> {
  const key = buildKey(["fertilizers", query, cursor, limit]);
  return resolveCached(fertilizerPageCache, key, async () => {
    const { calculator } = await getNscalcRpc();
    const page = await calculator.ListFertilizersPage(query, cursor, limit);
    return {
      items: Array.from(page.items),
      nextCursor: page.next_cursor ?? null,
    };
  });
}

export async function getCalculatorBootstrapCached(solutionLimit: number, fertilizerLimit: number): Promise<BootstrapResult> {
  const key = buildKey(["bootstrap", solutionLimit, fertilizerLimit]);
  return resolveCached(bootstrapCache, key, async () => {
    const { calculator } = await getNscalcRpc();
    const bootstrap = await calculator.GetCalculatorBootstrap(solutionLimit, fertilizerLimit);
    return {
      solutions: Array.from(bootstrap.solutions),
      fertilizers: Array.from(bootstrap.fertilizers),
    };
  });
}