// Einheitliches Mock-Pixel fuer Tests und Fixtures: 1x1 PNG, base64.
// Verbindlich laut Aufgabenstellung; identisch fuer Unit-Tests und E2E-Mocks.

// Reine base64-Nutzlast (ohne data:-Praefix), wie sie die Gemini-API in
// candidates[0].content.parts[0].inlineData.data liefert.
export const MOCK_PIXEL_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export const MOCK_PIXEL_MIME = 'image/png';

// Vollstaendige data:-URL, wie generateImage sie aus der Antwort zusammensetzt.
export const MOCK_PIXEL_DATA_URL =
  'data:' + MOCK_PIXEL_MIME + ';base64,' + MOCK_PIXEL_BASE64;
