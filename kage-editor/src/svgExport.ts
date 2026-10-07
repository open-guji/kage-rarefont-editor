// SPDX-License-Identifier: GPL-3.0-only
// SVG export via the kage-cpp (bezier) engine.

import { Glyph } from './kageUtils/glyph';
import { KShotai } from '@kurgm/kage-engine';

import { renderSvgCpp, isKageCppReady } from './kageCpp';

export const DEFAULT_EXPORT_SIZE = 1000;

export const exportGlyphSvg = (
  glyph: Glyph,
  buhinMap: Map<string, string>,
  shotai: KShotai,
  glyphName: string,
  pixel = DEFAULT_EXPORT_SIZE,
): boolean => {
  if (!isKageCppReady()) {
    return false;
  }
  const svg = renderSvgCpp(glyph, buhinMap, shotai, pixel);
  if (!svg) {
    return false;
  }
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (glyphName || 'glyph').replace(/[^\w.\-@]/g, '_');
  a.href = url;
  a.download = `${safeName}_${pixel}x${pixel}.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
};
