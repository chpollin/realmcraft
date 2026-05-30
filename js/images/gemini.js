// js/images/gemini.js — Bild-API-Client fuer die Gemini generateContent-API.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/images/gemini.js".
// Reine ES-Modul-Datei ohne Top-Level-Seiteneffekt; der Netzaufruf erfolgt
// ausschliesslich in generateImage via global fetch.

// Vertrags-Modellnamen.
export const MODELS = {
  portrait: 'gemini-3.1-flash-image',
  map: 'gemini-3-pro-image',
};

// Baut die generateContent-URL fuer ein Modell.
export function endpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// Erzeugt ein Bild ueber die Gemini-API.
// Wirft ohne apiKey (vor dem Netzaufruf), bei fehlgeschlagenem Call und wenn
// die Antwort kein inlineData-Bild enthaelt.
export async function generateImage({
  apiKey,
  model,
  prompt,
  refImages = [],
  aspectRatio,
} = {}) {
  if (!apiKey) {
    throw new Error('Kein API-Key: generateImage benoetigt einen apiKey.');
  }

  const parts = [
    { text: prompt },
    ...refImages.map((data) => ({
      inlineData: { mimeType: 'image/png', data },
    })),
  ];

  const generationConfig = {
    responseModalities: ['IMAGE'],
    ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
  };

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig,
  });

  let response;
  try {
    response = await fetch(endpoint(model), {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body,
    });
  } catch (err) {
    throw new Error(`Bild-API nicht erreichbar: ${err.message}`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {
      detail = '';
    }
    throw new Error(
      `Bild-API-Fehler (HTTP ${response.status})${detail ? ': ' + detail : ''}`,
    );
  }

  const json = await response.json();
  const responseParts = json?.candidates?.[0]?.content?.parts ?? [];
  const inline = responseParts.find((p) => p && p.inlineData)?.inlineData;

  if (!inline || !inline.data) {
    throw new Error('Antwort enthaelt kein Bild (kein inlineData).');
  }

  const mimeType = inline.mimeType || 'image/png';
  const dataUrl = 'data:' + mimeType + ';base64,' + inline.data;

  return { dataUrl, mimeType };
}
