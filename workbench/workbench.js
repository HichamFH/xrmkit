'use strict';

// append / replaceChildren tolérants : aplatissent les tableaux et ignorent null / false
// (sinon le DOM les convertit en texte « null » ou « [object HTMLElement] »).
for (const method of ['append', 'replaceChildren']) {
  const native = Element.prototype[method];
  Element.prototype[method] = function (...kids) {
    return native.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false));
  };
}

// =====================================================================
// Utilitaires
// =====================================================================
const $ = (s, r = document) => r.querySelector(s);
const TR_ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt']);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null && !k.startsWith('on')) e.setAttribute(k, v === true ? '' : (TR_ATTRS.has(k) ? T(String(v)) : v));
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(T(String(kid))));
  return e;
};

const tabId = Number(new URLSearchParams(location.search).get('tabId'));
const state = { callerId: null, callerName: null, pendingQuery: null, orgInfo: null };

function call(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { xrmkit: true, action, payload }, (res) => {
      if (chrome.runtime.lastError) {
        return reject(new Error('Onglet Dynamics injoignable : rechargez-le (F5) puis relancez le Workbench depuis le popup.'));
      }
      if (!res || !res.ok) return reject(new Error((res && res.error) || 'Erreur inconnue'));
      resolve(res.data);
    });
  });
}
// Requêtes Web API : déduplication des GET simultanés + cache court (60 s) pour les métadonnées ;
// toute écriture vide le cache.
const _inflight = new Map();
const _qcache = new Map();
const QCACHE_RE = /^(EntityDefinitions|GlobalOptionSetDefinitions|solutions\?\$select|WhoAmI|RetrieveCurrentOrganization|systemusers\([^)]*\)\?\$select)/;
const QCACHE_TTL = 60000;
function q(path, opts = {}) {
  const isGet = !opts.method || opts.method === 'GET';
  if (!isGet) { _qcache.clear(); return call('webapi', { path, callerId: state.callerId, ...opts }); }
  const key = `${state.callerId || ''}|${path}|${JSON.stringify(opts)}`;
  const hit = _qcache.get(key);
  if (hit && Date.now() - hit.t < QCACHE_TTL) return Promise.resolve(hit.v);
  if (_inflight.has(key)) return _inflight.get(key);
  const p = call('webapi', { path, callerId: state.callerId, ...opts }).then((v) => {
    if (QCACHE_RE.test(path)) _qcache.set(key, { v, t: Date.now() });
    return v;
  }).finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}
q.clearCache = () => { _qcache.clear(); if (typeof _entityCache !== 'undefined') _entityCache = null; };

// Chargement différé de scripts (onglets lourds)
const _scripts = new Map();
const loadScript = (src) => {
  if (!_scripts.has(src)) _scripts.set(src, new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('Chargement impossible : ' + src)); document.head.append(el); }));
  return _scripts.get(src);
};
const rows = async (path, opts = {}) => (await q(path, opts)).value;
const esc = (s) => String(s).replace(/'/g, "''");
const label = (l) => (l && l.UserLocalizedLabel && l.UserLocalizedLabel.Label) || (l && l.LocalizedLabels && l.LocalizedLabels[0] && l.LocalizedLabels[0].Label) || '';

function flatten(row, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.includes('@')) continue;
    const fv = row[k + '@OData.Community.Display.V1.FormattedValue'];
    const key = prefix + k;
    if (Array.isArray(v)) out[key] = JSON.stringify(v);
    else if (v && typeof v === 'object') Object.assign(out, flatten(v, key + '.'));
    else out[key] = fv !== undefined ? `${v ?? ''} (${fv})` : v;
  }
  return out;
}

const fmt = (v) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
};

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(data, cols) {
  const e = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + [cols.map(e).join(';'), ...data.map((r) => cols.map((c) => e(r[c])).join(';'))].join('\r\n');
}

function dataTable(data, { onRow, empty = 'Aucun résultat.', exportName = 'export' } = {}) {
  const wrap = h('div');
  if (!data.length) { wrap.append(h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, '∅'), empty)); return wrap; }
  const cols = [...new Set(data.flatMap((r) => Object.keys(r)))];
  let sortCol = null, asc = true, filter = '', ft = null;
  const info = h('span', { class: 'badge' });
  const table = h('table');
  const bar = h('div', { class: 'tablebar' },
    h('input', { type: 'search', placeholder: 'Filtrer…', oninput: (e) => { clearTimeout(ft); const v = e.target.value.toLowerCase(); ft = setTimeout(() => { filter = v; draw(); }, 150); } }),
    info,
    h('label', { class: 'inline' }, h('input', { type: 'checkbox', onchange: (e) => table.classList.toggle('wrap', e.target.checked) }), 'Retour à la ligne'),
    h('button', { onclick: () => download(exportName + '.csv', toCsv(data, cols), 'text/csv;charset=utf-8') }, 'Export CSV'),
    h('button', { onclick: () => download(exportName + '.json', JSON.stringify(data, null, 2), 'application/json') }, 'Export JSON'),
    typeof askAboutTable === 'function' ? h('button', { class: 'ai-btn', title: 'Joindre ce tableau au chat IA', onclick: () => askAboutTable(exportName, data, cols) }, '✨ Demander à l\'IA') : null);

  function draw() {
    let view = data;
    if (filter) view = view.filter((r) => cols.some((c) => String(r[c] ?? '').toLowerCase().includes(filter)));
    if (sortCol) {
      view = [...view].sort((a, b) => {
        const x = a[sortCol], y = b[sortCol];
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
        return asc ? r : -r;
      });
    }
    const shown = view.slice(0, 1000);
    info.textContent = T(`${view.length} ligne(s)` + (view.length > 1000 ? ' (1000 affichées, filtrez ou exportez)' : ''));
    table.replaceChildren(
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { onclick: () => { asc = sortCol === c ? !asc : true; sortCol = c; draw(); } }, c + (sortCol === c ? (asc ? ' ▲' : ' ▼') : ''))))),
      h('tbody', {}, shown.map((r) => h('tr', { class: onRow ? 'clickable' : '', onclick: onRow ? () => onRow(r) : null }, cols.map((c) => h('td', { title: fmt(r[c]) }, fmt(r[c])))))));
  }
  draw();
  wrap.append(bar, h('div', { class: 'scroll' }, table));
  return wrap;
}

async function guarded(area, fn) {
  area.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Chargement…'));
  try { area.replaceChildren(await fn()); } catch (e) { area.replaceChildren(h('p', { class: 'error' }, e.message)); }
}

function kvTable(obj) {
  return dataTable(Object.entries(obj).map(([k, v]) => ({ Clé: k, Valeur: v })), { exportName: 'infos' });
}

