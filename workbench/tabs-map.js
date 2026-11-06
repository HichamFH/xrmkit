'use strict';
// Cartographie des processus : pour une table, qui se déclenche (plug-ins, flux, workflows, règles), dans quel ordre,
// et quelles cascades cela provoque (un flux qui modifie une autre table déclenche d'autres automatisations…).
// Logique pure dans logic.js (DK.flowGraph, DK.cascade, DK.processFindings) ; ici : collecte, rendu, exports.

Xrmkit.registerTab({
  id: 'pmap', group: 'Technique', order: 5, icon: 'network', title: 'Cartographie des processus',
  desc: 'Pour une table : plug-ins, flux, workflows et règles dans leur ordre d\'exécution, cascades entre tables et risques de boucle.',
  i18n: { en: { title: 'Process map', desc: 'For a table: plug-ins, flows, workflows and rules in execution order, cascades between tables and loop risks.' } },
  render: (root) => pmapTab(root),
});

const PMAP_LANES = [
  ['client', 'Règles métier'], ['pre-val', 'Pré-validation (10)'], ['pre-op', 'Pré-opération (20)'], ['main', 'Principal (30)'],
  ['post-sync', 'Post-opération synchrone'], ['async', 'Asynchrone'],
];
const PMAP_COLORS = { 'Plug-in': '#2563eb', Flux: '#0e9f8e', Workflow: '#7c3aed', 'Règle métier': '#d97706', Action: '#be185d', Processus: '#475569' };
let _pmapCache = null;

