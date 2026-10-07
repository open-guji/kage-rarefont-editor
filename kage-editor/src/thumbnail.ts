// SPDX-License-Identifier: GPL-3.0-only
// Glyph thumbnails rendered in the browser by the kage-cpp WASM engine.

import { getSource } from './glyphData';
import { engineReady, renderSvgWithPartsCpp } from './kageCpp';

const partNamesOf = (data: string) => {
  const out: string[] = [];
  for (const line of data.split('$')) {
    const f = line.split(':');
    if (f[0] === '99' && f[7]) {
      out.push(f[7]);
    }
  }
  return out;
};

// Sources of the glyph and of all parts it references, recursively.
const loadWithParts = async (name: string) => {
  const sources = new Map<string, string>();
  let level = [name];
  while (level.length) {
    const datas = await Promise.all(level.map((n) => getSource(n)));
    const next = new Set<string>();
    level.forEach((n, i) => {
      const data = datas[i] ?? '';
      sources.set(n, data);
      for (const part of partNamesOf(data)) {
        if (!sources.has(part)) {
          next.add(part);
        }
      }
    });
    level = [...next];
  }
  return sources;
};

const cache = new Map<string, Promise<string | null>>();

// data: URL of an SVG image, or null if the glyph or the engine is unavailable.
export const renderThumbnail = (name: string, pixel = 50): Promise<string | null> => {
  const key = `${pixel}|${name}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = (async () => {
      const [ready, sources] = await Promise.all([engineReady, loadWithParts(name)]);
      const data = sources.get(name);
      if (!ready || !data) {
        return null;
      }
      const svg = renderSvgWithPartsCpp(data, sources, pixel);
      return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
    })();
    promise.catch(() => cache.delete(key));
    cache.set(key, promise);
  }
  return promise;
};
