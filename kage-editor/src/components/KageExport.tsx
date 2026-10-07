// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2020, 2022, 2023, 2025  kurgm

import { useEffect } from 'react';

import args from '../args';

import { useAppSelector } from '../hooks';
import { submitGlyphSelector } from '../selectors/submitGlyph';
import { unparseGlyph } from '../kageUtils/glyph';

// On "finish editing" (button or mod+s), download the glyph's KAGE source
// as a text file instead of submitting it to GlyphWiki.
const KageExport = () => {
  const exitEvent = useAppSelector((state) => state.exitEvent);
  const glyph = useAppSelector(submitGlyphSelector);
  useEffect(() => {
    if (!exitEvent) {
      return;
    }
    const blob = new Blob([unparseGlyph(glyph)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (args.name || 'sandbox').replace(/[^\w.\-@]/g, '_');
    a.href = url;
    a.download = `${safeName}.kage.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    // only on a new exit event, not on every glyph change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitEvent]);
  return null;
};

export default KageExport;