// ---- collecte (une fois par session ; « Recharger » pour forcer) ----
async function pmapCollect(progress, force) {
  if (_pmapCache && !force && Date.now() - _pmapCache.t < 10 * 60000) return _pmapCache;
  const ents = await entityList();
  const setToLogical = Object.fromEntries(ents.map((e) => [String(e.EntitySetName).toLowerCase(), e.LogicalName]));
  const items = [], warns = [];
  const part = async (label, fn) => { progress(label); try { await fn(); } catch (e) { warns.push(`${label} ${e.message}`); } };
  const fvKey = (k) => `${k}@OData.Community.Display.V1.FormattedValue`;

  await part('Plug-ins…', async () => {
    const r = await rows('sdkmessageprocessingsteps?$select=name,stage,mode,rank,statecode,filteringattributes,ismanaged,sdkmessageprocessingstepid&$filter=ishidden/Value eq false', { formatted: true, maxPages: 50, pageSize: 500 });
    r.forEach((s) => {
      const mm = /^(.+?) of (\w+)$/.exec(s[fvKey('_sdkmessagefilterid_value')] || '');
      if (!mm) return;
      const message = mm[1], entity = mm[2].toLowerCase();
      const events = ['Create', 'Update', 'Delete'].includes(message) ? [message] : ['Other'];
      const sync = s.mode === 0;
      const lane = s.stage === 10 ? 'pre-val' : s.stage === 20 ? 'pre-op' : s.stage === 30 ? 'main' : sync ? 'post-sync' : 'async';
      items.push({
        id: 'p:' + s.sdkmessageprocessingstepid, kind: 'Plug-in', name: s.name, active: s.statecode === 0, state: s.statecode === 0 ? 'Activé' : 'Désactivé', managed: !!s.ismanaged,
        lane, sync, mode: sync ? 'Synchrone' : 'Asynchrone', entity, message, rank: s.rank,
        triggers: [{ entity, events, filter: String(s.filteringattributes || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) }], writes: [],
      });
    });
  });

  await part('Workflows et règles…', async () => {
    const r = await rows('workflows?$select=name,workflowid,category,primaryentity,statecode,mode,triggeroncreate,triggerondelete,triggeronupdateattributelist,ondemand,ismanaged&$filter=type eq 1 and (category eq 0 or category eq 2 or category eq 3 or category eq 4)', { formatted: false, maxPages: 50, pageSize: 200 });
    r.forEach((w) => {
      const entity = w.primaryentity && w.primaryentity !== 'none' ? String(w.primaryentity).toLowerCase() : '';
      const events = [];
      if (w.triggeroncreate) events.push('Create');
      if (w.triggerondelete) events.push('Delete');
      const upd = w.triggeronupdateattributelist != null && w.triggeronupdateattributelist !== '';
      if (upd) events.push('Update');
      const base = { id: 'w:' + w.workflowid, name: w.name, active: w.statecode === 1, state: w.statecode === 1 ? 'Activé' : w.statecode === 2 ? 'Suspendu' : 'Brouillon', managed: !!w.ismanaged, entity, writes: [], triggers: [] };
      if (w.category === 2) items.push({ ...base, kind: 'Règle métier', lane: 'client', sync: false, mode: 'Formulaire / serveur' });
      else if (w.category === 3) items.push({ ...base, kind: 'Action', lane: 'autre', sync: false, mode: 'À la demande' });
      else if (w.category === 4) items.push({ ...base, kind: 'Processus', lane: 'autre', sync: false, mode: 'Processus métier' });
      else {
        const sync = w.mode === 1;
        items.push({ ...base, kind: 'Workflow', lane: sync ? 'post-sync' : 'async', sync, mode: sync ? 'Synchrone (temps réel)' : 'Asynchrone',
          triggers: entity && events.length ? [{ entity, events, filter: upd ? String(w.triggeronupdateattributelist).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) : [] }] : [] });
      }
    });
  });

  await part('Flux cloud…', async () => {
    const r = await rows('workflows?$select=name,workflowid,statecode,clientdata,ismanaged&$filter=category eq 5', { formatted: false, maxPages: 50, pageSize: 200 });
    r.forEach((w) => {
      const g = DK.flowGraph(w.clientdata, setToLogical);
      items.push({
        id: 'f:' + w.workflowid, kind: 'Flux', name: w.name, active: w.statecode === 1, state: w.statecode === 1 ? 'Activé' : w.statecode === 2 ? 'Suspendu' : 'Brouillon', managed: !!w.ismanaged,
        lane: 'async', sync: false, mode: 'Asynchrone', entity: g.trigger.entity, triggerText: g.trigger.text, children: g.children, nbActions: g.actions,
        triggers: g.trigger.entity && g.trigger.events.length ? [{ entity: g.trigger.entity, events: g.trigger.events, filter: g.trigger.filter }] : [],
        writes: g.writes.map((x) => ({ entity: x.entity, event: x.event, fields: x.fields, action: x.action })),
      });
    });
  });
  progress('');
  _pmapCache = { items, warns, ents, t: Date.now() };
  return _pmapCache;
}

// ---- modèle d'une table ----
function pmapModel(all, entity, evChoice, includeManaged) {
  const items = all.items.filter((it) => includeManaged || !it.managed);
  const events = evChoice === 'all' ? ['Create', 'Update', 'Delete', 'Other'] : [evChoice];
  const onTable = items.filter((it) => (it.triggers || []).some((t) => t.entity === entity && t.events.some((e) => events.includes(e))));
  const attached = items.filter((it) => !it.triggers.length && it.entity === entity); // règles métier, actions, processus
  const own = [...onTable, ...attached.filter((a) => !onTable.includes(a))];
  const cascades = [];
  let truncated = false;
  (evChoice === 'all' ? ['Create', 'Update', 'Delete'] : [evChoice]).filter((e) => e !== 'Other').forEach((ev) => {
    const tree = DK.cascade(items, entity, ev);
    truncated = truncated || tree.truncated;
    DK.flattenCascade(tree).forEach((n) => cascades.push({ ev, n }));
  });
  const findings = DK.processFindings(items, entity, cascades.map((c) => c.n));
  return { entity, events, own, onTable, attached, cascades, findings, truncated, all: items };
}

