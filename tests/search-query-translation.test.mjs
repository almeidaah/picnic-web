import assert from "node:assert/strict";
import test from "node:test";

import {
  createPortugueseToDutchTranslator,
  createSearchQueryResolver,
} from "../src/lib/search/translate-query.ts";

function createResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => payload,
  };
}

test("requests an anonymous Portuguese-to-Dutch translation", async () => {
  let request;
  const translate = createPortugueseToDutchTranslator({
    fetchImpl: async (url, options) => {
      request = { url: new URL(url), options };
      return createResponse({
        responseData: { translatedText: "gecondenseerde melk" },
        responseStatus: 200,
      });
    },
  });

  assert.equal(await translate("leite condensado"), "gecondenseerde melk");
  assert.equal(
    request.url.origin + request.url.pathname,
    "https://api.mymemory.translated.net/get"
  );
  assert.equal(request.url.searchParams.get("q"), "leite condensado");
  assert.equal(request.url.searchParams.get("langpair"), "pt|nl");
  assert.equal(request.options.method, undefined);
  assert.equal(request.options.headers, undefined);
});

test("does not call MyMemory for empty or oversized queries", async () => {
  let requests = 0;
  const translate = createPortugueseToDutchTranslator({
    fetchImpl: async () => {
      requests += 1;
      return createResponse({});
    },
  });

  assert.equal(await translate("  "), null);
  assert.equal(await translate("de"), null);
  assert.equal(await translate("a".repeat(501)), null);
  assert.equal(requests, 0);
});

test("caches anonymous translations for repeated queries", async () => {
  let requests = 0;
  const translate = createPortugueseToDutchTranslator({
    fetchImpl: async () => {
      requests += 1;
      return createResponse({
        responseData: { translatedText: "brood" },
        responseStatus: 200,
      });
    },
  });

  assert.equal(await translate("pao"), "brood");
  assert.equal(await translate("pao"), "brood");
  assert.equal(requests, 1);
});

test("returns null when the provider request fails or has no translation", async () => {
  const unavailableTranslator = createPortugueseToDutchTranslator({
    fetchImpl: async () => {
      throw new Error("provider unavailable");
    },
  });
  const invalidResponseTranslator = createPortugueseToDutchTranslator({
    fetchImpl: async () =>
      createResponse({ responseData: { translatedText: "pao" }, responseStatus: 200 }),
  });

  assert.equal(await unavailableTranslator("azeite"), null);
  assert.equal(await invalidResponseTranslator("pao"), null);
});

test("translates only when Portuguese search is enabled and selected", async () => {
  let translationRequests = 0;
  const resolver = createSearchQueryResolver({
    enabled: true,
    translate: async () => {
      translationRequests += 1;
      return "gecondenseerde melk";
    },
  });
  const disabledResolver = createSearchQueryResolver({
    enabled: false,
    translate: async () => {
      translationRequests += 1;
      return "gecondenseerde melk";
    },
  });

  assert.equal(await resolver("leite condensado", false), "leite condensado");
  assert.equal(await disabledResolver("leite condensado", true), "leite condensado");
  assert.equal(translationRequests, 0);
  assert.equal(await resolver("leite condensado", true), "gecondenseerde melk");
  assert.equal(translationRequests, 1);
});