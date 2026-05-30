// js/images/gemini.js — Bild-API-Client fuer die Gemini generateContent-API.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/images/gemini.js".
// Reine ES-Modul-Datei ohne Top-Level-Seiteneffekt; der Netzaufruf erfolgt
// ausschliesslich in generateImage via global fetch.

// Vertrags-Modellnamen.
export const MODELS = {
  portrait: 'gemini-3.1-flash-image',
  // Karte ebenfalls auf dem Flash-Bildmodell: das Pro-Bildmodell hat im
  // Gemini-Free-Tier ein Kontingent von 0. Über die Einstellungen auf
  // 'gemini-3-pro-image' umstellbar (beste lesbare Beschriftung, braucht Billing).
  map: 'gemini-3.1-flash-image',
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
      const err = await response.json();
      detail = err?.error?.message || '';
    } catch {
      detail = (await response.text().catch(() => '')) || '';
    }
    // Haeufigster Fall: das Gemini-Free-Tier gibt Bildmodellen das Kontingent 0.
    // Keine Wiederholung und kein Modellwechsel hilft, nur aktiviertes Billing.
    if (response.status === 429 || /quota|RESOURCE_EXHAUSTED|limit:\s*0/i.test(detail)) {
      throw new Error(
        `Bildgenerierung nicht moeglich: ${model} hat im Gemini-Free-Tier kein Kontingent (Limit 0). ` +
        `Dafuer muss fuer den API-Key in der Google-Cloud-Konsole Billing aktiv sein. ` +
        `Ohne Bild zeigt RealmCraft das Initial-Medaillon.`,
      );
    }
    const short = (detail.split(/\r?\n/)[0] || '').slice(0, 200);
    throw new Error(`Bild-API-Fehler (HTTP ${response.status})${short ? `: ${short}` : ''}`);
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
