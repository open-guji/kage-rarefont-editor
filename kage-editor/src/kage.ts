// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2020, 2022, 2025  kurgm

import memoizeOne from 'memoize-one';

import { Kage, Polygons, KShotai } from '@kurgm/kage-engine';
import { Glyph, unparseGlyphLine } from './kageUtils/glyph';
import { StretchParam } from './kageUtils/stretchparam';

import store from './store';
import { editorActions } from './actions/editor';

import { getSource } from './callapi';

import {
  isKageCppReady,
  setKageCppDbSearch,
  makeGlyphSeparatedCpp,
  makeGlyphSeparatedForSubmitCpp,
  StrokePaths,
} from './kageCpp';

export { KShotai };

// Unified rendered geometry for one stroke: either the legacy polyline
// representation (JS engine) or bezier path data (kage-cpp WASM engine).
export type RenderedStroke = { polygons?: Polygons, strokePaths?: StrokePaths };

const kage_ = new Kage();

export const getKage = (buhinMap: Map<string, string>, fallback?: (name: string) => string | undefined | void, shotai?: KShotai): Kage => {
  kage_.kBuhin.search = (name) => {
    let result = buhinMap.get(name);
    if (typeof result === 'undefined') {
      result = fallback?.(name) || '';
    }
    return result;
  };
  if (typeof shotai !== 'undefined') {
    kage_.kShotai = shotai;
  }
  return kage_;
};

const waiting = new Set<string>();
const loadAbsentBuhin = (name: string) => {
  if (waiting.has(name)) {
    return;
  }
  waiting.add(name);
  getSource(name)
    .then((source) => {
      if (typeof source !== 'string') {
        throw new Error(`failed to get buhin source of ${name}`);
      }
      const stretchMatch = /^0:1:0:(-?\d+):(-?\d+):(-?\d+):(-?\d+)(?=$|\$)/.exec(source);
      if (stretchMatch) {
        const params: StretchParam = [
          +stretchMatch[1] || 0,
          +stretchMatch[2] || 0,
          +stretchMatch[3] || 0,
          +stretchMatch[4] || 0,
        ];
        store.dispatch(editorActions.loadedStretchParam([name, params]));
      }
      store.dispatch(editorActions.loadedBuhin([name, source]));
      waiting.delete(name);
    })
    .catch((err) => console.error(err));
};

// Wire the WASM engine's missing-part lookup through the same async loader.
setKageCppDbSearch((name) => {
  loadAbsentBuhin(name);
  return '';
});

const filteredGlyphIsEqual = (glyph1: Glyph, glyph2: Glyph) => (
  glyph1.length === glyph2.length &&
  glyph1.every((gLine1, index) => (
    gLine1 === glyph2[index]
  ))
);

const makeGlyphSeparated_ = memoizeOne((glyph: Glyph, map: Map<string, string>, shotai: KShotai): Polygons[] => {
  const data = glyph.map(unparseGlyphLine);
  const result = getKage(map, loadAbsentBuhin, shotai).makeGlyphSeparated(data);
  return result;
}, ([glyph1, map1, shotai1], [glyph2, map2, shotai2]) => (
  map1 === map2 &&
  shotai1 === shotai2 &&
  filteredGlyphIsEqual(glyph1, glyph2)
));

const makeGlyphSeparatedFactory = (
  isEqual?: (newArgs: Parameters<typeof makeGlyphSeparated_>, lastArgs: Parameters<typeof makeGlyphSeparated_>) => boolean
) => memoizeOne((glyph: Glyph, map: Map<string, string>, shotai: KShotai): Polygons[] => {
  return makeGlyphSeparated_(glyph, map, shotai);
}, isEqual);

const makeGlyphSeparatedJs = makeGlyphSeparatedFactory();
const makeGlyphSeparatedForSubmitJs = makeGlyphSeparatedFactory(
  ([glyph1, map1, shotai1], [glyph2, map2, shotai2]) => (
    map1 === map2 &&
    shotai1 === shotai2 &&
    filteredGlyphIsEqual(glyph1, glyph2)
  )
);

const toRendered = (polygons: Polygons[]): RenderedStroke[] =>
  polygons.map((p) => ({ polygons: p }));

const makeGlyphSeparatedUnified = (
  cpp: typeof makeGlyphSeparatedCpp,
  js: typeof makeGlyphSeparatedJs,
): ((glyph: Glyph, map: Map<string, string>, shotai: KShotai) => RenderedStroke[]) =>
  (glyph, map, shotai) => {
    if (isKageCppReady()) {
      const paths = cpp(glyph, map, shotai);
      if (paths.length > 0 || glyph.length === 0) {
        return paths.map((strokePaths) => ({ strokePaths }));
      }
    }
    return toRendered(js(glyph, map, shotai));
  };

export const makeGlyphSeparated = makeGlyphSeparatedUnified(makeGlyphSeparatedCpp, makeGlyphSeparatedJs);
export const makeGlyphSeparatedForSubmit = makeGlyphSeparatedUnified(makeGlyphSeparatedForSubmitCpp, makeGlyphSeparatedForSubmitJs);

// Polyline geometry for hit-testing (area selection).  Curve rendering is a
// visual concern only; the legacy JS engine output is fine here and stays
// synchronous.
export const makeGlyphSeparatedPolygons = makeGlyphSeparatedJs;
