// Unit tests of tools/portraits/gemini.js, the image API client.
// global.fetch is mocked; the tests check URL, headers, body and the parsing
// of inlineData with the mock pixel.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateImage } from '../../tools/portraits/gemini.js';
import { MOCK_PIXEL_BASE64, MOCK_PIXEL_MIME } from '../fixtures/mock-pixel.js';

const MODEL = 'gemini-3.1-flash-image';

function okResponse(base64 = MOCK_PIXEL_BASE64, mimeType = MOCK_PIXEL_MIME) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data: base64 } }] } }] }),
  };
}

// Records the calls; restore() puts the real fetch back.
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

test('generateImage: calls the generateContent URL of the model with the key header', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({ apiKey: 'TEST-KEY', model: MODEL, prompt: 'Ein Portrait' });
    assert.equal(mock.calls.length, 1);
    const { url, options } = mock.calls[0];
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-goog-api-key'], 'TEST-KEY');
    assert.equal(options.headers['Content-Type'], 'application/json');
  } finally {
    mock.restore();
  }
});

test('generateImage: the body carries the prompt as its only part', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({ apiKey: 'K', model: MODEL, prompt: 'Mein Prompt' });
    const body = JSON.parse(mock.calls[0].options.body);
    assert.deepEqual(body.contents, [{ parts: [{ text: 'Mein Prompt' }] }]);
  } finally {
    mock.restore();
  }
});

test('generateImage: generationConfig asks for responseModalities IMAGE', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({ apiKey: 'K', model: MODEL, prompt: 'p' });
    const body = JSON.parse(mock.calls[0].options.body);
    assert.deepEqual(body.generationConfig.responseModalities, ['IMAGE']);
  } finally {
    mock.restore();
  }
});

test('generateImage: aspectRatio goes into generationConfig.imageConfig', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({ apiKey: 'K', model: MODEL, prompt: 'Karte', aspectRatio: '16:9' });
    const body = JSON.parse(mock.calls[0].options.body);
    assert.equal(body.generationConfig.imageConfig.aspectRatio, '16:9');
  } finally {
    mock.restore();
  }
});

test('generateImage: no imageConfig without aspectRatio', async () => {
  const mock = installFetch(() => okResponse());
  try {
    await generateImage({ apiKey: 'K', model: MODEL, prompt: 'p' });
    const body = JSON.parse(mock.calls[0].options.body);
    assert.equal(body.generationConfig.imageConfig, undefined);
  } finally {
    mock.restore();
  }
});

test('generateImage: returns the inlineData image as base64 data and its type', async () => {
  const mock = installFetch(() => okResponse());
  try {
    const result = await generateImage({ apiKey: 'K', model: MODEL, prompt: 'p' });
    assert.deepEqual(result, { data: MOCK_PIXEL_BASE64, mimeType: MOCK_PIXEL_MIME });
  } finally {
    mock.restore();
  }
});

test('generateImage: throws without apiKey', async () => {
  // No fetch mock: the throw must come before any network call.
  await assert.rejects(() => generateImage({ model: MODEL, prompt: 'p' }), /key|schluessel|api/i);
});

test('generateImage: throws on a failed call (fetch ok:false)', async () => {
  const mock = installFetch(() => ({
    ok: false,
    status: 403,
    json: async () => ({ error: { message: 'verboten' } }),
    text: async () => 'verboten',
  }));
  try {
    await assert.rejects(() => generateImage({ apiKey: 'K', model: MODEL, prompt: 'p' }));
  } finally {
    mock.restore();
  }
});

test('generateImage: a key the service echoes back does not appear in the message', async () => {
  const key = 'AIzaGeheimerTestschluessel';
  const mock = installFetch(() => ({
    ok: false,
    status: 400,
    json: async () => ({ error: { message: `API key ${key} not valid` } }),
  }));
  try {
    await assert.rejects(
      () => generateImage({ apiKey: key, model: MODEL, prompt: 'p' }),
      (err) => !err.message.includes(key) && err.message.includes('***'),
    );
  } finally {
    mock.restore();
  }
});

test('generateImage: throws on an answer without inlineData', async () => {
  const mock = installFetch(() => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: 'kein Bild' }] } }] }),
  }));
  try {
    await assert.rejects(() => generateImage({ apiKey: 'K', model: MODEL, prompt: 'p' }));
  } finally {
    mock.restore();
  }
});
