// Speicherstand laden und prüfen.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/parse.js".
// Reines ES-Modul ohne DOM-Abhängigkeit, läuft im Browser und unter node:test.

const JAHRESZEITEN = ['Frühling', 'Sommer', 'Herbst', 'Winter'];

/**
 * Zieht den Inhalt des ERSTEN ```json-Codeblocks aus Hybrid-Markdown.
 * Verlangt nach der Sprachkennung "json" optional Leerraum und einen
 * Zeilenumbruch — so wird ein inline erwähntes "```json-Block" in der Prosa
 * nicht fälschlich als Fence erkannt.
 * @returns {string|null} Roher JSON-Text des Blocks oder null.
 */
export function extractJsonBlock(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/```json[ \t]*\r?\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

/**
 * Lädt einen Speicherstand aus Hybrid-Markdown (mit ```json-Block) oder
 * reinem JSON. Extrahiert, parst und validiert strukturell.
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
export function parseSavegame(text) {
  const block = extractJsonBlock(text);
  const source = block === null ? text : block;

  let data;
  try {
    data = JSON.parse(source);
  } catch (e) {
    return {
      ok: false,
      error: `Der Speicherstand ließ sich nicht als JSON lesen: ${e.message}`,
    };
  }

  const { valid, errors } = validateSavegame(data);
  if (!valid) {
    return {
      ok: false,
      error: `Der Speicherstand entspricht nicht dem Format: ${errors.join('; ')}`,
    };
  }

  return { ok: true, data };
}

/**
 * Leichte strukturelle Prüfung gemäß Vertrag. Kein vollständiges JSON-Schema,
 * nur die für das Dashboard verlässlichen Felder. Die strenge Prüfung (Integer
 * statt nur Zahl, Enums, alle required-Felder) ist bewusst an
 * `schema/savegame.schema.json` delegiert, das in den Unit-Tests per Ajv läuft;
 * dieser Laufzeit-Check hält nur die Felder fest, auf die das Dashboard baut.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSavegame(data) {
  const errors = [];
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isNum = (v) => Number.isFinite(v);
  const isStr = (v) => typeof v === 'string';

  if (!isObj(data)) {
    return { valid: false, errors: ['Stand ist kein Objekt.'] };
  }

  if (!isNum(data.schemaVersion)) errors.push('schemaVersion muss eine Zahl sein.');

  // meta
  if (!isObj(data.meta)) {
    errors.push('meta fehlt oder ist kein Objekt.');
  } else {
    if (!isNum(data.meta.kapitel)) errors.push('meta.kapitel muss eine Zahl sein.');
    if (!isObj(data.meta.zeit)) {
      errors.push('meta.zeit fehlt oder ist kein Objekt.');
    } else {
      if (!JAHRESZEITEN.includes(data.meta.zeit.jahreszeit)) {
        errors.push(`meta.zeit.jahreszeit muss eine von ${JAHRESZEITEN.join(', ')} sein.`);
      }
      if (!isNum(data.meta.zeit.jahr)) errors.push('meta.zeit.jahr muss eine Zahl sein.');
    }
  }

  // volk
  if (!isObj(data.volk)) {
    errors.push('volk fehlt oder ist kein Objekt.');
  } else if (!isStr(data.volk.name)) {
    errors.push('volk.name muss ein String sein.');
  }

  // grundgroessen
  if (!isObj(data.grundgroessen)) {
    errors.push('grundgroessen fehlt oder ist kein Objekt.');
  } else {
    for (const k of ['nahrung', 'material', 'wissen']) {
      if (!isNum(data.grundgroessen[k])) errors.push(`grundgroessen.${k} muss eine Zahl sein.`);
    }
  }

  // lagewerte
  if (!isObj(data.lagewerte)) {
    errors.push('lagewerte fehlt oder ist kein Objekt.');
  } else {
    for (const k of ['verteidigung', 'mobilitaet', 'wohlstand']) {
      if (!isNum(data.lagewerte[k])) errors.push(`lagewerte.${k} muss eine Zahl sein.`);
    }
  }

  // berater
  if (!Array.isArray(data.berater)) {
    errors.push('berater muss ein Array sein.');
  } else {
    data.berater.forEach((b, i) => {
      if (!isObj(b)) {
        errors.push(`berater[${i}] ist kein Objekt.`);
        return;
      }
      if (!isStr(b.id)) errors.push(`berater[${i}].id muss ein String sein.`);
      if (!isStr(b.name)) errors.push(`berater[${i}].name muss ein String sein.`);
      if (!isNum(b.loyalitaet) || b.loyalitaet < -5 || b.loyalitaet > 5) {
        errors.push(`berater[${i}].loyalitaet muss eine Zahl von -5 bis +5 sein.`);
      }
    });
  }

  // maechte
  if (!Array.isArray(data.maechte)) {
    errors.push('maechte muss ein Array sein.');
  }

  return { valid: errors.length === 0, errors };
}
