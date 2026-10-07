// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2020, 2023, 2025  kurgm

import { useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';

import GlyphArea from './components/GlyphArea';
import EditorControls from './components/EditorControls';
import PartsSearch from './components/PartsSearch'
import SubmitForm from './components/SubmitForm';
import OptionModal from './components/OptionModal';

import { useShortcuts } from './shortcuts';
import { loadKageCpp, engineReady } from './kageCpp';

import styles from './App.module.css';

function App() {
  const { i18n } = useTranslation();
  useShortcuts();
  const [engineVersion, bumpEngine] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    loadKageCpp().catch(() => { /* fallback to JS engine */ });
    engineReady.then((ok) => { if (ok) bumpEngine(); });
  }, []);
  return (
    <div className={styles.App} lang={i18n.language} data-engine={engineVersion}>
      <GlyphArea className={styles.glyphArea} />
      <EditorControls className={styles.editorControls} />
      <PartsSearch className={styles.partsSearchArea} />
      <SubmitForm />
      <OptionModal />
    </div>
  );
}

export default App;
