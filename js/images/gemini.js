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
  timeoutMs = 60000,
} = {}) {
  if (!apiKey) {
    throw new Error('Kein API-Key: generateImage benoetigt einen apiKey.');
  }

  // A bare base64 string is taken as PNG, the type the first callers sent;
  // { data, mimeType } carries the real type (JPEG photos, WebP demo images).
  const parts = [
    { text: prompt },
    ...refImages.map((r) => ({
      inlineData: typeof r === 'string'
        ? { mimeType: 'image/png', data: r }
        : { mimeType: r.mimeType || 'image/png', data: r.data },
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

  // Harte Obergrenze fuer einen haengenden Aufruf: ohne Timeout blockiert ein
  // nie antwortender Request den Generieren-Flow unbegrenzt. Manueller Controller
  // statt AbortSignal.timeout, damit der Timer im finally sicher geloescht wird
  // (kein lingernder Timer, der z. B. den Unit-Test-Prozess offen haelt).
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Zeitueberschreitung', 'TimeoutError')),
    timeoutMs,
  );

  let response;
  try {
    response = await fetch(endpoint(model), {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new Error('Bild-API hat nicht rechtzeitig geantwortet (Zeitueberschreitung).');
    }
    throw new Error(`Bild-API nicht erreichbar: ${err.message}`);
  } finally {
    clearTimeout(timer);
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

// Turns any image URL the dashboard holds into a reference image for the API:
// a data URL directly, a path (slim demo states reference .webp files) or blob
// URL via fetch. null when the image cannot be read, so the caller generates
// from the text prompt alone instead of failing.
export async function toRefImage(url) {
  if (!url) return null;
  const m = /^data:([^;,]+)?;base64,(.*)$/s.exec(url);
  if (m) return { data: m[2], mimeType: m[1] || 'image/png' };
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Chunked, because String.fromCharCode(...bytes) overflows the argument
    // limit for images of a few hundred kilobytes.
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { data: btoa(bin), mimeType: blob.type || 'image/png' };
  } catch {
    return null;
  }
}