// Toasts (retour immédiat, visible sans défilement)
// =====================================================================
function toast(msg, isError = false) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' err' : '');
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), isError ? 6000 : 2600);
}

// =====================================================================
// IA : Claude (Anthropic), ChatGPT (OpenAI), Cloudflare Workers AI
// =====================================================================
const AI_PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', model: 'claude-sonnet-5-5' },
  openai: { label: 'ChatGPT (OpenAI)', model: 'gpt-4o-mini' },
  cloudflare: { label: 'Cloudflare Workers AI (API directe)', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
};

// ---- Secrets (clés API) : jamais en clair dans le stockage durable ----
// Mode « session » (défaut) : chrome.storage.session, effacé à la fermeture du navigateur.
// Mode « coffre » : chiffré (PBKDF2 + AES-GCM) avec un mot de passe, déverrouillé une fois par session.
const SECRET_KEYS = ['key', 'token'];
let memSecrets = null;
const secretsGet = async () => (chrome.storage.session ? ((await chrome.storage.session.get('aiSecrets')).aiSecrets || null) : memSecrets);
const secretsSet = async (v) => { if (chrome.storage.session) await chrome.storage.session.set({ aiSecrets: v }); else memSecrets = v; };
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
async function vaultKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function vaultEncrypt(password, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16)); const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultKey(password, salt), new TextEncoder().encode(JSON.stringify(obj)));
  return { salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) };
}
async function vaultDecrypt(password, v) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, await vaultKey(password, unb64(v.salt)), unb64(v.data));
  return JSON.parse(new TextDecoder().decode(plain));
}
const splitSecrets = (cfg) => {
  const pub = {}; const sec = {};
  Object.entries(cfg).forEach(([k, v]) => {
    if (v && typeof v === 'object') {
      pub[k] = {}; Object.entries(v).forEach(([f, val]) => { if (SECRET_KEYS.includes(f)) { if (val) (sec[k] ||= {})[f] = val; } else pub[k][f] = val; });
    } else pub[k] = v;
  });
  return { pub, sec };
};

async function getAiCfg() {
  const st = await chrome.storage.local.get(['aiCfg', 'apiKey', 'model', 'aiVault']);
  const cfg = JSON.parse(JSON.stringify(st.aiCfg || { provider: 'anthropic', anthropic: { key: st.apiKey || '', model: st.model || '' } }));
  cfg.provider = cfg.provider || 'anthropic';
  let secrets = await secretsGet();
  // Migration : des clés peuvent encore être en clair dans le stockage durable (versions précédentes).
  const { pub, sec } = splitSecrets(cfg);
  if (Object.keys(sec).length && !st.aiVault) {
    secrets = { ...(secrets || {}) };
    Object.entries(sec).forEach(([p, o]) => { secrets[p] = { ...(secrets[p] || {}), ...o }; });
    await secretsSet(secrets);
    await chrome.storage.local.set({ aiCfg: pub });
    if (st.apiKey) await chrome.storage.local.remove(['apiKey', 'model']);
  } else if (Object.keys(sec).length && st.aiVault) {
    await chrome.storage.local.set({ aiCfg: pub });
  }
  if (!secrets && st.aiVault) {
    const pw = await dialog({ title: 'Déverrouiller les clés IA', message: 'Saisissez le mot de passe du coffre pour utiliser vos clés API pendant cette session.', input: true, secret: true, inputLabel: 'Mot de passe', confirmText: 'Déverrouiller' });
    if (pw === null) throw new Error('Coffre verrouillé : saisissez le mot de passe pour utiliser l\'IA.');
    try { secrets = await vaultDecrypt(pw, st.aiVault); } catch (e) { throw new Error('Mot de passe du coffre incorrect.'); }
    await secretsSet(secrets);
  }
  Object.entries(secrets || {}).forEach(([p, o]) => { cfg[p] = { ...(cfg[p] || {}), ...o }; });
  cfg.store = st.aiVault ? 'vault' : 'session';
  return cfg;
}

// Enregistre la configuration : champs publics en local, secrets en session (+ coffre chiffré si demandé).
async function saveAiCfg(cfg, mode, { quiet = false } = {}) {
  const { pub, sec } = splitSecrets(cfg);
  delete pub.store;
  await chrome.storage.local.set({ aiCfg: pub });
  const prev = JSON.stringify((await secretsGet()) || {});
  await secretsSet(sec);
  const had = !!(await chrome.storage.local.get('aiVault')).aiVault;
  if (mode === 'vault') {
    if (JSON.stringify(sec) === prev && had) return;
    const pw = await dialog({ title: 'Chiffrer les clés IA', message: 'Choisissez un mot de passe : il chiffre vos clés sur ce poste et sera demandé une fois par session. Il n\'est pas récupérable.', input: true, secret: true, inputLabel: 'Mot de passe (8 caractères minimum)', confirmText: 'Chiffrer' });
    if (pw === null || pw.length < 8) throw new Error(pw === null ? 'Chiffrement annulé : les clés restent en session uniquement.' : 'Mot de passe trop court (8 caractères minimum).');
    await chrome.storage.local.set({ aiVault: await vaultEncrypt(pw, sec) });
  } else if (had) await chrome.storage.local.remove('aiVault');
}

// Masque les données personnelles courantes avant envoi à un fournisseur IA (GUID préservés).
function maskPII(text) {
  const keep = [];
  let t = String(text).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => { keep.push(m); return `\u0001${keep.length - 1}\u0001`; });
  t = t.replace(/[\w.+-]+@(?!odata\.|Microsoft\.)[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi, '[email]')
    .replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g, '[iban]')
    .replace(/(?:\+|00)\d[\d .()-]{7,}\d|\b0\d(?:[ .-]?\d{2}){4}\b/g, '[téléphone]')
    .replace(/\b\d{13,19}\b/g, '[nombre]');
  return t.replace(/\u0001(\d+)\u0001/g, (_, i) => keep[Number(i)]);
}

const aiJson = async (res) => {
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (e) { return { raw: txt }; }
};
const aiErr = (j, res) => (j.error && (j.error.message || (typeof j.error === 'string' ? j.error : JSON.stringify(j.error))))
  || (j.errors && j.errors[0] && j.errors[0].message) || j.message || (j.raw && j.raw.slice(0, 300)) || `Erreur API ${res.status}`;
const pickText = (j) => {
  if (!j) return '';
  if (typeof j === 'string') return j;
  const c = j.choices && j.choices[0];
  if (c && c.message && c.message.content) return c.message.content;
  const r = j.result !== undefined ? j.result : j;
  if (typeof r === 'string') return r;
  if (r && r.choices && r.choices[0] && r.choices[0].message) return r.choices[0].message.content || '';
  return r.response || r.text || r.output_text || r.content || j.response || j.text || j.output || j.raw || '';
};

