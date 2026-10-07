// SPDX-License-Identifier: GPL-3.0-only
// Integration of the kage-cpp (Bezier-optimised) engine, compiled to WASM,
// into kage-editor. Replaces the rendering path of @kurgm/kage-engine with
// the C++ engine while keeping stroke separation for selection/dragging.
//
// Until the WASM module finishes loading, the legacy JS engine is used, so
// the editor works even if the engine files are missing.

import memoizeOne from 'memoize-one';

import { KShotai } from '@kurgm/kage-engine';
import { Glyph, unparseGlyphLine } from './kageUtils/glyph';

export interface ContourPath {
  d: string;
  closed: boolean;
}

export type StrokePaths = ContourPath[];

interface KageEngineInstance {
  setDbSearch(cb: (name: string) => string): void;
  pushBuhin(name: string, data: string): void;
  setBuhin(name: string, data: string): void;
  setFont(font: number): void;
  checkGlyph(name: string): number;
  setNotDefGlyph(data: string): void;
  renderSvg(data: string, pixel: number): string;
  renderSvgByName(name: string, pixel: number): string;
  renderStrokePaths(data: string): string;
  renderPaths(data: string): string;
}

interface KageModule {
  KageEngine: new (font: number) => KageEngineInstance;
}

type CreateFn = () => Promise<KageModule>;

let modulePromise: Promise<KageModule> | null = null;
let engine: KageEngineInstance | null = null;
let readyResolve: ((ok: boolean) => void) | null = null;
export const engineReady = new Promise<boolean>((resolve) => { readyResolve = resolve; });

// Called for parts missing from the local database (same contract as the
// JS engine's buhin.search fallback).
let dbSearchCallback: (name: string) => string = () => '';

// Sources synced from the editor's buhinMap, name -> kage data.
const pushedSources = new Map<string, string>();

export const loadKageCpp = async (): Promise<void> => {
  if (modulePromise) {
    await modulePromise;
    return;
  }
  modulePromise = (async () => {
    const scriptUrl = new URL('kage-wasm/kage.js', document.baseURI).href;
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`failed to load ${scriptUrl}`));
      document.head.appendChild(script);
    });
    const create = (window as unknown as { createKageModule?: CreateFn }).createKageModule;
    if (!create) {
      throw new Error('createKageModule not found; kage-wasm/kage.js missing?');
    }
    const Module = await create();
    engine = new Module.KageEngine(0);
    engine.setDbSearch((name: string) => {
      const local = pushedSources.get(name);
      if (typeof local !== 'undefined') {
        return local;
      }
      return dbSearchCallback(name) || '';
    });
    return Module;
  })();
  modulePromise
    .then(() => readyResolve?.(true))
    .catch((err) => {
      console.warn('kage-cpp WASM engine unavailable, falling back to JS engine', err);
      engine = null;
      readyResolve?.(false);
    });
  await modulePromise;
};

export const isKageCppReady = () => engine !== null;

export const setKageCppDbSearch = (cb: (name: string) => string) => {
  dbSearchCallback = cb;
};

let lastBuhinMap: Map<string, string> | null = null;
const syncBuhinMap = (buhinMap: Map<string, string>) => {
  if (!engine || buhinMap === lastBuhinMap) {
    return;
  }
  lastBuhinMap = buhinMap;
  buhinMap.forEach((source, name) => {
    if (pushedSources.get(name) !== source) {
      pushedSources.set(name, source);
      engine!.setBuhin(name, source);
    }
  });
};

let lastShotai: KShotai | null = null;
const syncShotai = (shotai: KShotai) => {
  if (!engine || shotai === lastShotai) {
    return;
  }
  lastShotai = shotai;
  engine.setFont(shotai === KShotai.kGothic ? 1 : 0);
};

const renderSeparated = (glyph: Glyph, buhinMap: Map<string, string>, shotai: KShotai): StrokePaths[] => {
  syncBuhinMap(buhinMap);
  syncShotai(shotai);
  if (!engine) {
    return [];
  }
  const data = glyph.map(unparseGlyphLine).join('$');
  const json = engine.renderStrokePaths(data);
  const parsed: [string, boolean][][] = JSON.parse(json);
  return parsed.map((contours) => contours.map(([d, closed]) => ({ d, closed })));
};

const isSameArgs = (
  [glyph1, map1, shotai1]: Parameters<typeof renderSeparated>,
  [glyph2, map2, shotai2]: Parameters<typeof renderSeparated>
) => (
  map1 === map2 &&
  shotai1 === shotai2 &&
  glyph1.length === glyph2.length &&
  glyph1.every((gLine1, index) => gLine1 === glyph2[index])
);

export const makeGlyphSeparatedCpp = memoizeOne(renderSeparated, isSameArgs);
export const makeGlyphSeparatedForSubmitCpp = memoizeOne(renderSeparated, isSameArgs);

// Full SVG string for the export feature. pixel = width/height in px.
export const renderSvgCpp = (glyph: Glyph, buhinMap: Map<string, string>, shotai: KShotai, pixel: number): string => {
  syncBuhinMap(buhinMap);
  syncShotai(shotai);
  if (!engine) {
    return '';
  }
  const data = glyph.map(unparseGlyphLine).join('$');
  return engine.renderSvg(data, pixel);
};
