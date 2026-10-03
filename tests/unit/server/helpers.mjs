// Shared by the server tests: a real serve.mjs process on a free port with a
// throwaway campaign root, and a raw HTTP client.
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
// The operator's servers; a port the OS hands out is never one of them, the
// check only guards against a changed OS range.
const FORBIDDEN_PORTS = new Set([4173, 4185, 4186, 4187, 4190]);

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Starts serve.mjs with REALMCRAFT_ROOT=root; resolves to { port, stop }. */
export async function startServer(root) {
  let port = await freePort();
  while (FORBIDDEN_PORTS.has(port)) port = await freePort();
  const proc = spawn(process.execPath, ['serve.mjs'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', REALMCRAFT_ROOT: root },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    proc.once('exit', (code) => reject(new Error(`serve.mjs exited (${code})`)));
    proc.stdout.on('data', (d) => {
      if (String(d).includes('dev server')) resolve();
    });
  });
  return { port, stop: () => proc.kill() };
}

/** Raw request without URL normalisation; resolves to { status, headers, text, json }. */
export function http(port, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { Host: `localhost:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // not JSON
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