async function askAI(system, user, opts = {}) { // eslint-disable-line no-param-reassign
  const cfg = await getAiCfg();
  // `user` : texte, ou liste de messages {role: 'user'|'assistant', content} (conversation).
  const msgs = [];
  (Array.isArray(user) ? user : [{ role: 'user', content: String(user) }]).forEach((m) => {
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content; else msgs.push({ role: m.role, content: m.content });
  });
  if (I18N.lang === 'en') system += '\n\nAnswer in English.';
  if (cfg.mask !== false) { system = maskPII(system); msgs.forEach((m) => { m.content = maskPII(m.content); }); }
  const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
  const maxTokens = opts.maxTokens || 2000;
  const p = cfg.provider;
  const c = cfg[p] || {};
  const model = c.model || AI_PROVIDERS[p].model;
  let res;
  if (p === 'anthropic') {
    if (!c.key) throw new Error('Clé API Anthropic manquante : renseignez-la dans l\'onglet « Réglages IA ».');
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: msgs }),
    });
    const j = await aiJson(res);
    if (!res.ok) throw new Error(aiErr(j, res));
    return (j.content || []).map((x) => x.text || '').join('');
  }
  if (p === 'openai') {
    if (!c.key) throw new Error('Clé API OpenAI manquante : renseignez-la dans l\'onglet « Réglages IA ».');
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.key}` },
      body: JSON.stringify({ model, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...msgs] }),
    });
    const j = await aiJson(res);
    if (!res.ok) throw new Error(aiErr(j, res));
    return pickText(j);
  }
  if (p === 'cloudflare') {
    if (!c.accountId || !c.token) throw new Error('Cloudflare : renseignez l\'Account ID et le jeton API (permission « Workers AI »).');
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(c.accountId)}/ai/run/${model}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}` },
      body: JSON.stringify({ messages: [{ role: 'system', content: system }, ...msgs], max_tokens: maxTokens }),
    });
    const j = await aiJson(res);
    if (!res.ok || j.success === false) throw new Error(aiErr(j, res));
    return pickText(j);
  }
  throw new Error('Fournisseur IA inconnu.');
}

// =====================================================================
// Onglets
// =====================================================================
const tabs = {};
const TITLES = {
  query: 'Requêtes',
  meta: 'Métadonnées',
  traces: 'Traces de plugins',
  flows: 'Flows',
  sol: 'Solutions & rôles',
  imp: 'Impersonation',
  env: 'Environnement',
  ai: 'Réglages IA',
};

// ---------- Requêtes ----------
const SAMPLES = {
  fetchxml: '<fetch top="50">\n  <entity name="account">\n    <attribute name="name" />\n    <attribute name="createdon" />\n    <order attribute="createdon" descending="true" />\n  </entity>\n</fetch>',
  odata: 'accounts?$select=name,createdon&$top=50&$orderby=createdon desc',
  raw: 'accounts?$select=name&$top=5',
};

tabs.query = async (root) => {
  const saved = (await chrome.storage.local.get('savedQueries')).savedQueries || [];
  const mode = h('select', {},
    h('option', { value: 'fetchxml' }, 'FetchXML'),
    h('option', { value: 'odata' }, 'OData (GET)'),
    h('option', { value: 'raw' }, 'Web API brut'));
  const method = h('select', { style: 'display:none' }, ['POST', 'PATCH', 'PUT', 'DELETE', 'GET'].map((m) => h('option', { value: m }, m)));
  const editor = h('textarea', { class: 'code', rows: '12', spellcheck: 'false' }, SAMPLES.fetchxml);
  const body = h('textarea', { class: 'code', rows: '6', placeholder: 'Corps JSON (POST / PATCH)…', style: 'display:none', spellcheck: 'false' });
  const fmtChk = h('input', { type: 'checkbox', checked: true });
  const pages = h('input', { type: 'number', value: '1', min: '1', max: '50', style: 'width:64px' });
  const result = h('div');
  const savedSel = h('select', {}, h('option', { value: '' }, 'Requêtes enregistrées…'),
    saved.map((s, i) => h('option', { value: String(i) }, `${s.name} (${s.mode})`)));

  let lastSample = SAMPLES.fetchxml;
  mode.addEventListener('change', () => {
    method.style.display = body.style.display = mode.value === 'raw' ? '' : 'none';
    if (editor.value.trim() === lastSample.trim() || !editor.value.trim()) editor.value = lastSample = SAMPLES[mode.value];
  });

  const renderResult = (res) => {
    const box = h('div');
    if (res.isCollection) {
      const data = res.value.map((r) => flatten(r));
      if (res.nextLink) box.append(h('p', { class: 'muted' }, 'Résultats partiels : augmentez « Pages max » pour suivre la pagination.'));
      if (res.meta && res.meta['@Microsoft.Dynamics.CRM.morerecords']) box.append(h('p', { class: 'muted' }, 'D\'autres enregistrements existent (FetchXML limité à 5000 par page) : utilisez top / page dans le FetchXML.'));
      box.append(dataTable(data, { exportName: 'requete' }));
    } else if (res.status === 204) {
      toast('✓ Succès' + (res.entityId ? ' : ' + res.entityId : ' (204)'));
      box.append(h('p', { class: 'ok' }, 'Succès (204).' + (res.entityId ? ' ' + res.entityId : '')));
    } else {
      box.append(h('pre', {}, JSON.stringify(res.data, null, 2)));
    }
    return box;
  };

  const run = () => guarded(result, async () => {
    if (mode.value === 'fetchxml') {
      return renderResult(await call('fetchxml', { fetchXml: editor.value, callerId: state.callerId, formatted: fmtChk.checked }));
    }
    const meth = mode.value === 'raw' ? method.value : 'GET';
    const path = editor.value.trim();
    if (meth !== 'GET' && !(await confirmBox(`Exécuter ${meth} ${path} sur l'environnement courant ?`, { confirmText: 'Exécuter', danger: meth === 'DELETE' }))) throw new Error('Annulé.');
    let payload;
    if (meth !== 'GET' && body.value.trim()) {
      try { payload = JSON.parse(body.value); } catch (e) { throw new Error('Corps JSON invalide : ' + e.message); }
    }
    return renderResult(await q(path, { method: meth, body: payload, formatted: fmtChk.checked, maxPages: Number(pages.value) || 1 }));
  });

  editor.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') run(); });

  savedSel.addEventListener('change', () => {
    const s = saved[Number(savedSel.value)];
    if (!s) return;
    mode.value = s.mode;
    mode.dispatchEvent(new Event('change'));
    editor.value = s.text;
    lastSample = '';
  });

  const save = async () => {
    const name = await promptBox('Donnez un nom à cette requête pour la retrouver plus tard.', { title: 'Enregistrer la requête', inputLabel: 'Nom de la requête', confirmText: 'Enregistrer' });
    if (!name) return;
    saved.push({ name, mode: mode.value, text: editor.value });
    await chrome.storage.local.set({ savedQueries: saved });
    toast('✓ Requête enregistrée. Rouvrez l\'onglet pour la retrouver dans la liste.');
  };

  if (state.pendingQuery) {
    mode.value = state.pendingQuery.mode;
    mode.dispatchEvent(new Event('change'));
    editor.value = state.pendingQuery.text;
    lastSample = '';
    state.pendingQuery = null;
  }

  root.append(
    h('p', { class: 'muted' }, 'Ctrl+Entrée pour exécuter. Les requêtes passent par la session de l\'onglet Dynamics (impersonation appliquée si active).'),
    h('div', { class: 'toolbar' }, mode, method, savedSel,
      h('label', { class: 'inline' }, fmtChk, 'Valeurs formatées'),
      h('label', { class: 'inline' }, 'Pages max', pages),
      h('button', { class: 'primary', onclick: run }, 'Exécuter'),
      h('button', { onclick: save }, 'Enregistrer')),
    editor, body, result);
};

