// Response helpers and the guard every writing endpoint passes first.
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { ALLOWED_ORIGINS, LOOPBACK_ADDRS, MAX_BODY, MIME } from './config.mjs';

export function sendJson(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

/** An issue in the kernel's shape, so the board labels server refusals like kernel ones. */
export const serverIssue = (code, message, { path = '', params } = {}) => ({ code, severity: 'error', path, message, ...(params ? { params } : {}) });

/** Error answer { error, issues }; `error` keeps the older readers working. */
export function sendIssues(res, status, issues, extra = {}) {
  sendJson(res, status, { error: issues[0]?.message ?? 'error', issues }, extra);
}

const refuse = (res, status, code, message, params, extra) => sendIssues(res, status, [serverIssue(code, message, { params })], extra);

export function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

export function forbidden(res) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('403 Forbidden');
}

/** Parsed JSON of a file, null when it is missing or unreadable. */
export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Campaign files go out uncached, so the board never shows a stale turn. */
export async function sendFile(res, path) {
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    notFound(res);
  }
}

function readBody(req, res) {
  return new Promise((done) => {
    const declared = Number(req.headers['content-length']);
    const tooLarge = () => {
      refuse(res, 413, 'server.too_large', 'body too large', { max: MAX_BODY }, { Connection: 'close' });
      req.resume();
      done(null);
    };
    if (declared > MAX_BODY) return tooLarge();
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      if (res.writableEnded) return;
      size += c.length;
      if (size > MAX_BODY) return tooLarge();
      chunks.push(c);
    });
    req.on('end', () => {
      if (!res.writableEnded) done(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => done(null));
  });
}

/**
 * The JSON object body of a POST from the operator's own browser, or null
 * once an error response went out. Order of the checks: method, loopback
 * peer, fetch metadata, origin, content type, body size, JSON, object.
 */
export async function readPostJson(req, res) {
  const no = (status, code, message, params, extra) => {
    refuse(res, status, code, message, params, extra);
    return null;
  };
  if (req.method !== 'POST') return no(405, 'server.method', 'POST only', undefined, { Allow: 'POST' });
  if (!LOOPBACK_ADDRS.has(req.socket.remoteAddress)) return no(403, 'server.forbidden', 'loopback only', { reason: 'loopback-only' });
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return no(403, 'server.forbidden', 'cross-site request', { reason: 'cross-site' });
  const origin = req.headers.origin;
  if (origin !== undefined && !ALLOWED_ORIGINS.has(String(origin).toLowerCase())) return no(403, 'server.forbidden', 'foreign origin', { reason: 'foreign-origin' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return no(415, 'server.media_type', 'application/json required');
  }
  const raw = await readBody(req, res);
  if (raw === null) return null;
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return no(400, 'server.json', 'invalid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return no(400, 'server.json', 'body must be an object', { reason: 'not-object' });
  return body;
}
