type MyMemoryPayload = {
  responseData?: {
    translatedText?: unknown;
  };
  responseStatus?: unknown;
};

type TranslatorOptions = {
  fetchImpl?: typeof fetch;
};

const MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get";
const MAX_QUERY_BYTES = 500;
const MAX_CACHE_ENTRIES = 256;
const REQUEST_TIMEOUT_MS = 3000;

export function createPortugueseToDutchTranslator({ fetchImpl = fetch }: TranslatorOptions = {}) {
  const cache = new Map<string, string | null>();

  return async function translatePortugueseToDutch(query: string): Promise<string | null> {
    const trimmedQuery = query.trim();
    if (
      trimmedQuery.length < 3 ||
      new TextEncoder().encode(trimmedQuery).length > MAX_QUERY_BYTES
    ) {
      return null;
    }

    if (cache.has(trimmedQuery)) return cache.get(trimmedQuery) ?? null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const url = new URL(MYMEMORY_ENDPOINT);
      url.searchParams.set("q", trimmedQuery);
      url.searchParams.set("langpair", "pt|nl");

      const response = await fetchImpl(url, { signal: controller.signal });
      if (!response.ok) return null;

      const payload: unknown = await response.json();
      if (!isMyMemoryPayload(payload) || payload.responseStatus !== 200) return null;

      const translatedText = payload.responseData?.translatedText;
      const translation =
        typeof translatedText === "string" && translatedText.trim() !== ""
          ? translatedText.trim()
          : null;
      const result =
        translation?.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase() ? null : translation;

      cache.set(trimmedQuery, result);
      if (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }

      return result;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}

type SearchQueryResolverOptions = {
  enabled: boolean;
  translate?: (query: string) => Promise<string | null>;
};

export function createSearchQueryResolver({
  enabled,
  translate = translatePortugueseToDutch,
}: SearchQueryResolverOptions) {
  return async function resolveSearchQuery(query: string, searchInPortuguese: boolean) {
    if (!enabled || !searchInPortuguese) return query;
    return (await translate(query)) ?? query;
  };
}

function isMyMemoryPayload(value: unknown): value is MyMemoryPayload {
  return typeof value === "object" && value !== null;
}

export const translatePortugueseToDutch = createPortugueseToDutchTranslator();
export const resolveSearchQuery = createSearchQueryResolver({
  enabled: process.env.NEXT_PUBLIC_PORTUGUESE_SEARCH_ENABLED === "true",
});