// ---------- Métadonnées ----------
tabs.meta = async (root) => {
  const input = h('input', { list: 'etnlist', placeholder: 'nom logique (ex. account)', style: 'width:260px', spellcheck: 'false' });
  const dl = h('datalist', { id: 'etnlist' });
  const result = h('div');
  const need = () => { const v = input.value.trim(); if (!/^[A-Za-z0-9_]+$/.test(v)) throw new Error('Saisissez un nom logique d\'entité valide.'); return v; };

  const attrs = () => guarded(result, async () => {
    const e = need();
    const r = await rows(`EntityDefinitions(LogicalName='${e}')/Attributes?$select=LogicalName,SchemaName,AttributeType,RequiredLevel,DisplayName,IsCustomAttribute,IsPrimaryId,IsPrimaryName`);
    return dataTable(r.map((a) => ({
      'Nom logique': a.LogicalName, 'Nom de schéma': a.SchemaName, Libellé: label(a.DisplayName), Type: a.AttributeType,
      Requis: a.RequiredLevel && a.RequiredLevel.Value, Personnalisé: a.IsCustomAttribute, 'ID principal': a.IsPrimaryId, 'Nom principal': a.IsPrimaryName,
    })), { exportName: `attributs-${e}` });
  });

  const optionSets = () => guarded(result, async () => {
    const e = need();
    const out = [];
    const kinds = [
      ['PicklistAttributeMetadata', 'Options'], ['MultiSelectPicklistAttributeMetadata', 'Options'],
      ['StatusAttributeMetadata', 'Options'], ['StateAttributeMetadata', 'Options'], ['BooleanAttributeMetadata', 'Bool'],
    ];
    for (const [kind, shape] of kinds) {
      const expand = shape === 'Bool' ? 'OptionSet($select=TrueOption,FalseOption)' : 'OptionSet($select=Options)';
      const r = await rows(`EntityDefinitions(LogicalName='${e}')/Attributes/Microsoft.Dynamics.CRM.${kind}?$select=LogicalName&$expand=${expand}`);
      for (const a of r) {
        const os = a.OptionSet;
        if (!os) continue;
        const opts = shape === 'Bool' ? [os.FalseOption, os.TrueOption].filter(Boolean) : os.Options || [];
        opts.forEach((o) => out.push({ Champ: a.LogicalName, Valeur: o.Value, Libellé: label(o.Label), Type: kind.replace('AttributeMetadata', '') }));
      }
    }
    return dataTable(out, { exportName: `optionsets-${e}`, empty: 'Aucun champ de type choix sur cette entité.' });
  });

  const relations = () => guarded(result, async () => {
    const e = need();
    const r = (await q(`EntityDefinitions(LogicalName='${e}')?$select=LogicalName&$expand=OneToManyRelationships($select=SchemaName,ReferencingEntity,ReferencingAttribute),ManyToOneRelationships($select=SchemaName,ReferencedEntity,ReferencingAttribute),ManyToManyRelationships($select=SchemaName,Entity1LogicalName,Entity2LogicalName)`)).data;
    const out = [
      ...(r.OneToManyRelationships || []).map((x) => ({ Type: '1:N', Relation: x.SchemaName, 'Entité liée': x.ReferencingEntity, Champ: x.ReferencingAttribute })),
      ...(r.ManyToOneRelationships || []).map((x) => ({ Type: 'N:1', Relation: x.SchemaName, 'Entité liée': x.ReferencedEntity, Champ: x.ReferencingAttribute })),
      ...(r.ManyToManyRelationships || []).map((x) => ({ Type: 'N:N', Relation: x.SchemaName, 'Entité liée': `${x.Entity1LogicalName} / ${x.Entity2LogicalName}`, Champ: '' })),
    ];
    return dataTable(out, { exportName: `relations-${e}` });
  });

  const entities = () => guarded(result, async () => {
    const r = await rows('EntityDefinitions?$select=LogicalName,SchemaName,EntitySetName,ObjectTypeCode,IsCustomEntity,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName');
    return dataTable(r.map((x) => ({
      'Nom logique': x.LogicalName, Libellé: label(x.DisplayName), 'Entity set': x.EntitySetName, 'Type code': x.ObjectTypeCode,
      Personnalisée: x.IsCustomEntity, 'ID principal': x.PrimaryIdAttribute, 'Nom principal': x.PrimaryNameAttribute,
    })), { exportName: 'entites', onRow: (row) => { input.value = row['Nom logique']; } });
  });

  root.append(
    h('div', { class: 'toolbar' }, input, dl,
      h('button', { class: 'primary', onclick: attrs }, 'Attributs'),
      h('button', { onclick: optionSets }, 'Option sets'),
      h('button', { onclick: relations }, 'Relations'),
      h('button', { onclick: entities }, 'Toutes les entités')),
    result);

  // Pré-remplissage de la liste d'entités et de l'entité courante.
  try {
    const list = await rows('EntityDefinitions?$select=LogicalName');
    list.forEach((x) => dl.append(h('option', { value: x.LogicalName })));
    const p = await call('ping');
    if (p.entity) input.value = p.entity;
  } catch (e) { /* non bloquant */ }
};