const pmapEvents = (it, entity) => [...new Set((it.triggers || []).filter((t) => t.entity === entity).flatMap((t) => t.events))].map((e) => DK.EVENT_FR[e]).join(', ');
const pmapFilter = (it, entity) => (it.triggers || []).filter((t) => t.entity === entity).flatMap((t) => t.filter || []).join(', ');
const pmapEffects = (it) => (it.writes || []).map((w) => `${DK.EVENT_FR[w.event]} ${w.entity}${w.fields && w.fields.length ? ' (' + w.fields.slice(0, 4).join(', ') + (w.fields.length > 4 ? '…' : '') + ')' : ''}`).join(' ; ');

function pmapRows(m) {
  const laneName = Object.fromEntries([...PMAP_LANES, ['autre', 'À la demande / processus']]);
  const order = ['client', 'pre-val', 'pre-op', 'main', 'post-sync', 'async', 'autre'];
  return [...m.own].sort((a, b) => order.indexOf(a.lane) - order.indexOf(b.lane) || (a.rank || 0) - (b.rank || 0) || a.name.localeCompare(b.name)).map((it) => ({
    Étape: laneName[it.lane] || it.lane, Type: it.kind, Nom: it.name, Mode: it.mode, Événement: pmapEvents(it, m.entity) || '—', 'Filtre (attributs)': pmapFilter(it, m.entity),
    État: it.state, 'Effets sur d\'autres tables': pmapEffects(it), Rang: it.rank ?? '',
  }));
}
function pmapCascadeRows(m) {
  return m.cascades.map(({ ev, n }) => ({
    Événement: `${DK.EVENT_FR[ev]} ${m.entity}`, Niveau: n.depth + 1,
    Déclencheur: n.via.from ? `${n.via.from} → ${DK.EVENT_FR[n.via.event].toLowerCase()} ${n.via.entity}` : 'Action utilisateur / API',
    Automatisation: '↳ '.repeat(n.depth) + n.item.name, Type: n.item.kind, Effets: pmapEffects(n.item), Boucle: n.loop ? 'oui' : '',
  }));
}

