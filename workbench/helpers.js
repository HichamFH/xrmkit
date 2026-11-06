'use strict';
// Aides partagées par les onglets ajoutés en v0.2 (chargées après workbench.js, avant les onglets).

async function pool(items, n, fn, onProgress) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < items.length) {
      const k = next++;
      try { results[k] = { ok: true, v: await fn(items[k], k) }; } catch (e) { results[k] = { ok: false, e }; }
      if (onProgress) onProgress(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

const withRaw = (row, raw) => Object.defineProperty(row, '_raw', { value: raw, enumerable: false });
const cleanGuid = (s) => String(s || '').trim().replace(/[{}]/g, '').toLowerCase();
const isGuid = (s) => /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(cleanGuid(s));
const isName = (s) => /^[A-Za-z0-9_]+$/.test(s || '');
const orgName = () => (state.orgInfo && state.orgInfo.org) || 'cet environnement';
const FV = (row, key) => row[`${key}@OData.Community.Display.V1.FormattedValue`];
const yesNo = (v) => (v ? 'oui' : 'non');
const managed = (p) => !!(p && p.Value);

function progressLine() {
  const p = h('p', { class: 'muted' });
  p.set = (t) => { p.textContent = t; };
  return p;
}

function copyBtn(getText, text = 'Copier') {
  const b = h('button', {
    onclick: async () => {
      try { await navigator.clipboard.writeText(getText()); b.textContent = 'Copié ✓'; } catch (e) { b.textContent = 'Échec de la copie'; }
      setTimeout(() => { b.textContent = text; }, 1500);
    },
  }, text);
  return b;
}

// ---- entités ----
let _entityCache = null;
async function entityList() {
  if (!_entityCache) {
    _entityCache = await rows('EntityDefinitions?$select=LogicalName,SchemaName,EntitySetName,DisplayName,Description,IsCustomEntity,PrimaryIdAttribute,PrimaryNameAttribute');
  }
  return _entityCache;
}
async function entitySetOf(name) {
  const e = (await entityList()).find((x) => x.LogicalName === name);
  if (!e) throw new Error('Entité inconnue : ' + name);
  return e.EntitySetName;
}
async function entitySetsMap() {
  return Object.fromEntries((await entityList()).map((x) => [x.LogicalName, x.EntitySetName]));
}

function entityBox(placeholder = 'table (nom logique)', width = 220) {
  let dl = document.getElementById('dk-entities');
  if (!dl) {
    dl = h('datalist', { id: 'dk-entities' });
    document.body.append(dl);
    entityList().then((l) => l.forEach((x) => dl.append(h('option', { value: x.LogicalName })))).catch(() => {});
  }
  return h('input', { list: 'dk-entities', placeholder, spellcheck: 'false', style: `width:${width}px` });
}

async function currentRecord() {
  try { return await call('recordInfo'); } catch (e) { return null; }
}

// ---- métadonnées ----
const _attrCache = new Map();
async function attributesOf(e) {
  if (!isName(e)) throw new Error('Nom de table invalide : ' + e);
  if (!_attrCache.has(e)) {
    _attrCache.set(e, await rows(`EntityDefinitions(LogicalName='${e}')/Attributes?$select=LogicalName,SchemaName,AttributeType,RequiredLevel,DisplayName,Description,IsCustomAttribute,IsAuditEnabled,IsSecured,IsValidForRead,IsValidForAdvancedFind,AttributeOf,IsPrimaryId,IsPrimaryName`));
  }
  return _attrCache.get(e);
}

const _osCache = new Map();
async function optionSetsOf(e) {
  if (!isName(e)) throw new Error('Nom de table invalide : ' + e);
  if (_osCache.has(e)) return _osCache.get(e);
  const out = [];
  const kinds = [['PicklistAttributeMetadata', 'O'], ['MultiSelectPicklistAttributeMetadata', 'O'], ['StatusAttributeMetadata', 'O'], ['StateAttributeMetadata', 'O'], ['BooleanAttributeMetadata', 'B']];
  for (const [kind, shape] of kinds) {
    const expand = shape === 'B' ? 'OptionSet($select=TrueOption,FalseOption)' : 'OptionSet($select=Options)';
    const r = await rows(`EntityDefinitions(LogicalName='${e}')/Attributes/Microsoft.Dynamics.CRM.${kind}?$select=LogicalName&$expand=${expand}`);
    r.forEach((a) => {
      const os = a.OptionSet;
      if (!os) return;
      const opts = shape === 'B' ? [os.FalseOption, os.TrueOption].filter(Boolean) : os.Options || [];
      opts.forEach((o) => out.push({ Champ: a.LogicalName, Valeur: o.Value, 'Libellé': label(o.Label), Type: kind.replace('AttributeMetadata', '') }));
    });
  }
  _osCache.set(e, out);
  return out;
}

async function relationsOf(e) {
  if (!isName(e)) throw new Error('Nom de table invalide : ' + e);
  const r = (await q(`EntityDefinitions(LogicalName='${e}')?$select=LogicalName&$expand=OneToManyRelationships($select=SchemaName,ReferencingEntity,ReferencingAttribute),ManyToOneRelationships($select=SchemaName,ReferencedEntity,ReferencingAttribute),ManyToManyRelationships($select=SchemaName,Entity1LogicalName,Entity2LogicalName)`)).data;
  return { oneToMany: r.OneToManyRelationships || [], manyToOne: r.ManyToOneRelationships || [], manyToMany: r.ManyToManyRelationships || [] };
}

const isFillable = (a) => a.IsValidForRead && a.AttributeOf == null
  && a.IsValidForAdvancedFind && a.IsValidForAdvancedFind.Value
  && !['Virtual', 'ManagedProperty', 'EntityName', 'PartyList'].includes(a.AttributeType);

// Nombre de valeurs renseignées par colonne (agrégats FetchXML, limite Dataverse : 50 000 lignes).
async function fillRates(e, names, onProgress) {
  const ent = (await entityList()).find((x) => x.LogicalName === e);
  const pk = (ent && ent.PrimaryIdAttribute) || `${e}id`;
  const counts = {}, errors = {};
  let total = 0;
  const blocks = DK.chunk(names, 15);
  const one = async (list) => {
    const res = await call('fetchxml', { fetchXml: DK.fillFetch(e, pk, list), callerId: state.callerId });
    const row = res.value[0] || {};
    total = row.total ?? total;
    list.forEach((n, i) => { counts[n] = row[`c${i}`] ?? 0; });
  };
  let done = 0;
  for (const b of blocks) {
    try { await one(b); } catch (err) {
      if (/limit|AggregateQuery|50[  ,]?000/i.test(err.message)) throw new Error('Table trop volumineuse pour les agrégats Dataverse (limite 50 000 lignes). Filtrez par période dans une requête FetchXML dédiée.');
      for (const n of b) { try { await one([n]); } catch (e2) { errors[n] = e2.message; } }
    }
    if (onProgress) onProgress(++done, blocks.length);
  }
  return { counts, errors, total };
}

// ---- recherche texte ----
const termRegex = (term) => new RegExp('(?<![A-Za-z0-9_])' + String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])', 'i');

// Recherche dans les web resources JS/HTML. Deux temps pour éviter les délais dépassés :
// 1) liste légère (noms + ID), 2) contenu par petits lots en parallèle. Les lots en échec sont comptés.
async function scanWebResources(re, includeManaged, onProgress) {
  const f = `(webresourcetype eq 3 or webresourcetype eq 1)${includeManaged ? '' : ' and ismanaged eq false'}`;
  const list = await rows(`webresourceset?$select=name,webresourceid&$filter=${f}&$orderby=name`, { maxPages: 100, pageSize: 500 });
  const chunks = [];
  for (let i = 0; i < list.length; i += 10) chunks.push(list.slice(i, i + 10));
  const hits = [];
  const res = await pool(chunks, 3, async (part) => {
    const r = await rows(`webresourceset?$select=name,content&$filter=${part.map((w) => `webresourceid eq ${w.webresourceid}`).join(' or ')}`, { pageSize: 10 });
    r.forEach((w) => {
      let txt = '';
      try { txt = new TextDecoder().decode(Uint8Array.from(atob(w.content || ''), (c) => c.charCodeAt(0))); } catch (e) { return; }
      let count = 0, first = null;
      txt.split(/\r?\n/).forEach((ln, i) => { if (re.test(ln)) { count++; if (!first) first = { line: i + 1, text: ln.trim().slice(0, 160) }; } });
      if (count) hits.push({ name: w.name, count, line: first.line, text: first.text });
    });
  }, onProgress ? (d, n) => onProgress(d * 10 > list.length ? list.length : d * 10, list.length) : null);
  hits.sort((x, y) => x.name.localeCompare(y.name));
  hits.total = list.length;
  hits.skipped = res.filter((x) => !x.ok).reduce((n, x, i) => n + chunks[res.indexOf(x)].length, 0);
  hits.firstError = (res.find((x) => !x.ok) || {}).e;
  return hits;
}

// ---- sélecteur d'utilisateur ----
function userPicker(onPick) {
  const input = h('input', { placeholder: 'Nom contient…' });
  const out = h('div');
  const go = () => guarded(out, async () => {
    const t = input.value.trim();
    const r = await rows(`systemusers?$select=fullname,domainname,systemuserid&$filter=${t ? `contains(fullname,'${esc(t)}') and ` : ''}isdisabled eq false and accessmode ne 4&$orderby=fullname&$top=50`);
    return dataTable(r.map((u) => ({ Nom: u.fullname, Compte: u.domainname, ID: u.systemuserid })), {
      exportName: 'utilisateurs',
      onRow: (u) => { onPick({ id: u.ID, name: u.Nom }); },
    });
  });
  return h('div', {}, h('div', { class: 'toolbar' }, input, h('button', { onclick: go }, 'Chercher')), out);
}

// ---- exports ----
function saveBlob(name, blob) { download(name, blob, blob.type); }
function stamp() { return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'); }


// ---------- Boîtes de dialogue (remplacent confirm / prompt / alert) ----------
function dialog({ title = 'Confirmation', message = '', confirmText = 'Confirmer', danger = false, input = false, expect = null, inputLabel = '', placeholder = '', optional = false, secret = false }) {
  return new Promise((resolve) => {
    const needInput = input || expect != null;
    const field = needInput ? h('input', { type: secret ? 'password' : 'text', placeholder, spellcheck: 'false', autocomplete: 'off' }) : null;
    const ok = h('button', { class: danger ? 'danger-solid' : 'primary' }, confirmText);
    const cancel = h('button', {}, 'Annuler');
    const sync = () => { ok.disabled = !!field && (expect != null ? field.value.trim() !== String(expect) : !optional && !field.value.trim()); };
    const close = (v) => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); };
    const submit = () => { if (!ok.disabled) close(field ? field.value.trim() : true); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); } };
    const back = h('div', { class: 'dlg-back', onclick: (e) => { if (e.target === back) close(null); } },
      h('div', { class: 'dlg' + (danger ? ' danger' : ''), role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'dlg-head' }, h('span', { class: 'dlg-ico' }, danger ? '⚠' : '❓'), h('h3', {}, title)),
        h('div', { class: 'dlg-body' },
          h('p', {}, message),
          field ? h('label', { class: 'field' }, h('span', {}, inputLabel || (expect != null ? `Tapez ${expect} pour confirmer` : 'Valeur')), field) : null),
        h('div', { class: 'dlg-foot' }, cancel, ok)));
    ok.onclick = submit;
    cancel.onclick = () => close(null);
    if (field) field.oninput = sync;
    document.addEventListener('keydown', onKey, true);
    document.body.append(back);
    sync();
    (field || ok).focus();
  });
}
const confirmBox = (message, o = {}) => dialog({ title: 'Confirmation', message, ...o }).then((v) => v !== null);
const promptBox = (message, o = {}) => dialog({ title: 'Saisie', message, input: true, confirmText: 'Valider', ...o });