// ---------- Traces de plugins ----------
tabs.traces = async (root) => {
  const top = h('input', { type: 'number', value: '50', min: '1', max: '500', style: 'width:70px' });
  const type = h('input', { placeholder: 'Type contient…' });
  const msg = h('input', { placeholder: 'Message (Create, Update…)', style: 'width:150px' });
  const entity = h('input', { placeholder: 'Entité', style: 'width:120px' });
  const hours = h('input', { type: 'number', value: '24', min: '0', style: 'width:70px', title: '0 = pas de limite' });
  const onlyErr = h('input', { type: 'checkbox' });
  const result = h('div');
  const detail = h('div');

  const run = () => guarded(result, async () => {
    const f = [];
    if (type.value.trim()) f.push(`contains(typename,'${esc(type.value.trim())}')`);
    if (msg.value.trim()) f.push(`messagename eq '${esc(msg.value.trim())}'`);
    if (entity.value.trim()) f.push(`primaryentity eq '${esc(entity.value.trim())}'`);
    if (onlyErr.checked) f.push('exceptiondetails ne null');
    if (Number(hours.value) > 0) f.push(`createdon ge ${new Date(Date.now() - Number(hours.value) * 3600e3).toISOString()}`);
    const path = 'plugintracelogs?$select=typename,messagename,primaryentity,performanceexecutionstarttime,performanceexecutionduration,exceptiondetails,messageblock,correlationid,depth,mode,operationtype,createdon'
      + `&$orderby=createdon desc&$top=${Number(top.value) || 50}` + (f.length ? `&$filter=${f.join(' and ')}` : '');
    const r = await rows(path);
    detail.replaceChildren();
    return dataTable(r.map((x) => ({
      Date: x.createdon, Type: x.typename, Message: x.messagename, Entité: x.primaryentity, 'Durée (ms)': x.performanceexecutionduration,
      Profondeur: x.depth, Erreur: x.exceptiondetails ? 'oui' : '', Corrélation: x.correlationid, _raw: x,
    })).map(({ _raw, ...vis }) => Object.defineProperty(vis, '_raw', { value: _raw, enumerable: false })), {
      exportName: 'traces-plugins',
      empty: 'Aucune trace. Vérifiez que le suivi est activé : Paramètres > Administration > Paramètres système > Personnalisation > « Journalisation de suivi des plug-ins ».',
      onRow: (row) => {
        const x = row._raw;
        const text = `Type : ${x.typename}\nMessage : ${x.messagename} sur ${x.primaryentity}\nDate : ${x.createdon}\n\n--- Trace ---\n${x.messageblock || '(vide)'}\n\n--- Exception ---\n${x.exceptiondetails || '(aucune)'}`;
        const ai = h('pre', { hidden: true });
        detail.replaceChildren(
          h('h2', {}, 'Détail de la trace'), h('pre', {}, text),
          h('button', {
            onclick: async (e) => {
              const cfg = await getAiCfg().catch(() => ({ provider: 'anthropic' }));
              const who = (AI_PROVIDERS[cfg.provider] || {}).label || 'le fournisseur IA';
              if (!(await confirmBox(`La trace et l'exception ci-dessus seront envoyées à ${who}. Elles peuvent contenir des données d'enregistrements${cfg.mask === false ? '' : ' (e-mails, téléphones et IBAN sont masqués)'}.`, { confirmText: 'Envoyer à l\'IA' }))) return;
              e.target.disabled = true; ai.hidden = false; ai.textContent = 'Analyse en cours…';
              try {
                ai.textContent = await askAI('Tu es un expert des plug-ins Dynamics 365 / Dataverse. Explique la cause probable de cette trace/erreur et propose des corrections concrètes. Réponds en français, de façon concise.', text.slice(0, 12000));
              } catch (err) { ai.textContent = err.message; }
              e.target.disabled = false;
            },
          }, 'Expliquer avec l\'IA (envoie la trace au fournisseur IA configuré)'), ai);
      },
    });
  });

  root.append(
    h('p', { class: 'muted' }, 'Cliquez sur une ligne pour voir la trace complète.'),
    h('div', { class: 'toolbar' }, 'Top', top, type, msg, entity, 'Dernières (h)', hours,
      h('label', { class: 'inline' }, onlyErr, 'Erreurs seulement'),
      h('button', { class: 'primary', onclick: run }, 'Charger')),
    result, detail);
  run();
};

// ---------- Flows ----------
tabs.flows = async (root) => {
  const list = h('div'), runsBox = h('div');
  const status = h('select', {}, h('option', { value: '' }, 'Tous statuts'), h('option', { value: 'Failed' }, 'Failed'), h('option', { value: 'Succeeded' }, 'Succeeded'), h('option', { value: 'Running' }, 'Running'));
  const topRuns = h('input', { type: 'number', value: '50', min: '1', max: '500', style: 'width:70px' });

  const loadFlows = () => guarded(list, async () => {
    const r = await rows('workflows?$select=name,workflowid,statecode,modifiedon,createdon&$filter=category eq 5&$orderby=modifiedon desc&$top=200', { formatted: true });
    return dataTable(r.map(flatten), { exportName: 'flows', empty: 'Aucun flow dans Dataverse (seuls les flows solution-aware y figurent).' });
  });

  const loadRuns = () => guarded(runsBox, async () => {
    const f = status.value ? `&$filter=status eq '${esc(status.value)}'` : '';
    const r = await rows(`flowruns?$orderby=starttime desc&$top=${Number(topRuns.value) || 50}${f}`, { formatted: true });
    const wanted = ['name', 'status', 'starttime', 'endtime', 'duration', 'triggertype', 'errorcode', 'errormessage', 'workflowid'];
    return dataTable(r.map((x) => {
      const fl = flatten(x);
      const keep = {};
      wanted.forEach((k) => { if (k in fl) keep[k] = fl[k]; });
      return Object.keys(keep).length ? keep : fl;
    }), { exportName: 'flow-runs', empty: 'Aucun run. L\'historique n\'est dans Dataverse que pour les flows solution-aware (conservation limitée, ~28 jours).' });
  });

  root.append(
    h('h2', {}, 'Flows cloud (Dataverse)'),
    h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: loadFlows }, 'Lister les flows')), list,
    h('h2', {}, 'Historique des exécutions'),
    h('div', { class: 'toolbar' }, status, 'Top', topRuns, h('button', { class: 'primary', onclick: loadRuns }, 'Charger les runs')), runsBox);
  loadFlows();
};