// ---- diagramme SVG (colonnes = étapes du pipeline Dataverse) ----
function pmapSvg(m, titleEvent) {
  const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const cols = PMAP_LANES.filter(([id]) => id !== 'main' || m.own.some((i) => i.lane === 'main'));
  const W = 196, G = 14, BH = 46, HEAD = 56, MAXB = 12;
  const lists = cols.map(([id]) => m.own.filter((i) => i.lane === id).sort((a, b) => (a.rank || 0) - (b.rank || 0) || a.name.localeCompare(b.name)));
  const rowsMax = Math.max(1, ...lists.map((l) => Math.min(l.length, MAXB + 1)));
  const width = cols.length * (W + G) + G, height = HEAD + rowsMax * (BH + 8) + 40;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Inter,Segoe UI,Arial,sans-serif" role="img" aria-label="Cartographie des processus">`;
  s += `<rect width="${width}" height="${height}" fill="#ffffff"/>`;
  s += `<text x="${G}" y="22" font-size="14" font-weight="700" fill="#14225e">${x(`${T(titleEvent)} — ${m.entity}`)}</text>`;
  cols.forEach(([id, lab], c) => {
    const cx = G + c * (W + G);
    s += `<rect x="${cx}" y="34" width="${W}" height="${height - 44}" rx="8" fill="#f4f6fb" stroke="#e1e3ea"/>`;
    s += `<text x="${cx + W / 2}" y="52" font-size="11" font-weight="700" fill="#475569" text-anchor="middle">${x(T(lab))}</text>`;
    const list = lists[c];
    list.slice(0, MAXB).forEach((it, r) => {
      const y = HEAD + r * (BH + 8), col = PMAP_COLORS[it.kind] || '#475569';
      s += `<g opacity="${it.active ? 1 : 0.45}"><title>${x(`${T(it.kind)} : ${it.name} — ${T(it.state)}`)}</title>`;
      s += `<rect x="${cx + 8}" y="${y}" width="${W - 16}" height="${BH}" rx="6" fill="#fff" stroke="${col}" stroke-width="1.5"${it.active ? '' : ' stroke-dasharray="4 3"'}/>`;
      s += `<rect x="${cx + 8}" y="${y}" width="5" height="${BH}" rx="2" fill="${col}"/>`;
      s += `<text x="${cx + 20}" y="${y + 17}" font-size="9.5" fill="${col}" font-weight="700">${x(T(it.kind).toUpperCase() + (it.sync ? ' · SYNC' : ''))}</text>`;
      s += `<text x="${cx + 20}" y="${y + 34}" font-size="11.5" fill="#1f2937">${x(cut(it.name, 25))}</text></g>`;
    });
    if (list.length > MAXB) s += `<text x="${cx + W / 2}" y="${HEAD + MAXB * (BH + 8) + 14}" font-size="11" fill="#64748b" text-anchor="middle">${x(T(`+ ${list.length - MAXB} autre(s)`))}</text>`;
    if (c < cols.length - 1) s += `<path d="M${cx + W + 2} 44 l${G - 4} 0" stroke="#94a3b8" stroke-width="1.5" marker-end="url(#a)"/>`;
  });
  s += '<defs><marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#94a3b8"/></marker></defs>';
  return s + '</svg>';
}
function svgNode(str) {
  const doc = new DOMParser().parseFromString(str, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}

// ---- données du rapport Word ----
const PMAP_SPEC = {
  key: 'pmap', fileName: 'cartographie',
  vars: [['environnement', 'Environnement'], ['date', 'Date de génération'], ['table', 'Table (nom logique)'], ['table_libelle', 'Table (libellé)'], ['evenement', 'Événement analysé'],
    ['nb_automatisations', 'Nombre d\'automatisations'], ['nb_synchrones', 'Dont synchrones'], ['nb_asynchrones', 'Dont asynchrones'], ['nb_desactivees', 'Dont désactivées'],
    ['nb_cascades', 'Nombre de déclenchements en cascade'], ['nb_points_attention', 'Nombre de points d\'attention'], ['mermaid', 'Diagramme Mermaid (texte)']],
  lists: [
    { name: 'automatisations', desc: 'Automatisations de la table', fields: [['etape', 'Étape'], ['type', 'Type'], ['nom', 'Nom'], ['mode', 'Mode'], ['evenement', 'Événement'], ['filtre', 'Filtre'], ['etat', 'État'], ['effets', 'Effets sur d\'autres tables']] },
    { name: 'cascades', desc: 'Déclenchements en cascade', fields: [['evenement', 'Événement'], ['niveau', 'Niveau'], ['declencheur', 'Déclencheur'], ['automatisation', 'Automatisation'], ['type', 'Type'], ['boucle', 'Boucle']] },
    { name: 'points_attention', desc: 'Points d\'attention', fields: [['gravite', 'Gravité'], ['message', 'Constat']] },
  ],
};
function pmapData(m, evLabel, tableLabel) {
  const a = pmapRows(m), c = pmapCascadeRows(m);
  const roots = m.cascades.filter((x) => x.n.depth === 0);
  const tree = (ev) => DK.cascade(m.all, m.entity, ev);
  return {
    environnement: orgName(), date: new Date().toLocaleString('fr-FR'), table: m.entity, table_libelle: tableLabel || m.entity, evenement: evLabel,
    nb_automatisations: m.own.length, nb_synchrones: m.own.filter((i) => i.sync).length, nb_asynchrones: m.own.filter((i) => !i.sync && i.lane !== 'autre' && i.lane !== 'client').length,
    nb_desactivees: m.own.filter((i) => !i.active).length, nb_cascades: c.length, nb_points_attention: m.findings.length,
    mermaid: roots.length ? DK.mermaid(tree(roots[0].ev), `${DK.EVENT_FR[roots[0].ev]} ${m.entity}`) : '',
    automatisations: a.map((r) => ({ etape: r['Étape'], type: r.Type, nom: r.Nom, mode: r.Mode, evenement: r['Événement'], filtre: r['Filtre (attributs)'], etat: r['État'], effets: r["Effets sur d'autres tables"] })),
    cascades: c.map((r) => ({ evenement: r['Événement'], niveau: r.Niveau, declencheur: r['Déclencheur'], automatisation: r.Automatisation, type: r.Type, boucle: r.Boucle })),
    points_attention: m.findings.map(([g, msg]) => ({ gravite: g, message: msg })),
  };
}

async function pmapTab(root) {
  const entBox = entityBox('table (nom logique)', 240);
  const evSel = h('select', {}, [['all', 'Tous les événements'], ['Create', 'Création'], ['Update', 'Modification'], ['Delete', 'Suppression']].map(([v, l]) => h('option', { value: v }, l)));
  const mgd = h('input', { type: 'checkbox' });
  const prog = progressLine(), out = h('div'), tplHost = h('div');
  let last = null;
  const cur = await currentRecord();
  if (cur) entBox.value = cur.entity;

  async function run(force) {
    const entity = entBox.value.trim().toLowerCase();
    await guarded(out, async () => {
      if (!isName(entity)) throw new Error('Saisissez le nom logique d\'une table (ex. account).');
      const all = await pmapCollect((t) => prog.set(t), force);
      const m = pmapModel(all, entity, evSel.value, mgd.checked);
      const evLabel = evSel.value === 'all' ? 'Tous les événements' : DK.EVENT_FR[evSel.value];
      const meta = (all.ents || []).find((e) => e.LogicalName === entity);
      last = { m, evLabel, tableLabel: meta ? label(meta.DisplayName) : entity };
      tplHost.replaceChildren(Reports.panel({ ...PMAP_SPEC, title: 'Cartographie des processus', getData: async () => pmapData(last.m, last.evLabel, last.tableLabel) }));
      const sev = { haute: 'error', moyenne: 'muted', info: 'muted' };
      return h('div', {},
        all.warns.length ? h('p', { class: 'error' }, 'Collecte incomplète (droits ?) : ' + all.warns.join(' | ')) : null,
        h('div', { class: 'toolbar' },
          h('span', { class: 'badge' }, `${m.own.length} automatisation(s)`), h('span', { class: 'badge' }, `${m.own.filter((i) => i.sync).length} synchrone(s)`),
          h('span', { class: 'badge' }, `${m.cascades.length} déclenchement(s) en cascade`), h('span', { class: 'badge' }, `${m.findings.length} point(s) d'attention`)),
        m.findings.length ? h('div', {}, h('h2', {}, 'Points d\'attention'), ...m.findings.map(([g, msg]) => h('p', { class: sev[g] }, (g === 'haute' ? '⚠ ' : '• ') + msg))) : h('p', { class: 'ok' }, 'Aucun point d\'attention détecté sur les automatisations connues.'),
        h('h2', {}, 'Ordre d\'exécution'),
        h('p', { class: 'muted' }, 'Dataverse exécute : règles → pré-validation → pré-opération → opération → post-opération synchrone ; puis, en différé, plug-ins asynchrones, flux et workflows asynchrones. Les composants désactivés sont en pointillés.'),
        h('div', { class: 'scroll', style: 'background:#fff;border-radius:10px;padding:6px' }, svgNode(pmapSvg(m, evLabel))),
        dataTable(pmapRows(m), { exportName: `automatisations-${entity}`, empty: 'Aucune automatisation connue sur cette table.' }),
        h('h2', {}, 'Cascades'),
        h('p', { class: 'muted' }, 'Ce qui se déclenche quand un flux cloud écrit dans une autre table (ou dans la même). Les plug-ins ne sont pas analysés en profondeur : leur code peut modifier d\'autres tables sans que Xrmkit puisse le voir.'),
        m.truncated ? h('p', { class: 'error' }, 'Cascade tronquée (trop de chemins) : affinez l\'événement ou la table.') : null,
        dataTable(pmapCascadeRows(m), { exportName: `cascades-${entity}`, empty: 'Aucune cascade : aucun flux ne déclenche d\'autre automatisation à partir de cette table.' }));
    });
  }

  const exportXlsx = () => guarded(prog, async () => {
    if (!last) throw new Error('Lancez d\'abord une analyse.');
    const { m } = last, a = pmapRows(m), c = pmapCascadeRows(m);
    const sheet = (name, data, empty) => ({ name, rows: data.length ? [Object.keys(data[0]), ...data.map((r) => Object.values(r))] : [[empty]] });
    saveBlob(`cartographie-${m.entity}-${stamp()}.xlsx`, Office.xlsx([sheet('Automatisations', a, 'Aucune'), sheet('Cascades', c, 'Aucune'), { name: 'Points d\'attention', rows: [['Gravité', 'Constat'], ...m.findings] }]));
    return h('p', { class: 'ok' }, 'Fichier Excel généré.');
  });
  const exportDocx = () => guarded(prog, async () => {
    if (!last) throw new Error('Lancez d\'abord une analyse.');
    const { m, evLabel } = last, a = pmapRows(m), c = pmapCascadeRows(m);
    const B = [{ t: 'title', text: `Cartographie des processus — ${m.entity}` }, { t: 'p', text: `Environnement : ${orgName()} — ${new Date().toLocaleString('fr-FR')} — ${evLabel}` }];
    B.push({ t: 'h1', text: 'Points d\'attention' });
    if (m.findings.length) B.push({ t: 'table', header: ['Gravité', 'Constat'], rows: m.findings }); else B.push({ t: 'p', text: 'Aucun point d\'attention détecté.' });
    B.push({ t: 'h1', text: 'Automatisations' });
    B.push(a.length ? { t: 'table', header: ['Étape', 'Type', 'Nom', 'Mode', 'Événement', 'Filtre', 'État', 'Effets'], rows: a.map((r) => [r['Étape'], r.Type, r.Nom, r.Mode, r['Événement'], r['Filtre (attributs)'], r['État'], r["Effets sur d'autres tables"]]) } : { t: 'p', text: 'Aucune.' });
    B.push({ t: 'h1', text: 'Cascades' });
    B.push(c.length ? { t: 'table', header: ['Événement', 'Niveau', 'Déclencheur', 'Automatisation', 'Type', 'Boucle'], rows: c.map((r) => [r['Événement'], r.Niveau, r['Déclencheur'], r.Automatisation, r.Type, r.Boucle]) } : { t: 'p', text: 'Aucune.' });
    saveBlob(`cartographie-${m.entity}-${stamp()}.docx`, Office.docx(B, { landscape: true }));
    return h('p', { class: 'ok' }, 'Document Word généré.');
  });
  const exportSvg = () => { if (last) saveBlob(`cartographie-${last.m.entity}-${stamp()}.svg`, new Blob([pmapSvg(last.m, last.evLabel)], { type: 'image/svg+xml' })); else toast('Lancez d\'abord une analyse.', true); };
  const copyMermaid = async () => {
    if (!last) { toast('Lancez d\'abord une analyse.', true); return; }
    const r = last.m.cascades.find((x) => x.n.depth === 0);
    if (!r) { toast('Aucune cascade à exporter.', true); return; }
    await navigator.clipboard.writeText(DK.mermaid(DK.cascade(last.m.all, last.m.entity, r.ev), `${DK.EVENT_FR[r.ev]} ${last.m.entity}`));
    toast('✓ Diagramme Mermaid copié');
  };

  root.append(
    h('p', { class: 'muted' }, 'Choisissez une table : Xrmkit lit les plug-ins, flux cloud, workflows et règles de l\'environnement, puis montre ce qui se déclenche, dans quel ordre, et les cascades vers d\'autres tables.'),
    h('div', { class: 'toolbar' }, entBox, evSel, h('label', { class: 'inline' }, mgd, 'Inclure les composants gérés'),
      h('button', { class: 'primary', onclick: () => run(false) }, 'Analyser'), h('button', { onclick: () => run(true) }, 'Recharger les données')),
    h('div', { class: 'toolbar' }, h('button', { onclick: exportDocx }, 'Rapport Word (.docx)'), h('button', { onclick: exportXlsx }, 'Excel (.xlsx)'), h('button', { onclick: exportSvg }, 'Diagramme (.svg)'), h('button', { onclick: copyMermaid }, 'Copier en Mermaid')),
    prog, out, tplHost);
}
