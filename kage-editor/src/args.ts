// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2020, 2022, 2025  kurgm

const args = new URLSearchParams(window.location.hash.slice(1));

const name = args.get('name');
const data = args.get('data') || '';
const lang = args.get('lang');

const sanitizedArgs = {
  name,
  data,
  lang,
};

export default sanitizedArgs;