// ---------- Solutions & rôles ----------
tabs.sol = async (root) => {
  const result = h('div');
  const userQ = h('input', { placeholder: 'Nom d\'utilisateur contient…' });

  const solutions = () => guarded(result, async () => {
    const r = await rows('solutions?$select=friendlyname,uniquename,version,ismanaged,installedon,modifiedon&$expand=publisherid($select=friendlyname,customizationprefix)&$filter=isvisible eq true&$orderby=friendlyname');
    return dataTable(r.map((s) => ({
      Nom: s.friendlyname, 'Nom unique': s.uniquename, Version: s.version, Gérée: s.ismanaged,
      Éditeur: s.publisherid && s.publisherid.friendlyname, Préfixe: s.publisherid && s.publisherid.customizationprefix,
      Installée: s.installedon, Modifiée: s.modifiedon,
    })), { exportName: 'solutions' });
  });

  const roles = () => guarded(result, async () => {
    const r = await rows('roles?$select=name,roleid,ismanaged&$expand=businessunitid($select=name)&$orderby=name');
    return dataTable(r.map((x) => ({ Rôle: x.name, 'Unité commerciale': x.businessunitid && x.businessunitid.name, Géré: x.ismanaged, ID: x.roleid })), { exportName: 'roles' });
  });

  const users = () => guarded(result, async () => {
    const t = userQ.value.trim();
    const r = await rows(`systemusers?$select=fullname,domainname,systemuserid,isdisabled&$filter=${t ? `contains(fullname,'${esc(t)}') and ` : ''}accessmode ne 4&$orderby=fullname&$top=100`);
    return h('div', {},
      h('p', { class: 'muted' }, 'Cliquez sur un utilisateur pour voir ses rôles directs.'),
      dataTable(r.map((u) => ({ Nom: u.fullname, Compte: u.domainname, Désactivé: u.isdisabled, ID: u.systemuserid })), {
        exportName: 'utilisateurs',
        onRow: (u) => guarded(result, async () => {
          const ur = await rows(`systemusers(${u.ID})/systemuserroles_association?$select=name`);
          return h('div', {}, h('h2', {}, `Rôles de ${u.Nom}`), dataTable(ur.map((x) => ({ Rôle: x.name })), { exportName: 'roles-utilisateur', empty: 'Aucun rôle direct (rôles possibles via les équipes).' }),
            h('button', { onclick: users }, '← Retour aux utilisateurs'));
        }),
      }));
  });

  root.append(h('div', { class: 'toolbar' },
    h('button', { class: 'primary', onclick: solutions }, 'Solutions'),
    h('button', { class: 'primary', onclick: roles }, 'Rôles de sécurité'),
    userQ, h('button', { class: 'primary', onclick: users }, 'Utilisateurs & rôles')), result);
  solutions();
};

// ---------- Comparaison d'environnements (instantanés) ----------
const SNAP_DEFS = {
  Solutions: ['solutions?$select=uniquename,version,ismanaged&$filter=isvisible eq true', (r) => [r.uniquename, `${r.version} ${r.ismanaged ? '(gérée)' : '(non gérée)'}`]],
  'Rôles de sécurité': ['roles?$select=name', (r) => [r.name, '']],
  'Assemblies de plug-ins': ['pluginassemblies?$select=name,version&$filter=ishidden/Value eq false', (r) => [r.name, r.version]],
  'Étapes de plug-ins': ['sdkmessageprocessingsteps?$select=name,stage,mode,statecode&$filter=ishidden/Value eq false', (r) => [r.name, `stage ${r.stage} / mode ${r.mode} / état ${r.statecode}`]],
  'Variables d\'environnement': ['environmentvariabledefinitions?$select=schemaname,defaultvalue', (r) => [r.schemaname, r.defaultvalue ?? '']],
  'Processus & flows': ['workflows?$select=name,category,statecode&$filter=type eq 1', (r) => [`${r.name} [cat ${r.category}]`, `état ${r.statecode}`]],
};

