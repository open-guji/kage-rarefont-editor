// SPDX-License-Identifier: GPL-3.0-only
// Copyright 2020, 2022, 2025  kurgm

const args = new URLSearchParams(window.location.hash.slice(1));

let host = args.get('host');
let ssl = args.get('ssl') !== 'false';
const name = args.get('name');
const related = args.get('related') || 'u3013';
const edittime = args.get('edittime');
const data = args.get('data') || '';
const summary = args.get('summary') || '';

export const gwHosts = [
  'glyphwiki.org',
  'en.glyphwiki.org',
  'ko.glyphwiki.org',
  'zhs.glyphwiki.org',
  'zht.glyphwiki.org',
  'non-ssl.glyphwiki.org',
];

// Local backend hosts (kage-server.mjs) are accepted as-is.
const localHostnames = ['localhost', '127.0.0.1', '[::1]'];
export const isLocalHost = (h: string) => localHostnames.includes(h.split(':')[0]);

if (!host && document.referrer) {
  try {
    const referrerUrl = new URL(document.referrer);
    if (gwHosts.includes(referrerUrl.host)) {
      host = referrerUrl.host;
      ssl = referrerUrl.protocol === 'https:';
    }
  } catch {
    // ignore invalid referrer
  }
}

if (!host && (gwHosts.includes(window.location.host) || isLocalHost(window.location.host))) {
  host = window.location.host;
  ssl = window.location.protocol === 'https:';
}

if (host && isLocalHost(host)) {
  // local kage-server runs without TLS
  ssl = false;
}

if (!host || (!gwHosts.includes(host) && !isLocalHost(host))) {
  host = 'glyphwiki.org';
}

const sanitizedArgs = {
  host,
  ssl,
  name,
  related,
  edittime,
  data,
  summary,
};

export default sanitizedArgs;
