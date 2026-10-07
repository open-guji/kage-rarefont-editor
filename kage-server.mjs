#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// kage-server.mjs — local GlyphWiki backend built from the official dump.
//
// Replaces the remote proxy API used by kage-editor:
//   GET /get_source.cgi?name=<name>      -> data=<kage source>
//   GET /search4ge.cgi?query=<q>         -> data=<tab-separated names> | tooshort
//   GET /get_candidate.cgi?name=<name>   -> data=
//   GET /glyph/<name>.<n>px.svg          -> rendered SVG thumbnail (kage-cpp engine)
//   GET /<static>                        -> serves the editor build directory
//
// Usage:
//   node kage-server.mjs [--port 8788] [--dump glyphwiki-dump/dump_newest_only.txt]
//                        [--build kage-editor/build] [--wasm wasm-build/kage-node.js]

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- argv
const argv = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const PORT = Number(argVal('--port', '8788'));
const DUMP_FILE = path.resolve(argVal('--dump',
  path.join(__dirname, 'glyphwiki-dump', 'dump_newest_only.txt')));
const BUILD_DIR = path.resolve(argVal('--build',
  path.join(__dirname, 'kage-editor', 'build')));
const WASM_JS = path.resolve(argVal('--wasm',
  path.join(__dirname, 'wasm-build', 'kage-node.js')));

// ---------------------------------------------------------------- load dump
// Line format: " name<pad> | related<pad> | data"
const sources = new Map();   // name -> kage source data
const relatedMap = new Map(); // name -> related string
const namesList = [];         // all names (for prefix scan)
// codepoint -> names[]  (u6f22, u6f22-07, u6f22-var-001, u6f22@3 ...)
const codepointIndex = new Map();
// codepoint -> names[] whose *related* anchor is that codepoint (GlyphWiki
// cross-links; matches online search4ge output, e.g. akr-/dkw-/jgj- names)
const relatedIndex = new Map();

const loadStart = Date.now();
console.log(`[server] loading ${DUMP_FILE} ...`);
const raw = fs.readFileSync(DUMP_FILE, 'utf8');
const lines = raw.split('\n');
raw.length; // allow GC of the big string
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const p1 = line.indexOf('|');
  if (p1 < 0) continue;
  const p2 = line.indexOf('|', p1 + 1);
  if (p2 < 0) continue;
  const name = line.slice(0, p1).trim();
  const related = line.slice(p1 + 1, p2).trim();
  const data = line.slice(p2 + 1).trim();
  if (!name || name === 'name' || name[0] === '-') continue;
  if (!data) continue;
  // Strip version suffix for lookup, but keep the full name searchable.
  sources.set(name, data);
  if (related) relatedMap.set(name, related);
  namesList.push(name);
  const m = /^u([0-9a-f]{4,6})(?=$|[-@])/.exec(name);
  if (m) {
    const cp = m[1];
    let arr = codepointIndex.get(cp);
    if (!arr) { arr = []; codepointIndex.set(cp, arr); }
    arr.push(name);
  }
  if (related) {
    const rm = /u([0-9a-f]{4,6})(?=$|[-@])/.exec(related);
    if (rm && rm[1] !== '3013') {
      let arr = relatedIndex.get(rm[1]);
      if (!arr) { arr = []; relatedIndex.set(rm[1], arr); }
      arr.push(name);
    }
  }
}
lines.length = 0;
console.log(`[server] loaded ${sources.size} glyphs in ${((Date.now() - loadStart) / 1000).toFixed(1)}s`);

// ---------------------------------------------------------------- engine
let engine = null;
async function initEngine() {
  const createKageModule = require(WASM_JS);
  const Module = await createKageModule();
  const mincho = new Module.KageEngine(0);
  const gothic = new Module.KageEngine(1);
  const setDb = (e) => e.setDbSearch((name) => sources.get(name) ?? '');
  setDb(mincho);
  setDb(gothic);
  engine = { mincho, gothic };
  console.log('[server] kage-cpp WASM engine ready');
}

