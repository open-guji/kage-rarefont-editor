#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// build-glyph-data.mjs — convert the GlyphWiki dump into static, sharded files
// that the editor reads directly (no server needed; deployable to any static host).
//
// Output layout (default kage-editor/public/glyph-data/):
//   meta.json            dump date, counts, format version
//   d.txt                manifest: first glyph name of each data chunk (sorted)
//   d/<first>.txt        data chunk: "name\tkage data" lines, sorted by name
//   n.txt                manifest: first name of each name-list chunk
//   n/<first>.txt        name-list chunk (for prefix search), one name per line
//   c/<0..1023>.txt      codepoint index, shard = fnv1a(hex) % 1024:
//                        "hex\t<names by name, space-separated>\t<names by related>"
//
// Chunk boundaries are kept stable across refreshes: an existing manifest is
// reused and only chunks that grew too large are split, so a dump refresh only
// rewrites the chunks that actually contain changed glyphs.
//
// Referenced old versions (e.g. "u963f@9") are taken from dump_all_versions.txt,
// so parts render exactly as they were referenced.
//
// Usage:
//   node tools/build-glyph-data.mjs [--dump glyphwiki-dump] [--out kage-editor/public/glyph-data]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const DUMP_DIR = path.resolve(argVal('--dump', path.join(__dirname, '..', 'glyphwiki-dump')));
const OUT_DIR = path.resolve(argVal('--out', path.join(__dirname, '..', 'kage-editor', 'public', 'glyph-data')));

const FORMAT_VERSION = 1;
const DATA_TARGET = 24 * 1024;   // bytes per data chunk when cutting fresh
const NAMES_TARGET = 64 * 1024;  // bytes per name-list chunk when cutting fresh
const CP_SHARDS = 1024;
const MAX_RESULTS = 3000;        // same cap as kage-server.mjs

// FNV-1a 32bit; must match kage-editor/src/glyphData.ts
export const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// ---------------------------------------------------------------- read dump
// psql-style table: " name<pad> | related<pad> | data"; streamed because
// dump_all_versions.txt is larger than V8's max string length.
function* dumpRows(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 24);
  let rest = '';
  let n;
  const parse = (line) => {
    const p1 = line.indexOf('|');
    if (p1 < 0) return null;
    const p2 = line.indexOf('|', p1 + 1);
    if (p2 < 0) return null;
    const name = line.slice(0, p1).trim().replace('\\@', '@');
    const related = line.slice(p1 + 1, p2).trim();
    const data = line.slice(p2 + 1).trim();
    if (!name || name === 'name' || name[0] === '-' || !data) return null;
    return [name, related, data];
  };
  try {
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      const lines = (rest + buf.toString('utf8', 0, n)).split('\n');
      rest = lines.pop();
      for (const line of lines) {
        const row = parse(line);
        if (row) yield row;
      }
    }
    const row = parse(rest);
    if (row) yield row;
  } finally {
    fs.closeSync(fd);
  }
}

const refsOf = (data) => {
  const out = [];
  for (const line of data.split('$')) {
    const f = line.split(':');
    if (f[0] === '99' && f[7]) out.push(f[7]);
  }
  return out;
};

const t0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

const newestFile = path.join(DUMP_DIR, 'dump_newest_only.txt');
const allFile = path.join(DUMP_DIR, 'dump_all_versions.txt');

const sources = new Map();   // name -> data (newest + referenced versions)
const names = [];            // newest names, dump order
const byName = new Map();    // hex -> names whose name is u<hex>...
const byRelated = new Map(); // hex -> names whose related anchor is u<hex>
const push = (map, key, value) => {
  let arr = map.get(key);
  if (!arr) map.set(key, arr = []);
  arr.push(value);
};

log(`reading ${newestFile}`);
for (const [name, related, data] of dumpRows(newestFile)) {
  sources.set(name, data);
  names.push(name);
  // same rules as kage-server.mjs
  const m = /^u([0-9a-f]{4,6})(?=$|[-@])/.exec(name);
  if (m) push(byName, m[1], name);
  if (related) {
    const rm = /u([0-9a-f]{4,6})(?=$|[-@])/.exec(related);
    if (rm && rm[1] !== '3013') push(byRelated, rm[1], name);
  }
}
log(`${names.length} glyphs`);

// ---------------------------------------------------------------- referenced versions
let wanted = new Set();
const collectWanted = (data) => {
  for (const r of refsOf(data)) {
    if (r.includes('@') && !sources.has(r)) wanted.add(r);
  }
};
for (const data of sources.values()) collectWanted(data);
let versionCount = 0;
for (let pass = 1; wanted.size > 0; pass++) {
  log(`pass ${pass}: looking up ${wanted.size} referenced versions in ${allFile}`);
  const current = wanted;
  wanted = new Set();
  const found = [];
  for (const [name, , data] of dumpRows(allFile)) {
    if (current.has(name) && !sources.has(name)) {
      sources.set(name, data);
      found.push(data);
      current.delete(name);
      versionCount++;
    }
  }
  if (current.size) log(`  ${current.size} referenced versions not found (left unresolved)`);
  for (const data of found) collectWanted(data);
}
log(`${versionCount} referenced versions added`);

