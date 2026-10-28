import assert from "node:assert/strict";
import test from "node:test";

import { createSearchQueryTranslator } from "../src/lib/search/translate-query.ts";

function createResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    json: async () => payload,
  };
}

test("translates detected Portuguese into the active Picnic country language", async () => {
  let request;
  const translate = createSearchQueryTranslator({
    endpoint: "https://translator.example/translate",
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return createResponse({
        detectedLanguage: { language: "pt" },
        translatedText: "gecondenseerde melk",
      });
    },
  });

  assert.equal(await translate("leite condensado", "NL"), "gecondenseerde melk");
  assert.equal(request.url, "https://translator.example/translate");
  assert.deepEqual(JSON.parse(request.options.body), {
    q: "leite condensado",
    source: "auto",
    target: "nl",
    format: "text",
    api_key: "test-key",
  });
});

test("keeps non-Portuguese searches unchanged", async () => {
  const translate = createSearchQueryTranslator({
    endpoint: "https://translator.example/translate",
    apiKey: "test-key",
    fetchImpl: async () =>
      createResponse({
        detectedLanguage: { language: "en" },
        translatedText: "apple",
      }),
  });

  assert.equal(await translate("apples", "NL"), "apples");
});

test("uses the selected Picnic market language", async () => {
  const requestedTargets = [];
  const translate = createSearchQueryTranslator({
    endpoint: "https://translator.example/translate",
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      requestedTargets.push(JSON.parse(options.body).target);
      return createResponse({
        detectedLanguage: { language: "pb" },
        translatedText: "translated term",
      });
    },
  });

  await translate("produto", "DE");
  await translate("fruta", "FR");

  assert.deepEqual(requestedTargets, ["de", "fr"]);
});

test("returns the original query when translation is disabled or unavailable", async () => {
  let requests = 0;
  const disabledTranslator = createSearchQueryTranslator({
    fetchImpl: async () => {
      requests += 1;
      return createResponse({});
    },
  });
  const missingKeyTranslator = createSearchQueryTranslator({
    endpoint: "https://translator.example/translate",
    fetchImpl: async () => {
      requests += 1;
      return createResponse({});
    },
  });
  const unavailableTranslator = createSearchQueryTranslator({
    endpoint: "https://translator.example/translate",
    apiKey: "test-key",
    fetchImpl: async () => createResponse({}, 503),
  });

  assert.equal(await disabledTranslator("pao", "NL"), "pao");
  assert.equal(await missingKeyTranslator("pao", "NL"), "pao");
  assert.equal(await unavailableTranslator("pao", "NL"), "pao");
  assert.equal(requests, 0);
});

test("caches provider results for repeated search and suggestion queries", async () => {
  let requests = 0;
  const translate = createSearchQueryTranslator({
    endpoint: "https://translator.example/translate",
    apiKey: "test-key",
    fetchImpl: async () => {
      requests += 1;
      return createResponse({
        detectedLanguage: { language: "pt" },
        translatedText: "brood",
      });
    },
  });

  assert.equal(await translate("pao", "NL"), "brood");
  assert.equal(await translate("pao", "NL"), "brood");
  assert.equal(requests, 1);
});

test("returns the original query when the provider request fails", async () => {
  const translate = createSearchQueryTranslator({
    endpoint: "https://translator.example/translate",
    apiKey: "test-key",
    fetchImpl: async () => {
      throw new Error("provider unavailable");
    },
  });

  assert.equal(await translate("azeite", "NL"), "azeite");
});