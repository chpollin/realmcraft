// Existing harness chats publish validated authoring data, never campaigns.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishWorkshop, readWorkshop, WorkshopError, workshopPrompt, workshopSchema } from '../../engine/harness/workshop.js';

const args = process.argv.slice(2), command = args.shift(), options = {};
try {
  while (args.length) {
    const key = args.shift(), value = args.shift();
    if (!['--id', '--root', '--file', '--expect-rev', '--generation'].includes(key) || value === undefined || value.startsWith('--') || Object.hasOwn(options, key)) throw new WorkshopError(400, 'usage');
    options[key] = value;
  }
  if (!['read', 'publish', 'schema'].includes(command) || !options['--id'] || (command !== 'publish' && ['--file', '--expect-rev', '--generation'].some((key) => Object.hasOwn(options, key)))) throw new WorkshopError(400, 'usage');
  const root = resolve(options['--root'] ?? process.env.REALMCRAFT_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
  let workshop;
  if (command === 'publish') {
    const rev = options['--expect-rev'], generation = options['--generation'];
    if (!options['--file'] || !/^(?:0|[1-9][0-9]*)$/.test(rev ?? '') || (generation !== 'legacy' && !/^[0-9a-f]{32}$/.test(generation ?? ''))) throw new WorkshopError(400, 'usage');
    const path = resolve(options['--file']);
    if (statSync(path).size > 64 * 1024) throw new WorkshopError(400, 'packet-too-large');
    const packet = JSON.parse(readFileSync(path, 'utf8'));
    workshop = publishWorkshop(root, options['--id'], packet, { expectRev: Number(rev), generation: generation === 'legacy' ? null : generation });
  } else workshop = readWorkshop(root, options['--id']);
  process.stdout.write(JSON.stringify(command === 'schema' ? { ok: true, workshop, ...workshopSchema(workshop) } : { ok: true, workshop, prompt: workshopPrompt(root, workshop) }, null, 2) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, issues: error.issues ?? [{ code: 'format', severity: 'error', path: '', message: 'Workshop command failed', params: { reason: 'workshop-command' } }] }) + '\n');
  process.exitCode = error.status === 404 ? 3 : error.status === 409 ? 4 : 2;
}