tabs.snap = async (root) => {
  let lastDiff = null;
  const load = async () => (await chrome.storage.local.get('snapshots')).snapshots || [];
  const list = h('div'), cmp = h('div');
  const nameIn = h('input', { placeholder: 'Nom de l\'instantané (ex. DEV)', style: 'width:220px' });
  const msg = h('p', { class: 'muted' });

  async function refresh() {
    const snaps = await load();
    const opts = (sel) => snaps.map((s, i) => h('option', { value: String(i), selected: i === sel }, `${s.name} — ${new Date(s.date).toLocaleString('fr-FR')}`));
    const a = h('select', {}, opts(Math.max(0, snaps.length - 2)));
    const b = h('select', {}, opts(snaps.length - 1));
    list.replaceChildren(
      dataTable(snaps.map((s) => ({ Nom: s.name, Organisation: s.org, Date: s.date, Éléments: Object.values(s.data).reduce((n, o) => n + Object.keys(o).length, 0), Erreurs: Object.keys(s.errors).length })), { exportName: 'instantanes', empty: 'Aucun instantané : ouvrez chaque environnement et capturez-en un.' }),
      snaps.length ? h('div', { class: 'toolbar' }, 'Comparer', a, 'avec', b,
        h('button', { class: 'primary', onclick: () => compare(snaps[Number(a.value)], snaps[Number(b.value)]) }, 'Comparer'),
        h('button', { class: 'danger', onclick: async () => { if (await confirmBox('Supprimer tous les instantanés enregistrés ?', { danger: true, confirmText: 'Tout supprimer' })) { await chrome.storage.local.set({ snapshots: [] }); cmp.replaceChildren(); refresh(); } } }, 'Tout supprimer')) : null);
  }

  function compare(A, B) {
    const out = [];
    for (const cat of Object.keys(SNAP_DEFS)) {
      const x = A.data[cat] || {}, y = B.data[cat] || {};
      new Set([...Object.keys(x), ...Object.keys(y)]).forEach((k) => {
        if (!(k in y)) out.push({ Catégorie: cat, Élément: k, 'Valeur A': x[k], 'Valeur B': '—', Statut: 'Seulement dans A' });
        else if (!(k in x)) out.push({ Catégorie: cat, Élément: k, 'Valeur A': '—', 'Valeur B': y[k], Statut: 'Seulement dans B' });
        else if (x[k] !== y[k]) out.push({ Catégorie: cat, Élément: k, 'Valeur A': x[k], 'Valeur B': y[k], Statut: 'Différent' });
      });
    }
    const errs = [...Object.keys(A.errors).map((c) => `A / ${c}`), ...Object.keys(B.errors).map((c) => `B / ${c}`)];
    lastDiff = { A, B, out };
    cmp.replaceChildren(
      h('h2', {}, `${out.length} différence(s)`),
      h('p', { class: 'muted' }, `A = ${A.name} (${new Date(A.date).toLocaleString('fr-FR')}) — B = ${B.name} (${new Date(B.date).toLocaleString('fr-FR')})`),
      out.length ? h('div', { class: 'toolbar' },
        h('button', { class: 'primary', onclick: () => exportDiff('docx') }, 'Rapport de livraison Word (.docx)'),
        h('button', { onclick: () => exportDiff('xlsx') }, 'Excel (.xlsx)')) : null,
      errs.length ? h('p', { class: 'error' }, 'Catégories non capturées (droits insuffisants ?) : ' + errs.join(', ')) : null,
      dataTable(out, { exportName: 'comparaison', empty: 'Aucune différence détectée.' }));
  }

  async function exportDiff(kind) {
    const { A, B, out } = lastDiff;
    const cats = Object.keys(SNAP_DEFS);
    const summary = cats.map((c) => {
      const r = out.filter((x) => x['Catégorie'] === c);
      return [c, r.filter((x) => x.Statut === 'Seulement dans A').length, r.filter((x) => x.Statut === 'Seulement dans B').length, r.filter((x) => x.Statut === 'Différent').length];
    });
    const head = ['Catégorie', 'Élément', `Valeur A (${A.name})`, `Valeur B (${B.name})`, 'Statut'];
    const detail = out.map((x) => [x['Catégorie'], x['Élément'], x['Valeur A'], x['Valeur B'], x.Statut]);
    if (kind === 'xlsx') {
      saveBlob(`comparaison-${stamp()}.xlsx`, Office.xlsx([
        { name: 'Résumé', rows: [['Catégorie', 'Seulement dans A', 'Seulement dans B', 'Différent'], ...summary] },
        { name: 'Différences', rows: [head, ...detail] },
      ]));
      return;
    }
    const notesIn = await promptBox('Ajoutez un contexte ou des notes en en-tête du rapport (facultatif).', { title: 'Rapport de livraison', inputLabel: 'Notes (optionnel)', optional: true, confirmText: 'Générer' });
    if (notesIn === null) return;
    const notes = notesIn || '';
    saveBlob(`rapport-livraison-${stamp()}.docx`, Office.docx([
      { t: 'title', text: 'Rapport de comparaison d\'environnements' },
      { t: 'p', text: `A : ${A.name} — ${A.org || ''} — capturé le ${new Date(A.date).toLocaleString('fr-FR')}` },
      { t: 'p', text: `B : ${B.name} — ${B.org || ''} — capturé le ${new Date(B.date).toLocaleString('fr-FR')}` },
      ...(notes ? [{ t: 'h2', text: 'Contexte' }, { t: 'p', text: notes }] : []),
      { t: 'h1', text: 'Synthèse' },
      { t: 'table', header: ['Catégorie', `Seulement dans A (${A.name})`, `Seulement dans B (${B.name})`, 'Versions / valeurs différentes'], rows: summary },
      { t: 'h1', text: `Détail des différences (${out.length})` },
      { t: 'table', header: head, rows: detail },
    ], { landscape: true }));
  }

  async function capture() {
    const name = nameIn.value.trim();
    if (!name) { msg.textContent = 'Donnez un nom à l\'instantané.'; return; }
    msg.textContent = 'Capture en cours…';
    const data = {}, errors = {};
    for (const [cat, [path, kv]] of Object.entries(SNAP_DEFS)) {
      try {
        data[cat] = {};
        (await rows(path, { maxPages: 10 })).forEach((r) => { const [k, v] = kv(r); data[cat][k] = String(v); });
      } catch (e) { errors[cat] = e.message; delete data[cat]; }
    }
    const snaps = await load();
    snaps.push({ name, org: (state.orgInfo && state.orgInfo.org) || '', date: new Date().toISOString(), data, errors });
    await chrome.storage.local.set({ snapshots: snaps });
    msg.textContent = `Instantané « ${name} » enregistré.` + (Object.keys(errors).length ? ` Non capturé : ${Object.keys(errors).join(', ')}.` : '');
    refresh();
  }

  root.append(
    h('p', { class: 'muted' }, 'Capturez un instantané dans chaque environnement (onglet Dynamics + Workbench de cet environnement), puis comparez-les ici. Les instantanés restent dans le stockage local de l\'extension.'),
    h('div', { class: 'toolbar' }, nameIn, h('button', { class: 'primary', onclick: capture }, 'Capturer cet environnement')),
    msg, list, cmp);
  refresh();
};

// ---------- Impersonation ----------
tabs.imp = async (root) => {
  const result = h('div'), who = h('div');
  const userQ = h('input', { placeholder: 'Nom contient…' });

  const search = () => guarded(result, async () => {
    const t = userQ.value.trim();
    const r = await rows(`systemusers?$select=fullname,domainname,systemuserid&$filter=${t ? `contains(fullname,'${esc(t)}') and ` : ''}isdisabled eq false and accessmode ne 4&$orderby=fullname&$top=100`);
    return dataTable(r.map((u) => ({ Nom: u.fullname, Compte: u.domainname, ID: u.systemuserid })), {
      exportName: 'utilisateurs',
      onRow: async (u) => {
        state.callerId = u.ID; state.callerName = u.Nom;
        await chrome.storage.local.set({ callerId: u.ID, callerName: u.Nom });
        updateBanner();
        who.replaceChildren(h('p', { class: 'ok' }, `Impersonation active : ${u.Nom}. Toutes les requêtes du Workbench s'exécutent désormais en son nom.`));
      },
    });
  });

  const clear = async () => {
    state.callerId = state.callerName = null;
    await chrome.storage.local.remove(['callerId', 'callerName']);
    updateBanner();
    who.replaceChildren(h('p', { class: 'ok' }, 'Impersonation désactivée.'));
  };

  const whoami = () => guarded(who, async () => {
    const r = await q('WhoAmI');
    return h('div', {}, h('p', {}, 'WhoAmI renvoie :'), kvTable(r.data || {}));
  });

  root.append(
    h('p', { class: 'muted' }, 'Utilise l\'en-tête MSCRMCallerID : nécessite le privilège « Agir au nom d\'un autre utilisateur » (prvActOnBehalfOfAnotherUser). Ne s\'applique qu\'aux requêtes du Workbench, pas à l\'interface Dynamics.'),
    h('div', { class: 'toolbar' }, userQ, h('button', { class: 'primary', onclick: search }, 'Chercher'),
      h('button', { onclick: whoami }, 'Tester (WhoAmI)'), h('button', { class: 'danger', onclick: clear }, 'Désactiver')),
    who, result);
};