// ---------------------------------------------------------------- chunking
const readManifest = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return null;
  }
};

// sorted: sorted keys; size(key) -> bytes. Returns array of chunks (arrays of keys).
const chunkSorted = (sorted, size, target, oldFirsts) => {
  const cutFresh = (keys) => {
    const out = [];
    let cur = [], acc = 0;
    for (const k of keys) {
      if (cur.length && acc >= target) {
        out.push(cur);
        cur = []; acc = 0;
      }
      cur.push(k);
      acc += size(k);
    }
    if (cur.length) out.push(cur);
    return out;
  };
  if (!oldFirsts || !oldFirsts.length) return cutFresh(sorted);
  // assign keys to existing ranges; chunk 0 also takes keys below its first
  const groups = oldFirsts.map(() => []);
  let gi = 0;
  for (const k of sorted) {
    while (gi + 1 < oldFirsts.length && oldFirsts[gi + 1] <= k) gi++;
    groups[gi].push(k);
  }
  const out = [];
  for (const g of groups) {
    if (!g.length) continue; // emptied range merges into its neighbour
    const bytes = g.reduce((a, k) => a + size(k), 0);
    out.push(...(bytes > target * 2 ? cutFresh(g) : [g]));
  }
  return out;
};

const writeIfChanged = (file, content) => {
  try {
    if (fs.readFileSync(file, 'utf8') === content) return false;
  } catch {
    // new file
  }
  fs.writeFileSync(file, content);
  return true;
};

const writeChunks = (dir, manifestFile, chunks, render) => {
  fs.mkdirSync(dir, { recursive: true });
  const firsts = chunks.map((c) => c[0]);
  const keep = new Set(firsts.map((f) => `${f}.txt`));
  let changed = 0;
  chunks.forEach((c) => {
    if (writeIfChanged(path.join(dir, `${c[0]}.txt`), render(c))) changed++;
  });
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!keep.has(f)) {
      fs.unlinkSync(path.join(dir, f));
      removed++;
    }
  }
  writeIfChanged(manifestFile, firsts.join('\n') + '\n');
  return { files: chunks.length, changed, removed };
};

fs.mkdirSync(OUT_DIR, { recursive: true });

// data chunks
{
  const keys = [...sources.keys()].sort();
  const size = (k) => k.length + sources.get(k).length + 2;
  const manifestFile = path.join(OUT_DIR, 'd.txt');
  const chunks = chunkSorted(keys, size, DATA_TARGET, readManifest(manifestFile));
  const r = writeChunks(path.join(OUT_DIR, 'd'), manifestFile, chunks,
    (c) => c.map((k) => `${k}\t${sources.get(k)}\n`).join(''));
  log(`data: ${r.files} chunks, ${r.changed} written, ${r.removed} removed`);
}

// name-list chunks (newest names only, like kage-server's namesList)
{
  const keys = [...names].sort();
  const size = (k) => k.length + 1;
  const manifestFile = path.join(OUT_DIR, 'n.txt');
  const chunks = chunkSorted(keys, size, NAMES_TARGET, readManifest(manifestFile));
  const r = writeChunks(path.join(OUT_DIR, 'n'), manifestFile, chunks,
    (c) => c.join('\n') + '\n');
  log(`names: ${r.files} chunks, ${r.changed} written, ${r.removed} removed`);
}

// codepoint index
{
  const dir = path.join(OUT_DIR, 'c');
  fs.mkdirSync(dir, { recursive: true });
  const shards = Array.from({ length: CP_SHARDS }, () => []);
  const hexes = new Set([...byName.keys(), ...byRelated.keys()]);
  for (const hex of [...hexes].sort()) {
    const a = (byName.get(hex) || []).slice(0, MAX_RESULTS);
    const b = (byRelated.get(hex) || []).slice(0, MAX_RESULTS);
    shards[fnv1a(hex) % CP_SHARDS].push(`${hex}\t${a.join(' ')}\t${b.join(' ')}\n`);
  }
  let changed = 0;
  shards.forEach((lines, i) => {
    if (writeIfChanged(path.join(dir, `${i}.txt`), lines.join(''))) changed++;
  });
  log(`codepoints: ${hexes.size} in ${CP_SHARDS} shards, ${changed} written`);
}

// meta + license
const dumpDate = fs.statSync(newestFile).mtime.toISOString().slice(0, 10);
writeIfChanged(path.join(OUT_DIR, 'meta.json'), JSON.stringify({
  format: FORMAT_VERSION,
  dumpDate,
  glyphs: names.length,
  versions: versionCount,
  cpShards: CP_SHARDS,
  maxResults: MAX_RESULTS,
}, null, 2) + '\n');
const licenseSrc = path.join(DUMP_DIR, 'LICENSE.txt');
if (fs.existsSync(licenseSrc)) {
  fs.copyFileSync(licenseSrc, path.join(OUT_DIR, 'GLYPHWIKI-LICENSE.txt'));
}
log(`done -> ${OUT_DIR} (dump date ${dumpDate})`);