// LRU-ish thumbnail cache
const thumbCache = new Map();
const THUMB_MAX = 4000;
function renderThumb(name, px, font) {
  const key = `${font}|${px}|${name}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  if (!engine) return null;
  const src = sources.get(name) || sources.get(name.split('@')[0]);
  if (!src) return null;
  const e = font === 'gothic' ? engine.gothic : engine.mincho;
  let svg;
  try {
    svg = e.renderSvg(src, px);
  } catch {
    return null;
  }
  if (!svg) return null;
  if (thumbCache.size >= THUMB_MAX) {
    const first = thumbCache.keys().next().value;
    thumbCache.delete(first);
  }
  thumbCache.set(key, svg);
  return svg;
}

// ---------------------------------------------------------------- search
const MAX_RESULTS = 3000;
function doSearch(query) {
  if (!query) return 'nodata';
  const cp = query.codePointAt(0);
  // Single (or short) non-ASCII: treat as character search by codepoint.
  if (cp > 0x2000 && [...query].length <= 2) {
    const hex = cp.toString(16);
    const byName = codepointIndex.get(hex) || codepointIndex.get(hex.padStart(6, '0')) || [];
    const byRelated = relatedIndex.get(hex) || relatedIndex.get(hex.padStart(6, '0')) || [];
    const seen = new Set();
    const merged = [];
    for (const n of byName) { if (!seen.has(n)) { seen.add(n); merged.push(n); } }
    for (const n of byRelated) { if (!seen.has(n)) { seen.add(n); merged.push(n); } }
    if (merged.length) return merged.slice(0, MAX_RESULTS).join('\t');
    const prefix = `u${hex}`;
    return namesList.filter((n) => n.startsWith(prefix)).slice(0, MAX_RESULTS).join('\t') || 'nodata';
  }
  const q = query.toLowerCase();
  if (q.length < 5) return 'tooshort';
  const hits = [];
  const seen = new Set();
  for (const n of namesList) {
    if (n.length >= q.length && n.slice(0, q.length).toLowerCase() === q) {
      hits.push(n);
      seen.add(n);
      if (hits.length >= MAX_RESULTS) break;
    }
  }
  // When the query itself is a unicode glyph name (u6f22...), also merge
  // glyphs whose related anchor is the same codepoint (like online search).
  const qm = /^u([0-9a-f]{4,6})(?=$|[-@])/.exec(q);
  if (qm) {
    for (const n of relatedIndex.get(qm[1]) || []) {
      if (!seen.has(n)) { seen.add(n); hits.push(n); }
    }
  }
  if (hits.length) return hits.slice(0, MAX_RESULTS).join('\t');
  // fallback: substring scan over the name list (bounded)
  const sub = [];
  for (const n of namesList) {
    if (n.toLowerCase().includes(q)) {
      sub.push(n);
      if (sub.length >= MAX_RESULTS) break;
    }
  }
  return sub.length ? sub.join('\t') : 'nodata';
}

// ---------------------------------------------------------------- http
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(BUILD_DIR, p));
  if (!file.startsWith(BUILD_DIR)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'access-control-allow-origin': '*',
    });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const p = u.pathname;

  if (p === '/get_source.cgi') {
    const name = u.searchParams.get('name') || '';
    const base = name.split('@')[0];
    const data = sources.get(name) ?? sources.get(base);
    res.writeHead(200, {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      'access-control-allow-origin': '*',
    });
    res.end(data !== undefined ? `data=${encodeURIComponent(data)}` : 'data=');
    return;
  }
  if (p === '/search4ge.cgi') {
    const query = u.searchParams.get('query') || '';
    res.writeHead(200, {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      'access-control-allow-origin': '*',
    });
    res.end(`data=${encodeURIComponent(doSearch(query))}`);
    return;
  }
  if (p === '/get_candidate.cgi') {
    res.writeHead(200, {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      'access-control-allow-origin': '*',
    });
    res.end('data=');
    return;
  }
  // /glyph/<name>.<px>px.svg  (and .png path kept for compatibility -> svg)
  const gm = /^\/glyph\/(.+)\.(\d+)px\.(svg|png)$/.exec(p);
  if (gm) {
    const name = decodeURIComponent(gm[1]);
    const px = Number(gm[2]) || 50;
    const font = u.searchParams.get('font') || 'mincho';
    const svg = renderThumb(name, px, font);
    if (svg) {
      res.writeHead(200, {
        'content-type': 'image/svg+xml; charset=utf-8',
        'cache-control': 'public, max-age=86400',
        'access-control-allow-origin': '*',
      });
      res.end(svg);
    } else {
      res.writeHead(404); res.end('not rendered');
    }
    return;
  }
  if (p.startsWith('/glyph/')) { serveStatic(res, p); return; }

  serveStatic(res, p);
});

await initEngine();
server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] static build dir: ${BUILD_DIR}`);
});
