// Unit-Tests fuer js/images/gemini.js — Bild-API-Client.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/images/gemini.js".
// global.fetch wird gemockt; geprueft werden URL, Header, Body und das Parsen
// von inlineData zur data:-URL anhand des Mock-Pixels.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODELS, endpoint, generateImage } from '../../js/images/gemini.js';
import {
  MOCK_PIXEL_BASE64,
  MOCK_PIXEL_MIME,
  MOCK_PIXEL_DATA_URL,
} from '../fixtures/mock-pixel.js';

// Baut eine erfolgreiche Gemini-Antwort mit dem Mock-Pixel.
function okResponse(
  base64 = MOCK_PIXEL_BASE64,
  mimeType = MOCK_PIXEL_MIME,
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType, data: base64 } }],
          },
        },
      ],
    }),
  };
}

// Installiert einen fetch-Mock, der die Aufrufe aufzeichnet, und gibt ein
// Restore zurueck.
function installFetch(handler) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return {
    calls,
    restore() {
      global.fetch = original;
    },
  };
}

test('MODELS traegt die Vertrags-Modellnamen', () => {
  assert.equal(MODELS.portrait, 'gemini-3.1-flash-image');
  // Karte ebenfalls auf Flash (Nano Banana 2): Pro hat im Free-Tier Kontingent 0.
  assert.equal(MODELS.map, 'gemini-3.1-flash-image');
});

test('endpoint(model) baut die generateContent-URL korrekt', () => {
  assert.equal(
    endpoint('gemini-3.1-flash-image'),
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent',
  );
  assert.equal(
    endpoint('gemini-3-pro-image'),
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent',
  );
});

test('generateImage: ruft die richtige URL mit dem richtigen Header', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({
      apiKey: 'TEST-KEY',
      model: MODELS.portrait,
      prompt: 'Ein Portrait',
    });

    assert.equal(mock.calls.length, 1);
    const { url, options } = mock.calls[0];
    assert.equal(url, endpoint(MODELS.portrait));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-goog-api-key'], 'TEST-KEY');
    assert.equal(options.headers['Content-Type'], 'application/json');
  } finally {
    mock.restore();
  }
});

test('generateImage: Body traegt den Prompt-Text in parts', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({
      apiKey: 'K',
      model: MODELS.portrait,
      prompt: 'Mein Prompt',
    });

    const body = JSON.parse(mock.calls[0].options.body);
    assert.ok(Array.isArray(body.contents));
    const parts = body.contents[0].parts;
    assert.ok(Array.isArray(parts));
    assert.equal(parts[0].text, 'Mein Prompt');
  } finally {
    mock.restore();
  }
});

test('generateImage: generationConfig fordert responseModalities IMAGE', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({
      apiKey: 'K',
      model: MODELS.portrait,
      prompt: 'p',
    });

    const body = JSON.parse(mock.calls[0].options.body);
    assert.deepEqual(body.generationConfig.responseModalities, ['IMAGE']);
  } finally {
    mock.restore();
  }
});

test('generateImage: refImages werden als inlineData mit image/png angehaengt', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({
      apiKey: 'K',
      model: MODELS.portrait,
      prompt: 'p',
      refImages: [MOCK_PIXEL_BASE64, MOCK_PIXEL_BASE64],
    });

    const body = JSON.parse(mock.calls[0].options.body);
    const parts = body.contents[0].parts;
    // erstes part ist der Text, danach die Referenzbilder
    assert.equal(parts[0].text, 'p');
    assert.equal(parts.length, 3);
    assert.deepEqual(parts[1].inlineData, {
      mimeType: 'image/png',
      data: MOCK_PIXEL_BASE64,
    });
    assert.deepEqual(parts[2].inlineData, {
      mimeType: 'image/png',
      data: MOCK_PIXEL_BASE64,
    });
  } finally {
    mock.restore();
  }
});

test('generateImage: aspectRatio landet in generationConfig.imageConfig', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({
      apiKey: 'K',
      model: MODELS.map,
      prompt: 'Karte',
      aspectRatio: '16:9',
    });

    const body = JSON.parse(mock.calls[0].options.body);
    assert.equal(body.generationConfig.imageConfig.aspectRatio, '16:9');
  } finally {
    mock.restore();
  }
});

test('generateImage: ohne aspectRatio kein imageConfig', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({ apiKey: 'K', model: MODELS.portrait, prompt: 'p' });
    const body = JSON.parse(mock.calls[0].options.body);
    assert.equal(body.generationConfig.imageConfig, undefined);
  } finally {
    mock.restore();
  }
});

test('generateImage: parst inlineData zur data:-URL (Mock-Pixel)', async () => {
  const mock = installFetch(() => okResponse());
  try {
    const result = await generateImage({
      apiKey: 'K',
      model: MODELS.portrait,
      prompt: 'p',
    });

    assert.equal(result.mimeType, MOCK_PIXEL_MIME);
    assert.equal(result.dataUrl, MOCK_PIXEL_DATA_URL);
    assert.ok(result.dataUrl.startsWith('data:image/png;base64,'));
  } finally {
    mock.restore();
  }
});

test('generateImage: ohne apiKey wirft es', async () => {
  // Kein fetch-Mock noetig: der Wurf muss vor dem Netzaufruf passieren.
  await assert.rejects(
    () => generateImage({ model: MODELS.portrait, prompt: 'p' }),
    /key|schluessel|api/i,
  );
});

test('generateImage: fehlgeschlagener Call (fetch ok:false) wirft', async () => {
  const mock = installFetch(() => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { message: 'verboten' } }),
    text: async () => 'verboten',
  }));
  try {
    await assert.rejects(() =>
      generateImage({ apiKey: 'K', model: MODELS.portrait, prompt: 'p' }),
    );
  } finally {
    mock.restore();
  }
});

test('generateImage: Antwort ohne inlineData wirft', async () => {
  const mock = installFetch(() => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'kein Bild' }] } }] }),
  }));
  try {
    await assert.rejects(() =>
      generateImage({ apiKey: 'K', model: MODELS.portrait, prompt: 'p' }),
    );
  } finally {
    mock.restore();
  }
});