// ---------- Environnement ----------
tabs.env = async (root) => {
  const box = h('div');
  root.append(box);
  await guarded(box, async () => {
    const info = await call('envInfo');
    const extra = {};
    try { extra['Version (RetrieveVersion)'] = (await q('RetrieveVersion()')).data.Version; } catch (e) { /* ignore */ }
    let envId = null;
    for (const p of ["RetrieveCurrentOrganization(AccessType=Microsoft.Dynamics.CRM.EndpointAccessType'Default')", "RetrieveCurrentOrganization(AccessType='Default')"]) {
      try {
        const d = (await q(p)).data.Detail;
        envId = d.EnvironmentId; extra['ID environnement (Power Platform)'] = envId; extra['Nom convivial'] = d.FriendlyName; extra['Région'] = d.Geo;
        break;
      } catch (e) { /* essai suivant */ }
    }
    const links = envId ? h('div', { class: 'toolbar' },
      h('a', { href: `https://make.powerapps.com/environments/${envId}/home`, target: '_blank', rel: 'noopener' }, 'Power Apps Maker'),
      h('a', { href: `https://make.powerautomate.com/environments/${envId}/flows`, target: '_blank', rel: 'noopener' }, 'Power Automate'),
      h('a', { href: `https://admin.powerplatform.microsoft.com/environments/environment/${envId}/hub`, target: '_blank', rel: 'noopener' }, 'Centre d\'administration')) : null;
    return h('div', {}, kvTable({ ...info, ...extra }), links);
  });
};

// ---------- Assistant IA ----------
tabs.ai = async (root) => {
  const cfg = await getAiCfg();
  const provider = h('select', {}, Object.entries(AI_PROVIDERS).map(([k, v]) => h('option', { value: k, selected: k === cfg.provider }, v.label)));
  const fields = h('div', { class: 'toolbar' });
  const inputs = {};
  const FIELDS = {
    anthropic: [['key', 'Clé API Anthropic (sk-ant-…)', 'password', 320], ['model', 'Modèle', 'text', 200]],
    openai: [['key', 'Clé API OpenAI (sk-…)', 'password', 320], ['model', 'Modèle (ex. gpt-4o-mini)', 'text', 200]],
    cloudflare: [['accountId', 'Account ID Cloudflare', 'text', 280], ['token', 'Jeton API (Workers AI)', 'password', 300], ['model', 'Modèle (@cf/…)', 'text', 320]],
  };
  const renderFields = () => {
    const p = provider.value;
    const saved = cfg[p] || {};
    Object.keys(inputs).forEach((k) => delete inputs[k]);
    fields.replaceChildren(...FIELDS[p].map(([k, ph, type, w]) => {
      inputs[k] = h('input', { type, placeholder: k === 'model' && AI_PROVIDERS[p].model ? AI_PROVIDERS[p].model : ph, title: ph, value: saved[k] || '', style: `width:${w}px` });
      return inputs[k];
    }));
  };
  provider.onchange = renderFields;
  renderFields();

  const etn = h('input', { placeholder: 'Entité principale (optionnel)', style: 'width:220px' });
  const withSchema = h('input', { type: 'checkbox', checked: true });
  const kind = h('select', {}, h('option', { value: 'fetchxml' }, 'FetchXML'), h('option', { value: 'odata' }, 'OData'));
  const prompt_ = h('textarea', { rows: '4', placeholder: 'Ex. : comptes créés cette année avec leur contact principal, triés par chiffre d\'affaires' });
  const out = h('div');

  const store = h('select', { title: 'Où conserver les clés API' },
    h('option', { value: 'session', selected: cfg.store !== 'vault' }, 'Session du navigateur (effacées à la fermeture)'),
    h('option', { value: 'vault', selected: cfg.store === 'vault' }, 'Coffre chiffré sur ce poste (mot de passe)'));
  const mask = h('input', { type: 'checkbox', checked: cfg.mask !== false });
  const saveCfg = async (quiet) => {
    const p = provider.value;
    const entry = {};
    Object.entries(inputs).forEach(([k, el]) => { entry[k] = el.value.trim(); });
    cfg.provider = p;
    cfg[p] = entry;
    cfg.mask = mask.checked;
    await saveAiCfg(cfg, store.value, { quiet });
    cfg.store = store.value;
    if (!quiet) toast(store.value === 'vault' ? '✓ Paramètres enregistrés, clés chiffrées' : '✓ Paramètres enregistrés (clés conservées pour la session)');
  };

  const test = async () => {
    try { await saveCfg(true); toast('Test en cours…'); const t = await askAI('Réponds en un mot.', 'Dis « OK ».'); toast(`✓ ${AI_PROVIDERS[provider.value].label} répond : ${String(t).trim().slice(0, 60)}`); } catch (e) { toast(e.message, true); }
  };

  const generate = () => guarded(out, async () => {
    await saveCfg(true);
    let schema = '';
    const e = etn.value.trim();
    if (e && withSchema.checked && /^[A-Za-z0-9_]+$/.test(e)) {
      const a = await rows(`EntityDefinitions(LogicalName='${e}')/Attributes?$select=LogicalName,AttributeType`);
      schema = `\n\nChamps de l'entité ${e} (noms logiques, type) :\n` + a.map((x) => `${x.LogicalName} (${x.AttributeType})`).join(', ');
    }
    const system = `Tu es un expert Dynamics 365 / Dataverse. Produis UNIQUEMENT une requête ${kind.value === 'fetchxml' ? 'FetchXML' : 'OData (chemin relatif de l\'API Web, ex. accounts?$select=name)'} valide dans un seul bloc de code, suivie d'une explication d'une ligne en français. N'invente aucun nom de champ : utilise uniquement ceux fournis ou ceux que tu connais avec certitude pour les tables standard.`;
    const text = await askAI(system, prompt_.value + schema);
    const m = text.match(/```[a-z]*\n([\s\S]*?)```/i);
    const code = m ? m[1].trim() : text.trim();
    return h('div', {},
      h('pre', {}, text),
      h('div', { class: 'toolbar' },
        h('button', { class: 'primary', onclick: () => { state.pendingQuery = { mode: kind.value, text: code }; show('query'); } }, 'Envoyer vers l\'éditeur de requêtes'),
        copyBtn(() => code, 'Copier la requête')));
  });

  root.append(
    h('p', { class: 'muted' }, 'Choisissez le fournisseur : Claude, ChatGPT ou Cloudflare Workers AI (appel direct depuis votre navigateur). Les demandes (et le schéma de champs si coché) sont envoyées depuis votre navigateur ; aucune donnée d\'enregistrement n\'est transmise. Les clés ne sont jamais stockées en clair : utilisez des clés dédiées avec limite de dépense.'),
    h('div', { class: 'toolbar' }, provider),
    fields,
    h('div', { class: 'toolbar' }, h('label', { class: 'inline' }, 'Clés API : ', store), h('label', { class: 'inline' }, mask, 'Masquer e-mails, téléphones et IBAN avant envoi')),
    h('div', { class: 'toolbar' }, h('button', { onclick: () => saveCfg().catch((e) => toast(e.message, true)) }, 'Enregistrer'), h('button', { onclick: test }, 'Tester la connexion')),
    h('h2', {}, 'Générer une requête'),
    h('div', { class: 'toolbar' }, kind, etn, h('label', { class: 'inline' }, withSchema, 'Inclure les noms de champs')),
    prompt_, h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: generate }, 'Générer')), out);
};
