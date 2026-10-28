import type { CountryCode } from "@/lib/core/types";

type TranslationPayload = {
  detectedLanguage?: { language?: unknown };
  translatedText?: unknown;
};

type TranslatorOptions = {
  endpoint?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

const TARGET_LANGUAGE: Record<CountryCode, string> = {
  NL: "nl",
  DE: "de",
  FR: "fr",
};

const MAX_CACHE_ENTRIES = 256;
const REQUEST_TIMEOUT_MS = 3000;

export function createSearchQueryTranslator({
  endpoint,
  apiKey,
  fetchImpl = fetch,
}: TranslatorOptions) {
  const cache = new Map<string, string>();

  return async function translateSearchQuery(
    query: string,
    countryCode: CountryCode
  ): Promise<string> {
    const translationEndpoint = endpoint?.trim();
    const translationApiKey = apiKey?.trim();
    if (!translationEndpoint || !translationApiKey || query.trim() === "") return query;

    const target = TARGET_LANGUAGE[countryCode];
    const cacheKey = `${target}:${query}`;
    const cachedQuery = cache.get(cacheKey);
    if (cachedQuery !== undefined) return cachedQuery;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetchImpl(translationEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: query,
          source: "auto",
          target,
          format: "text",
          api_key: translationApiKey,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return query;

      const payload: unknown = await response.json();
      if (!isTranslationPayload(payload)) return query;

      const detectedLanguage = payload.detectedLanguage?.language;
      const translatedText = payload.translatedText;
      const result =
        typeof detectedLanguage === "string" && ["pt", "pb"].includes(detectedLanguage) &&
        typeof translatedText === "string" && translatedText.trim() !== ""
          ? translatedText.trim()
          : query;

      cache.set(cacheKey, result);
      if (cache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }

      return result;
    } catch {
      return query;
    } finally {
      clearTimeout(timeout);
    }
  };
}

function isTranslationPayload(value: unknown): value is TranslationPayload {
  return typeof value === "object" && value !== null;
}

const configuredTranslator = createSearchQueryTranslator({
  endpoint: process.env.LIBRETRANSLATE_URL,
  apiKey: process.env.LIBRETRANSLATE_API_KEY,
});

export const translateSearchQuery = configuredTranslator;