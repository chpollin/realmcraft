// tools/portraits/gemini.js — image client for the Gemini generateContent API.
// A pure ES module without top-level side effects; the only network call is
// the global fetch in generateImage.

// Generates one image and returns it as { data (base64), mimeType }.
// Throws without apiKey (before any network call), when the call fails and
// when the answer carries no inlineData image.
export async function generateImage({
  apiKey,
  model,
  prompt,
  aspectRatio,
  timeoutMs = 60000,
} = {}) {
  if (!apiKey) {
    throw new Error('Kein API-Key: generateImage benoetigt einen apiKey.');
  }

  const generationConfig = {
    responseModalities: ['IMAGE'],
    ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
  };

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  });

  // Hard ceiling for a hanging call, which would otherwise block the run
  // without end. A manual controller instead of AbortSignal.timeout, so the
  // timer is cleared in finally and no lingering timer keeps a test process open.
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException('Zeitueberschreitung', 'TimeoutError')),
    timeoutMs,
  );

  let response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
    // The common case: the Gemini free tier gives image models a quota of 0.
    // No retry and no other model helps, only billing enabled for the key.
    if (response.status === 429 || /quota|RESOURCE_EXHAUSTED|limit:\s*0/i.test(detail)) {
      throw new Error(
        `Bildgenerierung nicht moeglich: ${model} hat im Gemini-Free-Tier kein Kontingent (Limit 0). ` +
        `Dafuer muss fuer den API-Key in der Google-Cloud-Konsole Billing aktiv sein. ` +
        `Ohne Bild zeigt RealmCraft das Initial-Medaillon.`,
      );
    }
    // The message is printed by the tool, so a key the API echoes back is cut out.
    const short = (detail.split(/\r?\n/)[0] || '').split(apiKey).join('***').slice(0, 200);
    throw new Error(`Bild-API-Fehler (HTTP ${response.status})${short ? `: ${short}` : ''}`);
  }

  const json = await response.json();
  const responseParts = json?.candidates?.[0]?.content?.parts ?? [];
  const inline = responseParts.find((p) => p && p.inlineData)?.inlineData;

  if (!inline || !inline.data) {
    throw new Error('Antwort enthaelt kein Bild (kein inlineData).');
  }

  return { data: inline.data, mimeType: inline.mimeType || 'image/png' };
}
