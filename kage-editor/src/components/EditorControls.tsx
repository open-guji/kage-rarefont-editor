// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2020, 2025  kurgm

import clsx from 'clsx/lite';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppDispatch, useAppSelector } from '../hooks';
import { editorActions } from '../actions/editor';
import { selectActions } from '../actions/select';
import { undoActions } from '../actions/undo';
import { displayActions } from '../actions/display';

import { exportGlyphSvg, DEFAULT_EXPORT_SIZE } from '../svgExport';
import { isKageCppReady, engineReady } from '../kageCpp';
import args from '../args';

import SelectionInfo from './SelectionInfo';
import SubmitPreview from './SubmitPreview';

import styles from './EditorControls.module.css';

interface EditorControlsProps {
  className?: string;
}

const EditorControls = (props: EditorControlsProps) => {
  const glyph = useAppSelector((state) => state.glyph);
  const buhinMap = useAppSelector((state) => state.buhinMap);
  const shotai = useAppSelector((state) => state.shotai);
  const selection = useAppSelector((state) => state.selection);
  const clipboard = useAppSelector((state) => state.clipboard);
  const freehandMode = useAppSelector((state) => state.freehandMode);
  const undoLength = useAppSelector((state) => state.undoStacks.undo.length);
  const redoLength = useAppSelector((state) => state.undoStacks.redo.length);
  const [exportPixel, setExportPixel] = useState(DEFAULT_EXPORT_SIZE);
  const [exportMsg, setExportMsg] = useState('');
  const [kageReady, setKageReady] = useState(isKageCppReady());
  useEffect(() => {
    if (kageReady) {
      return;
    }
    engineReady.then(() => setKageReady(isKageCppReady()));
  }, [kageReady]);

  const undoDisabled = undoLength === 0;
  const redoDisabled = redoLength === 0;
  const pasteDisabled = clipboard.length === 0;
  const decomposeDisabled = !selection.some((index) => glyph[index].value[0] === 99);

  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const undo = useCallback(() => {
    dispatch(undoActions.undo());
  }, [dispatch]);
  const redo = useCallback(() => {
    dispatch(undoActions.redo());
  }, [dispatch]);
  const selectAll = useCallback(() => {
    dispatch(selectActions.selectAll());
  }, [dispatch]);
  const selectDeselected = useCallback(() => {
    dispatch(selectActions.selectDeselected());
  }, [dispatch]);
  const copy = useCallback(() => {
    dispatch(editorActions.copy());
  }, [dispatch]);
  const paste = useCallback(() => {
    dispatch(editorActions.paste());
  }, [dispatch]);
  const cut = useCallback(() => {
    dispatch(editorActions.cut());
  }, [dispatch]);
  const toggleFreehand = useCallback(() => {
    dispatch(editorActions.toggleFreehand());
  }, [dispatch]);
  const decompose = useCallback(() => {
    dispatch(editorActions.decomposeSelected());
  }, [dispatch]);
  const options = useCallback(() => {
    dispatch(displayActions.openOptionModal());
  }, [dispatch]);
  const finishEdit = useCallback((evt: React.MouseEvent) => {
    dispatch(editorActions.finishEdit(evt.nativeEvent));
  }, [dispatch]);
  const exportSvg = useCallback(() => {
    let msg: string;
    try {
      const ok = exportGlyphSvg(glyph, buhinMap, shotai, args.name || 'sandbox', exportPixel);
      msg = ok
        ? t('export done', { size: `${exportPixel}x${exportPixel}` })
        : t('export engine not ready');
    } catch (e) {
      msg = `${t('export failed')}: ${String(e)}`;
    }
    setExportMsg(msg);
  }, [glyph, buhinMap, shotai, exportPixel, t]);
  return (
    <div className={clsx(styles.editorControls, props.className)}>
      <SelectionInfo className={styles.selectControl} />
      <div className={styles.controlButtons}>
        <button
          disabled={undoDisabled}
          onClick={undo}
        >
          {t('undo')}
        </button>
        <button
          disabled={redoDisabled}
          onClick={redo}
        >
          {t('redo')}
        </button>
        <button
          disabled={glyph.length === 0}
          onClick={selectAll}
        >
          {t('select all')}
        </button>
        <button
          disabled={glyph.length === 0}
          onClick={selectDeselected}
        >
          {t('invert selection')}
        </button>
        <button
          disabled={selection.length === 0}
          onClick={copy}
        >
          {t('copy')}
        </button>
        <button
          disabled={pasteDisabled}
          onClick={paste}
        >
          {t('paste')}
        </button>
        <button
          disabled={selection.length === 0}
          onClick={cut}
        >
          {t('cut')}
        </button>
        <button
          onClick={toggleFreehand}
        >
          {freehandMode ? t('end freehand') : t('start freehand')}
        </button>
        <button
          disabled={decomposeDisabled}
          onClick={decompose}
        >
          {t('decompose')}
        </button>
        <button
          onClick={options}
        >
          {t('options')}
        </button>
      </div>
      <div className={styles.preview}>
        <SubmitPreview className={styles.previewThumbnail} />
        <select
          aria-label={t('export size')}
          value={exportPixel}
          onChange={(evt) => setExportPixel(+evt.target.value)}
        >
          <option value={500}>500×500</option>
          <option value={1000}>1000×1000</option>
          <option value={2000}>2000×2000</option>
        </select>
        <button
          disabled={glyph.length === 0 || !kageReady}
          onClick={exportSvg}
        >
          {t('export svg')}
        </button>
        {exportMsg && <span className={styles.exportMsg}>{exportMsg}</span>}
        <button onClick={finishEdit}>
          {t('finish edit')}
        </button>
      </div>
    </div>
  );
};

export default EditorControls;
