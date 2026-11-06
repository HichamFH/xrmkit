'use strict';
// v0.5 : comparaison d'environnements en direct, performance, debug de formulaire,
// santé des flux, éléments hors solution, générateur de données depuis le modèle.

Object.assign(TITLES, {
  cmp: 'Comparer deux environnements',
  perf: 'Analyse de performance',
  fdebug: 'Debug de formulaire',
  fhealth: 'Santé des flux',
  orphan: 'Éléments hors solution',
  gen: 'Données de test (modèle)',
});

// Appel vers un onglet Dynamics quelconque (et pas seulement celui du Workbench).
function callOn(tid, action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tid, { xrmkit: true, action, payload }, (res) => {
      if (chrome.runtime.lastError) return reject(new Error('Onglet injoignable : rechargez-le (F5).'));
      if (!res || !res.ok) return reject(new Error((res && res.error) || 'Erreur inconnue'));
      resolve(res.data);
    });
  });
}
const rowsOn = async (tid, path, opts = {}) => (await callOn(tid, 'webapi', { path, maxPages: 10, pageSize: 5000, ...opts })).value;
const fmtMs = (n) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${n} ms`);
const fmtKo = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.round(n / 1024)} Ko`);
const badge = (txt, cls) => h('span', { class: `pill ${cls || ''}` }, txt);
const kpi = (label_, value, sub) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-v' }, value), h('div', { class: 'kpi-l' }, label_), sub ? h('div', { class: 'muted' }, sub) : null);

// =====================================================================
// 1. Comparaison d'environnements en direct
// =====================================================================
const CMP_DEFS = {
  Solutions: ['solutions?$select=uniquename,version,ismanaged&$filter=isvisible eq true', (r) => [r.uniquename, `${r.version} ${r.ismanaged ? '(gérée)' : '(non gérée)'}`]],
  'Tables personnalisées': ['EntityDefinitions?$select=LogicalName,IsManaged&$filter=IsCustomEntity eq true', (r) => [r.LogicalName, r.IsManaged ? 'gérée' : 'non gérée']],
  'Rôles de sécurité': ['roles?$select=name&$filter=_parentroleid_value eq null', (r) => [r.name, '']],
  'Assemblies de plug-ins': ['pluginassemblies?$select=name,version&$filter=ishidden/Value eq false', (r) => [r.name, r.version]],
  'Étapes de plug-ins': ['sdkmessageprocessingsteps?$select=name,stage,mode,statecode&$filter=ishidden/Value eq false', (r) => [r.name, `stage ${r.stage} / mode ${r.mode} / ${r.statecode === 0 ? 'activée' : 'désactivée'}`]],
  'Web resources': ['webresourceset?$select=name,webresourcetype&$filter=ishidden/Value eq false and ismanaged eq false', (r) => [r.name, `type ${r.webresourcetype}`]],
  'Processus & flows': ['workflows?$select=name,category,statecode&$filter=type eq 1', (r) => [`${r.name} [${WF_CATS[r.category] || 'cat ' + r.category}]`, r.statecode === 1 ? 'activé' : r.statecode === 2 ? 'suspendu' : 'brouillon']],
  'Variables d\'environnement (définitions)': ['environmentvariabledefinitions?$select=schemaname,defaultvalue', (r) => [r.schemaname, r.defaultvalue ?? '']],
  'Variables d\'environnement (valeurs actuelles)': ['environmentvariablevalues?$select=value&$expand=EnvironmentVariableDefinitionId($select=schemaname)', (r) => [(r.EnvironmentVariableDefinitionId || {}).schemaname || '?', r.value ?? '']],
  'Références de connexion': ['connectionreferences?$select=connectionreferencelogicalname,connectorid', (r) => [r.connectionreferencelogicalname, r.connectorid || '']],
  'Applications pilotées par modèle': ['appmodules?$select=uniquename,statecode', (r) => [r.uniquename, r.statecode === 0 ? 'active' : 'inactive']],
};
const CMP_INFO_ONLY = ['Variables d\'environnement (valeurs actuelles)']; // différences attendues : affichées mais séparées

async function discoverOtherEnvs() {
  const found = await chrome.tabs.query({ url: ['https://*.dynamics.com/*', 'https://*.dynamics.us/*', 'https://*.dynamics.cn/*', 'https://*.appsplatform.us/*'] });
  const mine = await call('envInfo').catch(() => ({}));
  const out = new Map();
  for (const t of found) {
    if (t.id === tabId) continue;
    try {
      const i = await callOn(t.id, 'envInfo');
      if (!i.URL || i.URL === mine.URL || out.has(i.URL)) continue;
      out.set(i.URL, { tid: t.id, url: i.URL, org: i['Organisation (nom unique)'] || i.URL, version: i.Version });
    } catch (e) { /* onglet sans le script Xrmkit */ }
  }
  return { mine, others: [...out.values()] };
}

async function loadEnvData(tid, cats, onProgress) {
  const data = {}, errors = {};
  let done = 0;
  await pool(cats, 3, async (cat) => {
    const [path, kv] = CMP_DEFS[cat];
    try {
      const m = {};
      (await rowsOn(tid, path)).forEach((r) => { const [k, v] = kv(r); m[String(k)] = String(v); });
      data[cat] = m;
    } catch (e) { errors[cat] = e.message; }
    onProgress(++done, cats.length);
  });
  return { data, errors };
}

function diffEnvs(A, B, cats) {
  const out = [];
  for (const cat of cats) {
    if (!A.data[cat] || !B.data[cat]) continue;
    const x = A.data[cat], y = B.data[cat];
    new Set([...Object.keys(x), ...Object.keys(y)]).forEach((k) => {
      if (!(k in y)) out.push({ Catégorie: cat, Élément: k, 'Valeur A': x[k], 'Valeur B': '—', Statut: 'Seulement dans A' });
      else if (!(k in x)) out.push({ Catégorie: cat, Élément: k, 'Valeur A': '—', 'Valeur B': y[k], Statut: 'Seulement dans B' });
      else if (x[k] !== y[k]) out.push({ Catégorie: cat, Élément: k, 'Valeur A': x[k], 'Valeur B': y[k], Statut: 'Différent' });
    });
  }
  return out;
}

async function exportCmp(kind, A, B, out, cats) {
  const summary = cats.map((c) => {
    const r = out.filter((x) => x['Catégorie'] === c);
    return [c, A.data[c] ? Object.keys(A.data[c]).length : '—', B.data[c] ? Object.keys(B.data[c]).length : '—', r.filter((x) => x.Statut === 'Seulement dans A').length, r.filter((x) => x.Statut === 'Seulement dans B').length, r.filter((x) => x.Statut === 'Différent').length];
  });
  const head = ['Catégorie', 'Élément', `Valeur A (${A.name})`, `Valeur B (${B.name})`, 'Statut'];
  const detail = out.map((x) => [x['Catégorie'], x['Élément'], x['Valeur A'], x['Valeur B'], x.Statut]);
  const sumHead = ['Catégorie', `Éléments A`, `Éléments B`, 'Seulement dans A', 'Seulement dans B', 'Différents'];
  if (kind === 'xlsx') {
    saveBlob(`comparaison-${stamp()}.xlsx`, Office.xlsx([{ name: 'Résumé', rows: [sumHead, ...summary] }, { name: 'Différences', rows: [head, ...detail] }]));
    return;
  }
  const notesIn = await promptBox('Ajoutez un contexte ou des notes en en-tête du rapport (facultatif).', { title: 'Rapport de livraison', inputLabel: 'Notes (optionnel)', optional: true, confirmText: 'Générer' });
  if (notesIn === null) return;
  saveBlob(`rapport-livraison-${stamp()}.docx`, Office.docx([
    { t: 'title', text: 'Rapport de comparaison d\'environnements' },
    { t: 'p', text: `A : ${A.name} — ${A.url}` },
    { t: 'p', text: `B : ${B.name} — ${B.url}` },
    { t: 'p', text: `Généré le ${new Date().toLocaleString('fr-FR')}` },
    ...(notesIn ? [{ t: 'h2', text: 'Contexte' }, { t: 'p', text: notesIn }] : []),
    { t: 'h1', text: 'Synthèse' },
    { t: 'table', header: sumHead, rows: summary },
    { t: 'h1', text: `Détail des différences (${out.length})` },
    { t: 'table', header: head, rows: detail },
  ], { landscape: true }));
}

tabs.cmp = async (root) => {
  const envBox = h('div'), catBox = h('div', { class: 'toolbar' }), out = h('div'), msg = h('p', { class: 'muted' });
  const checks = {};
  Object.keys(CMP_DEFS).forEach((c) => {
    checks[c] = h('input', { type: 'checkbox', checked: true });
    catBox.append(h('label', { class: 'inline' }, checks[c], c));
  });
  let sel = null, info = null;

  async function refreshEnvs() {
    envBox.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Recherche des autres onglets Dynamics ouverts…'));
    info = await discoverOtherEnvs();
    sel = h('select', {}, info.others.map((e) => h('option', { value: String(e.tid) }, `${e.org} — ${e.url.replace('https://', '')}`)));
    envBox.replaceChildren(
      h('p', {}, h('b', {}, 'A (cet onglet) : '), `${info.mine['Organisation (nom unique)'] || '?'} — ${(info.mine.URL || '').replace('https://', '')}`),
      info.others.length
        ? h('div', { class: 'toolbar' }, h('b', {}, 'B : '), sel, h('button', { class: 'primary', onclick: run }, 'Comparer en direct'), h('button', { onclick: () => refreshEnvs() }, 'Actualiser'))
        : h('div', {}, h('p', { class: 'alert' }, 'Aucun autre environnement détecté. Ouvrez l\'autre environnement (ex. UAT) dans un autre onglet Chrome, connectez-vous et attendez le chargement complet de l\'application, puis cliquez sur Actualiser. Les deux onglets doivent rester ouverts pendant la comparaison.'),
          h('button', { class: 'primary', onclick: () => refreshEnvs() }, 'Actualiser')));
  }

  async function run() {
    const cats = Object.keys(CMP_DEFS).filter((c) => checks[c].checked);
    if (!cats.length) { toast('Cochez au moins une catégorie.', true); return; }
    const other = info.others.find((e) => String(e.tid) === sel.value);
    if (!other) return;
    out.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Lecture des deux environnements…'));
    try {
      const prog = progressLine();
      out.append(prog);
      let na = 0, nb = 0;
      const [a, b] = await Promise.all([
        loadEnvData(tabId, cats, (d, t) => { na = d; prog.set(`A : ${na}/${t} — B : ${nb}/${t}`); }),
        loadEnvData(other.tid, cats, (d, t) => { nb = d; prog.set(`A : ${na}/${t} — B : ${nb}/${t}`); }),
      ]);
      const A = { ...a, name: info.mine['Organisation (nom unique)'] || 'A', url: info.mine.URL || '' };
      const B = { ...b, name: other.org, url: other.url };
      const diff = diffEnvs(A, B, cats);
      const main = diff.filter((d) => !CMP_INFO_ONLY.includes(d['Catégorie']));
      const errs = [...Object.entries(a.errors).map(([c, m]) => `A / ${c} : ${m}`), ...Object.entries(b.errors).map(([c, m]) => `B / ${c} : ${m}`)];
      const summary = cats.map((c) => {
        const r = diff.filter((x) => x['Catégorie'] === c);
        return { Catégorie: c, 'Éléments A': A.data[c] ? Object.keys(A.data[c]).length : 'erreur', 'Éléments B': B.data[c] ? Object.keys(B.data[c]).length : 'erreur', 'Seulement dans A': r.filter((x) => x.Statut === 'Seulement dans A').length, 'Seulement dans B': r.filter((x) => x.Statut === 'Seulement dans B').length, Différents: r.filter((x) => x.Statut === 'Différent').length };
      });
      out.replaceChildren(
        h('h2', {}, `${main.length} différence(s) de configuration`),
        h('p', { class: 'muted' }, `A = ${A.name} · B = ${B.name}. Les valeurs de variables d'environnement diffèrent normalement d'un environnement à l'autre : elles sont listées mais non comptées.`),
        h('div', { class: 'toolbar' },
          h('button', { class: 'primary', onclick: () => exportCmp('docx', A, B, diff, cats) }, 'Rapport de livraison Word (.docx)'),
          h('button', { onclick: () => exportCmp('xlsx', A, B, diff, cats) }, 'Excel (.xlsx)')),
        errs.length ? h('p', { class: 'error' }, 'Non lu : ' + errs.join(' · ')) : null,
        h('h2', {}, 'Synthèse'), dataTable(summary, { exportName: 'synthese-comparaison' }),
        h('h2', {}, 'Détail'), dataTable(diff, { exportName: 'comparaison', empty: 'Aucune différence détectée.' }));
    } catch (e) { out.replaceChildren(h('p', { class: 'error' }, e.message)); }
  }

  root.append(
    h('p', { class: 'muted' }, 'Comparaison en direct : ouvrez les deux environnements dans deux onglets Chrome, lancez le Workbench depuis le premier (A), puis choisissez le second (B). Aucune capture préalable n\'est nécessaire, et rien n\'est écrit.'),
    envBox, h('h2', {}, 'Catégories à comparer'), catBox, msg, out);
  refreshEnvs().catch((e) => envBox.replaceChildren(h('p', { class: 'error' }, e.message)));
};

// =====================================================================
// 2. Analyse de performance
// =====================================================================
tabs.perf = async (root) => {
  const out = h('div');
  const norm = (u) => u.replace(/[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/gi, '{id}');

  async function analyse() {
    const r = await call('perfReport');
    const res = r.ressources, api = res.filter((x) => x.type === 'API Web');
    const sum = (a, k) => a.reduce((n, x) => n + (x[k] || 0), 0);
    const byType = {};
    res.forEach((x) => { const b = (byType[x.type] ||= { Catégorie: x.type, Requêtes: 0, 'Durée cumulée': 0, 'Taille transférée': 0 }); b.Requêtes++; b['Durée cumulée'] += x.duree; b['Taille transférée'] += x.taille; });
    const dupMap = {};
    api.forEach((x) => { (dupMap[norm(x.url)] ||= []).push(x); });
    const dups = Object.entries(dupMap).filter(([, v]) => v.length > 1).map(([u, v]) => ({ Appel: u, Occurrences: v.length, 'Durée cumulée (ms)': sum(v, 'duree'), 'Gain possible (ms)': sum(v, 'duree') - Math.max(...v.map((x) => x.duree)) })).sort((a, b) => b['Gain possible (ms)'] - a['Gain possible (ms)']);
    const slow = [...api].sort((a, b) => b.duree - a.duree).slice(0, 20).map((x) => ({ Appel: x.url, 'Début (ms)': x.debut, 'Durée (ms)': x.duree, 'Taille (Ko)': Math.round(x.taille / 1024), Statut: x.statut }));
    const bigJs = res.filter((x) => x.type === 'JavaScript').sort((a, b) => b.taille - a.taille).slice(0, 10).map((x) => ({ Script: x.url, 'Taille (Ko)': Math.round(x.taille / 1024), 'Durée (ms)': x.duree }));
    const lt = r.longTasks || [];
    const ltTotal = sum(lt, 'duree');
    const n = r.navigation || {};
    const diag = [];
    if (n.chargementComplet > 5000) diag.push(['🔴', `Chargement complet de ${fmtMs(n.chargementComplet)} : au-dessus de 5 s.`, 'Réduisez les scripts chargés au démarrage (bibliothèques onLoad) et les sections/onglets lourds.']);
    else if (n.chargementComplet > 3000) diag.push(['🟠', `Chargement de ${fmtMs(n.chargementComplet)}.`, 'Acceptable mais améliorable : vérifiez les appels API de l\'onLoad.']);
    if (api.length > 40) diag.push(['🟠', `${api.length} appels API Web pendant le chargement.`, 'Regroupez les requêtes (FetchXML avec link-entity, $expand) ou chargez-les à la demande.']);
    if (dups.length) diag.push(['🟠', `${dups.length} appel(s) identique(s) répété(s), gain estimé ${fmtMs(sum(dups.map((d) => ({ v: d['Gain possible (ms)'] })), 'v'))}.`, 'Mettez le résultat en cache dans une variable de script ou une session.']);
    const verySlow = api.filter((x) => x.duree > 1500);
    if (verySlow.length) diag.push(['🔴', `${verySlow.length} appel(s) API de plus de 1,5 s.`, 'Ajoutez $select / $top, filtrez sur des colonnes indexées, évitez les filtres « contains ».']);
    if (lt.length > 5 || ltTotal > 1000) diag.push(['🟠', `${lt.length} tâche(s) longue(s) (${fmtMs(ltTotal)} de blocage du thread).`, 'Du JavaScript synchrone bloque l\'interface : déplacez-le hors de l\'onLoad ou rendez-le asynchrone.']);
    const jsTotal = sum(res.filter((x) => x.type === 'JavaScript'), 'taille');
    if (jsTotal > 8 * 1048576) diag.push(['🟠', `${fmtKo(jsTotal)} de JavaScript transférés.`, 'Le cache navigateur peut masquer ce coût au 2ᵉ chargement : testez en navigation privée.']);
    if (!diag.length) diag.push(['🟢', 'Aucun point d\'attention détecté sur cette page.', 'Les mesures ci-dessus servent de référence pour comparer avant/après une modification.']);

    // ---- Statistiques : score, historique, utilisateur connecté ----
    const jsTotal2 = sum(res.filter((x) => x.type === 'JavaScript'), 'taille');
    let score = 100;
    const load = n.chargementComplet || 0;
    score -= load > 8000 ? 40 : load > 5000 ? 30 : load > 3000 ? 15 : 0;
    score -= api.length > 60 ? 20 : api.length > 40 ? 12 : api.length > 25 ? 6 : 0;
    score -= Math.min(15, dups.length * 3) + Math.min(15, verySlow.length * 5);
    score -= ltTotal > 2000 ? 15 : ltTotal > 1000 ? 8 : 0;
    score -= jsTotal2 > 8 * 1048576 ? 5 : 0;
    score = Math.max(0, Math.min(100, score));
    const user = await currentUser().catch(() => null);
    let hist = [];
    try { hist = (await chrome.storage.local.get('perfHistory')).perfHistory || []; } catch (e) { /* ignore */ }
    const entity = r.entite || (state.orgInfo && state.orgInfo.entity) || '';
    const prev = hist.filter((x) => x.entity === entity).slice(-1)[0];
    hist.push({ t: Date.now(), entity, load, ttfb: n.ttfb || 0, api: api.length, score });
    try { await chrome.storage.local.set({ perfHistory: hist.slice(-30) }); } catch (e) { /* ignore */ }
    const band = (v, warn, bad) => (v > bad ? 'var(--c-red)' : v > warn ? 'var(--c-amber)' : 'var(--c-teal)');
    const pctOf = (v, bad) => Math.min(100, Math.round(((v || 0) / bad) * 100));
    const dl = prev && prev.load ? Math.round(((load - prev.load) / prev.load) * 100) : null;
    const statsRow = h('div', { class: 'stats' },
      Charts.stat({ label: 'Réponse serveur (TTFB)', tag: 'Serveur', value: fmtMs(n.ttfb), pct: pctOf(n.ttfb, 1800), color: band(n.ttfb, 800, 1800) }),
      Charts.stat({ label: 'Chargement complet', tag: 'Page', value: fmtMs(n.chargementComplet), delta: dl == null ? null : `${dl > 0 ? '+' : ''}${dl} % vs préc.`, deltaGood: dl == null ? undefined : dl <= 0, pct: pctOf(load, 8000), color: band(load, 3000, 6000), sub: `DOM interactif ${fmtMs(n.domInteractive)}` }),
      Charts.stat({ label: 'Appels API Web', tag: 'Réseau', value: String(api.length), pct: pctOf(api.length, 60), color: band(api.length, 25, 40), sub: fmtMs(sum(api, 'duree')) + ' cumulés' }),
      Charts.stat({ label: 'JavaScript transféré', tag: 'Scripts', value: fmtKo(jsTotal2), pct: pctOf(jsTotal2, 8 * 1048576), color: band(jsTotal2, 3 * 1048576, 6 * 1048576), sub: r.longTasks ? `${lt.length} tâche(s) longue(s) · ${fmtMs(ltTotal)}` : (r.memoireMo ? `${r.memoireMo} Mo de mémoire` : '') }));
    const secs = {};
    api.forEach((x) => { const k = Math.floor((x.debut || 0) / 1000); secs[k] = (secs[k] || 0) + 1; });
    const maxSec = Math.min(40, Math.max(0, ...Object.keys(secs).map(Number)));
    const timeline = Array.from({ length: maxSec + 1 }, (_, i) => ({ x: `${i}s`, y: secs[i] || 0 }));
    const shortUrl = (u) => decodeURIComponent(u.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/data\/v[\d.]+\//, '')).replace(/[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/gi, '{id}').slice(0, 60);
    const userBlock = user ? h('div', { class: 'whoami' }, h('span', { class: 'avatar big' }, user.initials),
      h('div', {}, h('div', { class: 'u-name' }, user.name), h('div', { class: 'muted' }, [user.email, state.orgInfo && state.orgInfo.org, entity && `${T('Table')} : ${entity}`].filter(Boolean).join(' · ')),
        h('div', {}, (user.roles || []).slice(0, 4).map((x) => h('span', { class: 'chip static' }, x)), user.roles.length > 4 ? h('span', { class: 'muted' }, ` +${user.roles.length - 4}`) : null))) : null;
    const histPts = hist.filter((x) => x.entity === entity || !entity).slice(-12).map((x) => ({ x: new Date(x.t).toLocaleTimeString(I18N.lang, { hour: '2-digit', minute: '2-digit' }), y: Math.round((x.load / 1000) * 10) / 10 }));
    const scoreColor = score >= 80 ? 'var(--c-teal)' : score >= 50 ? 'var(--c-amber)' : 'var(--c-red)';

    return h('div', {},
      userBlock,
      statsRow,
      h('div', { class: 'dgrid' },
        Charts.card('Score de performance', score >= 80 ? 'Excellent' : score >= 50 ? 'À améliorer' : 'Critique', Charts.gauge(score, { color: scoreColor, sub: `${diag.filter((d) => d[0] !== '🟢').length} point(s) d'attention` })),
        Object.assign(Charts.card('Temps cumulé par catégorie', 'Somme des durées de requêtes (ms)', Charts.bars(Object.values(byType).map((b) => ({ label: b.Catégorie, value: b['Durée cumulée'] })), { height: 210, unit: ' ms' })), { className: 'dcard span2' }),
        Charts.card('Appels API les plus lents', 'Durée en ms', Charts.hbars([...api].sort((a, b) => b.duree - a.duree).slice(0, 8).map((x) => ({ label: shortUrl(x.url), value: x.duree })), { unit: ' ms', color: 'var(--c-blue)' })),
        Object.assign(Charts.card('Cascade des appels', 'Requêtes API démarrées par seconde', Charts.area(timeline, { color: 'var(--c-teal)', height: 190 })), { className: 'dcard span2' }),
        Object.assign(Charts.card('Historique des mesures', 'Chargement complet (s)', histPts.length > 1 ? Charts.area(histPts, { color: 'var(--c-violet)', height: 190, unit: ' s' }) : h('p', { class: 'muted' }, T("Pas encore de mesure : lancez une analyse pour alimenter l'historique."))), { className: 'dcard span2' })),
      h('h2', {}, 'Diagnostic'),
      dataTable(diag.map(([s, c, a]) => ({ '': s, Constat: c, 'Piste d\'amélioration': a })), { exportName: 'diagnostic-performance' }),
      h('h2', {}, 'Par catégorie'),
      dataTable(Object.values(byType).map((b) => ({ ...b, 'Durée cumulée': fmtMs(b['Durée cumulée']), 'Taille transférée': fmtKo(b['Taille transférée']) })), { exportName: 'perf-categories' }),
      h('h2', {}, 'Appels API les plus lents'), dataTable(slow, { exportName: 'perf-api-lents', empty: 'Aucun appel API Web enregistré.' }),
      h('h2', {}, 'Appels répétés'), dataTable(dups, { exportName: 'perf-doublons', empty: 'Aucun appel répété.' }),
      h('h2', {}, 'Scripts les plus lourds'), dataTable(bigJs, { exportName: 'perf-scripts', empty: 'Aucun script.' }));
  }

  const run = () => guarded(out, analyse);
  async function reloadAndMeasure() {
    out.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Rechargement de l\'onglet Dynamics puis mesure (≈ 15 s)…'));
    try {
      await chrome.tabs.reload(tabId);
      await new Promise((r) => setTimeout(r, 6000));
      for (let i = 0; i < 12; i++) {
        try { await call('ping'); break; } catch (e) { await new Promise((r) => setTimeout(r, 2000)); }
      }
      await new Promise((r) => setTimeout(r, 4000));
      await run();
    } catch (e) { out.replaceChildren(h('p', { class: 'error' }, e.message)); }
  }
  root.append(
    h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: run }, 'Analyser la page actuelle'), h('button', { onclick: reloadAndMeasure }, 'Recharger puis mesurer')),
    out);
  run();
};

// =====================================================================
// 3. Debug de formulaire en direct
// =====================================================================
function parseFormXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const libs = [...doc.querySelectorAll('formLibraries > Library')].map((l) => l.getAttribute('name'));
  const events = [];
  doc.querySelectorAll('event').forEach((ev) => {
    const name = ev.getAttribute('name');
    const target = ev.getAttribute('attribute') || (ev.closest('control') && ev.closest('control').getAttribute('id')) || (ev.closest('tab') && ev.closest('tab').getAttribute('name')) || '(formulaire)';
    ev.querySelectorAll('Handler').forEach((hd) => {
      events.push({ Événement: name, Cible: target, Fonction: hd.getAttribute('functionName'), Bibliothèque: hd.getAttribute('libraryName'), Activé: hd.getAttribute('enabled') !== 'false', Paramètres: hd.getAttribute('parameters') || '', 'Contexte passé': hd.getAttribute('passExecutionContext') === 'true' });
    });
  });
  return { libs, events };
}

tabs.fdebug = async (root) => {
  const out = h('div'), live = h('div');
  let timer = null;

  async function load() {
    const f = await call('formDebug');
    let xmlInfo = null, xmlErr = null;
    if (f.formId) {
      try { xmlInfo = parseFormXml((await q(`systemforms(${f.formId})?$select=formxml,name`)).data.formxml); } catch (e) { xmlErr = e.message; }
    }
    const fields = await call('formFields');
    const libsUsed = xmlInfo ? new Set(xmlInfo.events.map((e) => e.Bibliothèque)) : new Set();
    const issues = [];
    if (xmlInfo) {
      xmlInfo.libs.filter((l) => !libsUsed.has(l)).forEach((l) => issues.push({ Niveau: '🟠', Constat: `Bibliothèque « ${l} » chargée mais aucun handler ne l'utilise`, Conseil: 'Retirez-la du formulaire si elle ne sert qu\'à d\'autres scripts indirects : sinon elle alourdit le chargement.' }));
      xmlInfo.events.filter((e) => !xmlInfo.libs.includes(e.Bibliothèque)).forEach((e) => issues.push({ Niveau: '🔴', Constat: `Handler ${e.Fonction} (${e.Événement}) référence « ${e.Bibliothèque} » absente du formulaire`, Conseil: 'Ajoutez la bibliothèque au formulaire, sinon l\'événement échoue.' }));
      xmlInfo.events.filter((e) => !e.Activé).forEach((e) => issues.push({ Niveau: 'ℹ️', Constat: `Handler désactivé : ${e.Fonction} (${e.Événement} sur ${e.Cible})`, Conseil: '' }));
      const onloads = xmlInfo.events.filter((e) => e.Événement === 'onload' && e.Activé).length;
      if (onloads > 5) issues.push({ Niveau: '🟠', Constat: `${onloads} handlers onLoad`, Conseil: 'Beaucoup de logique au chargement ralentit l\'ouverture du formulaire.' });
    }
    const hidden = fields.filter((x) => x.visible === false && x.requis === 'required');
    hidden.forEach((x) => issues.push({ Niveau: '🟠', Constat: `Champ obligatoire masqué : ${x.champ}`, Conseil: 'Un champ obligatoire invisible peut empêcher l\'enregistrement sans que l\'utilisateur comprenne pourquoi.' }));
    const errs = await call('recentErrors').catch(() => []);
    return h('div', {},
      h('div', { class: 'kpis' }, kpi('Table', f.entite), kpi('Formulaire', f.formNom || '—'), kpi('Type', ({ 0: 'Indéfini', 1: 'Création', 2: 'Mise à jour', 3: 'Lecture seule', 4: 'Désactivé', 6: 'Mise à jour en masse' })[f.typeFormulaire] || String(f.typeFormulaire)), kpi('Modifié', f.modifie ? 'Oui' : 'Non')),
      h('div', { class: 'toolbar' }, copyBtn(() => f.id, 'Copier l\'ID enregistrement'), copyBtn(() => f.formId || '', 'Copier l\'ID formulaire')),
      h('h2', {}, 'Points d\'attention'), dataTable(issues, { exportName: 'form-diagnostic', empty: xmlErr ? `Définition du formulaire illisible : ${xmlErr}` : 'Aucun problème détecté.' }),
      h('h2', {}, 'Bibliothèques JavaScript'), dataTable((xmlInfo ? xmlInfo.libs : []).map((l) => ({ Bibliothèque: l, 'Utilisée par un handler': libsUsed.has(l) })), { exportName: 'form-bibliotheques', empty: 'Non disponible.' }),
      h('h2', {}, 'Événements et handlers'), dataTable(xmlInfo ? xmlInfo.events : [], { exportName: 'form-evenements', empty: 'Aucun handler configuré.' }),
      h('h2', {}, 'Onglets et sections'),
      dataTable(f.onglets.flatMap((t) => [{ Onglet: t.nom, Libellé: t.libelle, Section: '', Visible: t.visible, État: t.etat }, ...t.sections.map((s) => ({ Onglet: t.nom, Libellé: s.libelle, Section: s.nom, Visible: s.visible, État: '' }))]), { exportName: 'form-onglets' }),
      h('h2', {}, 'Champs'), dataTable(fields.map((x) => ({ Champ: x.champ, Libellé: x.libelle, Type: x.type, Exigence: x.requis, Soumission: x.soumission, Modifié: x.modifie, Visible: x.visible, Désactivé: x.desactive, Valeur: x.valeur })), { exportName: 'form-champs' }),
      h('h2', {}, 'Erreurs JavaScript récentes'), dataTable(errs.map((e) => ({ Date: e.date, Message: e.message })), { exportName: 'form-erreurs', empty: 'Aucune erreur capturée depuis le chargement de la page.' }));
  }

  // Surveillance en direct : journalise les changements de valeur / visibilité / exigence.
  const logBody = h('tbody');
  const toggle = h('button', { class: 'primary' }, '▶ Surveiller les changements');
  let prev = null;
  const stop = () => { clearInterval(timer); timer = null; toggle.textContent = '▶ Surveiller les changements'; };
  toggle.onclick = async () => {
    if (timer) { stop(); return; }
    try { prev = Object.fromEntries((await call('formFields')).map((x) => [x.champ, x])); } catch (e) { toast(e.message, true); return; }
    toggle.textContent = '■ Arrêter la surveillance';
    timer = setInterval(async () => {
      if (!root.isConnected) { stop(); return; }
      try {
        const now = Object.fromEntries((await call('formFields')).map((x) => [x.champ, x]));
        for (const [k, v] of Object.entries(now)) {
          const o = prev[k]; if (!o) continue;
          for (const [prop, lbl] of [['valeur', 'Valeur'], ['visible', 'Visibilité'], ['desactive', 'Désactivé'], ['requis', 'Exigence']]) {
            if (o[prop] !== v[prop]) logBody.prepend(h('tr', {}, h('td', {}, new Date().toLocaleTimeString('fr-FR')), h('td', {}, k), h('td', {}, lbl), h('td', {}, String(o[prop] ?? '')), h('td', {}, String(v[prop] ?? ''))));
          }
        }
        prev = now;
        while (logBody.children.length > 300) logBody.lastChild.remove();
      } catch (e) { stop(); toast('Surveillance arrêtée : ' + e.message, true); }
    }, 1200);
  };
  live.append(
    h('p', { class: 'muted' }, 'Changez des champs dans le formulaire Dynamics : chaque modification de valeur, de visibilité, d\'état verrouillé ou d\'exigence (règles métier, scripts) est journalisée ici avec l\'heure.'),
    h('div', { class: 'toolbar' }, toggle, h('button', { onclick: () => logBody.replaceChildren() }, 'Vider le journal')),
    h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['Heure', 'Champ', 'Propriété', 'Avant', 'Après'].map((c) => h('th', {}, c)))), logBody)));

  root.append(
    h('p', { class: 'muted' }, 'Ouvrez un enregistrement dans l\'onglet Dynamics : cette page analyse le formulaire affiché (scripts, handlers, champs, sections) et détecte les erreurs de configuration courantes.'),
    h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: () => guarded(out, load) }, 'Analyser le formulaire ouvert')),
    out, h('h2', {}, 'Surveillance en direct'), live);
  guarded(out, load);
};

// =====================================================================
// 4. Santé des flux Power Automate
// =====================================================================
tabs.fhealth = async (root) => {
  const out = h('div');
  const days = h('select', {}, [7, 14, 28].map((d) => h('option', { value: String(d), selected: d === 28 }, `${d} derniers jours`)));

  async function analyse() {
    const since = new Date(Date.now() - Number(days.value) * 864e5).toISOString();
    const flows = await rows('workflows?$select=name,workflowid,statecode,statuscode,modifiedon,_ownerid_value&$filter=category eq 5&$top=1000', { formatted: true, maxPages: 5, pageSize: 500 });
    if (!flows.length) return h('p', { class: 'muted' }, 'Aucun flow cloud solution-aware dans cet environnement.');
    let runs = [], runErr = null;
    try { runs = await rows(`flowruns?$filter=starttime ge ${since}&$orderby=starttime desc`, { maxPages: 20, pageSize: 500 }); } catch (e) { runErr = e.message; }
    const sample = runs[0] || {};
    const key = ['_workflowid_value', '_workflow_value', 'workflowid', 'workflowname'].find((k) => k in sample);
    const idOf = (v) => String(v || '').replace(/[{}]/g, '').toLowerCase();
    const byFlow = {};
    runs.forEach((r) => { const k = key === 'workflowname' ? String(r.workflowname) : idOf(r[key]); (byFlow[k] ||= []).push(r); });
    const owners = [...new Set(flows.map((f) => f._ownerid_value).filter(Boolean))];
    const disabled = new Set();
    for (let i = 0; i < owners.length; i += 20) {
      const part = owners.slice(i, i + 20);
      try { (await rows(`systemusers?$select=systemuserid&$filter=isdisabled eq true and (${part.map((id) => `systemuserid eq ${id}`).join(' or ')})`)).forEach((u) => disabled.add(u.systemuserid)); } catch (e) { /* ignore */ }
    }
    const table = flows.map((f) => {
      const rs = byFlow[key === 'workflowname' ? f.name : idOf(f.workflowid)] || [];
      const failed = rs.filter((r) => r.status === 'Failed').length;
      const ok = rs.filter((r) => r.status === 'Succeeded').length;
      const durations = rs.map((r) => Number(r.duration)).filter((n) => n > 0);
      const lastFail = rs.find((r) => r.status === 'Failed');
      const rate = rs.length ? Math.round((failed / rs.length) * 100) : null;
      const flags = [];
      if (f.statecode === 2) flags.push('⏸ suspendu');
      if (f.statecode === 0) flags.push('📝 brouillon');
      if (disabled.has(f._ownerid_value)) flags.push('👤 propriétaire désactivé');
      if (f.statecode === 1 && !rs.length && !runErr && (key || !runs.length)) flags.push('💤 aucun run');
      if (rate != null && rate >= 20) flags.push('🔴 échecs ≥ 20 %'); else if (rate != null && rate > 0) flags.push('🟠 échecs');
      return {
        Flow: f.name, État: f['statecode@OData.Community.Display.V1.FormattedValue'] || f.statecode, Propriétaire: f['_ownerid_value@OData.Community.Display.V1.FormattedValue'] || '',
        Exécutions: rs.length, Réussies: ok, Échecs: failed, 'Taux d\'échec': rate == null ? '—' : rate + ' %',
        'Durée moyenne': durations.length ? fmtMs(Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)) : '—',
        'Dernier échec': lastFail ? `${lastFail.starttime} — ${(lastFail.errorcode || '')} ${String(lastFail.errormessage || '').slice(0, 160)}` : '',
        Santé: flags.join(' · ') || '🟢 OK', _rank: (rate || 0) + (f.statecode === 2 ? 50 : 0) + (disabled.has(f._ownerid_value) ? 30 : 0),
      };
    }).sort((a, b) => b._rank - a._rank).map(({ _rank, ...r }) => r);
    const cnt = (s) => table.filter((r) => r.Santé.includes(s)).length;
    return h('div', {},
      runErr ? h('p', { class: 'alert' }, `Historique des exécutions illisible (${runErr}). Seuls l'état et les propriétaires sont analysés.`) : null,
      !runErr && !key && runs.length ? h('p', { class: 'alert' }, 'Les exécutions ne contiennent pas de lien vers le flow : statistiques par flow indisponibles.') : null,
      h('div', { class: 'kpis' }, kpi('Flows', String(flows.length)), kpi('En échec', String(cnt('🔴') + cnt('🟠'))), kpi('Suspendus', String(cnt('⏸'))), kpi('Propriétaire désactivé', String(cnt('👤'))), kpi('Sans exécution', String(cnt('💤'))), kpi('Runs analysés', String(runs.length))),
      dataTable(table, { exportName: 'sante-flux' }));
  }
  const run = () => guarded(out, analyse);
  root.append(
    h('p', { class: 'muted' }, 'Croise l\'état des flows cloud solution-aware, leurs exécutions récentes et leurs propriétaires : flux en échec, suspendus, sans activité ou dont le propriétaire est désactivé (ils cesseront de fonctionner).'),
    h('div', { class: 'toolbar' }, 'Période', days, h('button', { class: 'primary', onclick: run }, 'Analyser')), out);
  run();
};

// =====================================================================
// 5. Éléments hors solution
// =====================================================================
const ORPHAN_DEFS = [
  ['Table', 1, 'EntityDefinitions?$select=LogicalName,MetadataId&$filter=IsCustomEntity eq true and IsManaged eq false', (r) => [r.MetadataId, r.LogicalName]],
  ['Processus / flow', 29, 'workflows?$select=name,workflowid,category&$filter=type eq 1 and ismanaged eq false', (r) => [r.workflowid, `${r.name} [${WF_CATS[r.category] || r.category}]`]],
  ['Web resource', 61, 'webresourceset?$select=name,webresourceid&$filter=ismanaged eq false and ishidden/Value eq false', (r) => [r.webresourceid, r.name]],
  ['Assembly de plug-in', 91, 'pluginassemblies?$select=name,pluginassemblyid&$filter=ismanaged eq false and ishidden/Value eq false', (r) => [r.pluginassemblyid, r.name]],
  ['Étape de plug-in', 92, 'sdkmessageprocessingsteps?$select=name,sdkmessageprocessingstepid&$filter=ismanaged eq false and ishidden/Value eq false', (r) => [r.sdkmessageprocessingstepid, r.name]],
  ['Rôle de sécurité', 20, 'roles?$select=name,roleid&$filter=ismanaged eq false and _parentroleid_value eq null', (r) => [r.roleid, r.name]],
  ['Variable d\'environnement', 380, 'environmentvariabledefinitions?$select=schemaname,environmentvariabledefinitionid&$filter=ismanaged eq false', (r) => [r.environmentvariabledefinitionid, r.schemaname]],
  ['Référence de connexion', 372, 'connectionreferences?$select=connectionreferencelogicalname,connectionreferenceid&$filter=ismanaged eq false', (r) => [r.connectionreferenceid, r.connectionreferencelogicalname]],
  ['Application pilotée par modèle', 80, 'appmodules?$select=name,appmoduleid&$filter=ismanaged eq false', (r) => [r.appmoduleid, r.name]],
  ['Application canevas', 300, 'canvasapps?$select=displayname,canvasappid&$filter=ismanaged eq false', (r) => [r.canvasappid, r.displayname]],
];

tabs.orphan = async (root) => {
  const out = h('div');
  async function analyse() {
    const sols = (await rows('solutions?$select=solutionid,uniquename,friendlyname&$filter=isvisible eq true and ismanaged eq false')).filter((s) => !['Default', 'Active', 'Basic'].includes(s.uniquename));
    if (!sols.length) return h('p', { class: 'alert' }, 'Aucune solution non gérée personnalisée : tout est « hors solution ».');
    const inSol = new Set();
    const errors = [];
    await pool(sols, 3, async (s) => {
      (await rows(`solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${s.solutionid}`, { maxPages: 30, pageSize: 5000 })).forEach((c) => inSol.add(String(c.objectid).toLowerCase()));
    });
    const found = [];
    await pool(ORPHAN_DEFS, 3, async ([type, , path, kv]) => {
      try {
        (await rows(path, { maxPages: 10, pageSize: 5000 })).forEach((r) => {
          const [id, name] = kv(r);
          if (!inSol.has(String(id).toLowerCase())) found.push({ Type: type, Nom: name, ID: id });
        });
      } catch (e) { errors.push(`${type} : ${e.message}`); }
    });
    found.sort((a, b) => a.Type.localeCompare(b.Type) || String(a.Nom).localeCompare(String(b.Nom)));
    const counts = {};
    found.forEach((f) => { counts[f.Type] = (counts[f.Type] || 0) + 1; });
    return h('div', {},
      h('p', { class: found.length ? 'alert' : 'ok' }, found.length ? `${found.length} composant(s) personnalisé(s) ne figurent dans aucune de vos ${sols.length} solution(s) non gérée(s) : ils ne seront pas déployés avec elles.` : 'Tous les composants personnalisés analysés appartiennent à au moins une solution.'),
      h('div', { class: 'kpis' }, Object.entries(counts).map(([t, n]) => kpi(t, String(n)))),
      errors.length ? h('p', { class: 'error' }, 'Non analysé : ' + errors.join(' · ')) : null,
      dataTable(found, { exportName: 'hors-solution', empty: 'Rien à signaler.' }),
      h('p', { class: 'muted' }, `Solutions prises en compte : ${sols.map((s) => s.uniquename).join(', ')}. Les composants des solutions gérées et de la solution par défaut sont ignorés.`));
  }
  const run = () => guarded(out, analyse);
  root.append(
    h('p', { class: 'muted' }, 'Repère les tables, flux, web resources, plug-ins, rôles, variables d\'environnement, références de connexion et applications créés mais absents de toutes vos solutions non gérées : ce sont les oublis classiques avant un déploiement.'),
    h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: run }, 'Analyser')), out);
  run();
};

// =====================================================================
// 6. Générateur de données de test à partir du modèle
// =====================================================================
const GEN_WORDS = {
  first: ['Camille', 'Lucas', 'Emma', 'Hugo', 'Léa', 'Nathan', 'Chloé', 'Louis', 'Manon', 'Jules', 'Sarah', 'Adam'],
  last: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Michel'],
  comp: ['Atlas', 'Horizon', 'Vertex', 'Nordic', 'Alpha', 'Orion', 'Delta', 'Zenith', 'Nova', 'Lumen'],
  city: [['Nantes', '44000'], ['Paris', '75008'], ['Lyon', '69002'], ['Rennes', '35000'], ['Bordeaux', '33000'], ['Lille', '59000']],
  lorem: ['Dossier de suivi client à traiter avant la fin du mois.', 'Demande validée par le responsable, en attente de retour.', 'Échange téléphonique : rappeler la semaine prochaine.', 'Besoin exprimé : devis pour un contrat annuel.'],
};
const asciiOf = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const GEN_SKIP = /^(createdon|modifiedon|createdby|modifiedby|owningbusinessunit|owninguser|owningteam|versionnumber|importsequencenumber|overriddencreatedon|timezoneruleversionnumber|utcconversiontimezonecode|statecode|statuscode|processid|stageid|traversedpath|ownerid)$/;

function genValue(a, i, ctx) {
  const rnd = Math.random, pick = (l) => l[Math.floor(rnd() * l.length)];
  const n = a.LogicalName.toLowerCase();
  const digits = (k) => Array.from({ length: k }, () => Math.floor(rnd() * 10)).join('');
  const cut = (s) => (a.MaxLength ? String(s).slice(0, a.MaxLength) : s);
  switch (a.AttributeType) {
    case 'String': {
      const f = a.FormatName && a.FormatName.Value;
      if (f === 'Email' || /email/.test(n)) return cut(`${asciiOf(pick(GEN_WORDS.first))}.${asciiOf(pick(GEN_WORDS.last))}${i + 1}@example.com`);
      if (f === 'Phone' || /phone|fax|mobile|tel/.test(n)) return cut(`+33 ${/mobile/.test(n) ? '6' : '2'} ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}`);
      if (f === 'Url' || /url|website/.test(n)) return cut(`https://www.${asciiOf(pick(GEN_WORDS.comp))}${i + 1}.example.com`);
      if (/first.?name/.test(n)) return cut(pick(GEN_WORDS.first));
      if (/last.?name/.test(n)) return cut(pick(GEN_WORDS.last));
      if (/city|ville/.test(n)) return cut(pick(GEN_WORDS.city)[0]);
      if (/postal|zip/.test(n)) return cut(pick(GEN_WORDS.city)[1]);
      if (/country|pays/.test(n)) return cut('France');
      if (/line1|street|address|adresse/.test(n)) return cut(`${Math.ceil(rnd() * 90)} rue des Tests`);
      if (a.IsPrimaryName) return cut(`${a.PrimaryLabel || 'Test'} ${pick(GEN_WORDS.comp)} ${i + 1}`);
      if (/name|nom/.test(n)) return cut(`${pick(GEN_WORDS.comp)} ${i + 1}`);
      return cut(`${(a.DisplayLabel || a.LogicalName)} ${i + 1}`);
    }
    case 'Memo': return cut(pick(GEN_WORDS.lorem));
    case 'Integer': case 'BigInt': {
      const lo = Math.max(a.MinValue ?? 0, 0), hi = Math.min(a.MaxValue ?? 1000, lo + 1000);
      return lo + Math.floor(rnd() * (hi - lo + 1));
    }
    case 'Decimal': case 'Double': {
      const lo = Math.max(a.MinValue ?? 0, 0), hi = Math.min(a.MaxValue ?? 1000, lo + 1000), p = a.Precision ?? 2;
      return Number((lo + rnd() * (hi - lo)).toFixed(Math.min(p, 4)));
    }
    case 'Money': {
      const lo = Math.max(a.MinValue ?? 0, 0), hi = Math.min(a.MaxValue ?? 50000, lo + 50000);
      return Number((lo + rnd() * (hi - lo)).toFixed(2));
    }
    case 'Boolean': return rnd() > 0.5;
    case 'DateTime': {
      const d = new Date(Date.now() + (rnd() * 730 - 365) * 864e5);
      return a.Format === 'DateOnly' ? d.toISOString().slice(0, 10) : d.toISOString();
    }
    case 'Picklist': { const o = ctx.options[a.LogicalName]; return o && o.length ? pick(o) : undefined; }
    case 'Virtual': { const o = ctx.options[a.LogicalName]; return o && o.length ? String(pick(o)) : undefined; } // multiselect
    default: return undefined;
  }
}

tabs.gen = async (root) => {
  const etn = entityBox('table (nom logique)', 240);
  const count = h('input', { type: 'number', value: '10', min: '1', max: '500', style: 'width:90px' });
  const mode = h('select', {}, h('option', { value: 'required' }, 'Colonnes obligatoires seulement'), h('option', { value: 'all' }, 'Toutes les colonnes remplissables'));
  const plan = h('div'), out = h('div'), runsBox = h('div');
  mode.onchange = () => { if (model) draw(); };
  let model = null;
  const cur = await currentRecord();
  if (cur) etn.value = cur.entity;

  async function loadModel() {
    const e = etn.value.trim();
    if (!isName(e)) throw new Error('Nom de table invalide.');
    const ent = (await entityList()).find((x) => x.LogicalName === e);
    if (!ent) throw new Error('Table inconnue : ' + e);
    const base = `EntityDefinitions(LogicalName='${e}')/Attributes`;
    const attrs = await rows(`${base}?$select=LogicalName,AttributeType,RequiredLevel,IsValidForCreate,AttributeOf,IsPrimaryName,DisplayName,AttributeTypeName`);
    const extra = {};
    const grab = async (kind, sel) => { try { (await rows(`${base}/Microsoft.Dynamics.CRM.${kind}?$select=LogicalName,${sel}`)).forEach((r) => { extra[r.LogicalName] = { ...(extra[r.LogicalName] || {}), ...r }; }); } catch (err) { /* type absent */ } };
    await Promise.all([grab('StringAttributeMetadata', 'MaxLength,FormatName'), grab('MemoAttributeMetadata', 'MaxLength'), grab('IntegerAttributeMetadata', 'MinValue,MaxValue'), grab('DecimalAttributeMetadata', 'MinValue,MaxValue,Precision'), grab('DoubleAttributeMetadata', 'MinValue,MaxValue,Precision'), grab('MoneyAttributeMetadata', 'MinValue,MaxValue,Precision'), grab('DateTimeAttributeMetadata', 'Format'), grab('LookupAttributeMetadata', 'Targets')]);
    const options = {};
    (await optionSetsOf(e)).filter((o) => o.Type === 'Picklist' || o.Type === 'MultiSelectPicklist').forEach((o) => { (options[o.Champ] ||= []).push(o.Valeur); });
    const nav = await rows(`EntityDefinitions(LogicalName='${e}')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName`);
    const list = attrs.filter((a) => a.IsValidForCreate && a.AttributeOf == null && !GEN_SKIP.test(a.LogicalName) && !['Uniqueidentifier', 'EntityName', 'PartyList', 'ManagedProperty', 'Owner', 'State', 'Status', 'CalendarRules', 'Image', 'File'].includes(a.AttributeType))
      .map((a) => ({ ...a, ...(extra[a.LogicalName] || {}), DisplayLabel: label(a.DisplayName) || a.LogicalName, PrimaryLabel: label(ent.DisplayName) }))
      .filter((a) => !['Virtual'].includes(a.AttributeType) || (a.AttributeTypeName && /MultiSelect/i.test(a.AttributeTypeName.Value)))
      .map((a) => ({ ...a, required: ['ApplicationRequired', 'SystemRequired'].includes(a.RequiredLevel && a.RequiredLevel.Value) }));
    model = { ent, e, list, options, nav };
  }

  const draw = () => {
    const only = mode.value === 'required';
    const rowsEl = model.list.map((a) => {
      const on = h('input', { type: 'checkbox', checked: a.required || a.IsPrimaryName || !only });
      a._on = on;
      const hint = a.AttributeType === 'Lookup' || a.AttributeType === 'Customer' ? `→ ${(a.Targets || []).join(', ')}` : '';
      return h('tr', {}, h('td', {}, on), h('td', {}, a.DisplayLabel), h('td', {}, a.LogicalName), h('td', {}, a.AttributeType + ' ' + hint), h('td', {}, a.required ? badge('obligatoire', 'warn') : ''));
    });
    plan.replaceChildren(
      h('p', { class: 'muted' }, `${model.list.length} colonne(s) remplissables pour « ${model.e} ». Décochez celles à ne pas générer.`),
      h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'Libellé', 'Nom logique', 'Type', 'Exigence'].map((c) => h('th', {}, c)))), h('tbody', {}, rowsEl))),
      h('div', { class: 'toolbar' }, h('button', { onclick: () => preview() }, 'Aperçu (3 lignes)'), h('button', { class: 'primary', onclick: () => create() }, 'Créer les enregistrements')));
  };

  async function buildItems(n) {
    const chosen = model.list.filter((a) => a._on && a._on.checked);
    // lookups : ids existants de la table cible
    const pools = {};
    for (const a of chosen.filter((x) => x.AttributeType === 'Lookup' || x.AttributeType === 'Customer')) {
      const targets = (a.Targets || []).filter((t) => model.nav.some((r) => r.ReferencingAttribute === a.LogicalName && r.ReferencedEntity === t));
      for (const t of targets) {
        const ent = (await entityList()).find((x) => x.LogicalName === t);
        if (!ent) continue;
        const nv = model.nav.find((r) => r.ReferencingAttribute === a.LogicalName && r.ReferencedEntity === t);
        const ids = (await rows(`${ent.EntitySetName}?$select=${ent.PrimaryIdAttribute}&$top=50`)).map((r) => r[ent.PrimaryIdAttribute]);
        if (ids.length) { (pools[a.LogicalName] ||= []).push({ set: ent.EntitySetName, ids, nav: nv.ReferencingEntityNavigationPropertyName }); }
      }
      if (!pools[a.LogicalName] && a.required) throw new Error(`« ${a.LogicalName} » est un lien obligatoire mais aucun enregistrement cible n'existe (${(a.Targets || []).join(', ')}). Créez-en d'abord.`);
    }
    const items = [];
    for (let i = 0; i < n; i++) {
      const body = {};
      for (const a of chosen) {
        if (a.AttributeType === 'Lookup' || a.AttributeType === 'Customer') {
          const pl = pools[a.LogicalName]; if (!pl) continue;
          const t = pl[Math.floor(Math.random() * pl.length)];
          body[`${t.nav}@odata.bind`] = `/${t.set}(${t.ids[Math.floor(Math.random() * t.ids.length)]})`;
          continue;
        }
        const v = genValue(a, i, model);
        if (v !== undefined) body[a.LogicalName] = v;
      }
      if (model.list.some((a) => a.LogicalName === 'description' && a._on && a._on.checked)) body.description = DK.TAG;
      items.push(body);
    }
    return items;
  }

  const preview = () => guarded(out, async () => h('pre', {}, JSON.stringify(await buildItems(3), null, 2)));

  const create = () => guarded(out, async () => {
    const n = Math.max(1, Math.min(500, Number(count.value) || 0));
    if (!(await confirmBox(`Créer ${n} enregistrement(s) « ${model.e} » dans ${orgName()} ?`, { confirmText: `Créer ${n}` }))) throw new Error('Annulé.');
    const items = await buildItems(n);
    const prog = progressLine();
    out.replaceChildren(prog);
    const res = await pool(items, 3, (b) => q(model.ent.EntitySetName, { method: 'POST', body: b }), (d, t) => prog.set(`${d}/${t}…`));
    const ids = res.filter((r) => r.ok && r.v && r.v.entityId).map((r) => (/\(([0-9a-f-]{36})\)/i.exec(r.v.entityId) || [])[1]).filter(Boolean);
    const failed = res.map((r, i) => (r.ok ? null : { Ligne: i + 1, Erreur: r.e.message })).filter(Boolean);
    if (ids.length) {
      const st = (await chrome.storage.local.get('genRuns')).genRuns || [];
      st.push({ date: new Date().toISOString(), org: orgName(), entity: model.e, set: model.ent.EntitySetName, ids });
      await chrome.storage.local.set({ genRuns: st.slice(-30) });
      showRuns();
    }
    return h('div', {}, h('p', { class: failed.length ? 'error' : 'ok' }, `${ids.length}/${items.length} enregistrement(s) créé(s) dans ${orgName()}.`), failed.length ? dataTable(failed, { exportName: 'erreurs-generation' }) : null);
  });

  async function showRuns() {
    const st = (await chrome.storage.local.get('genRuns')).genRuns || [];
    runsBox.replaceChildren(dataTable(st.map((r) => ({ Date: r.date, Environnement: r.org, Table: r.entity, Enregistrements: r.ids.length })).map((o, i) => Object.defineProperty(o, '_i', { value: i })).reverse(), {
      exportName: 'generations', empty: 'Aucune génération enregistrée.',
      onRow: async (row) => {
        const run = st[row._i];
        const typed = await promptBox(`Supprimer les ${run.ids.length} enregistrement(s) « ${run.entity} » créés le ${new Date(run.date).toLocaleString('fr-FR')} dans ${orgName()} ?`, { title: 'Supprimer cette génération', danger: true, expect: String(run.ids.length), confirmText: 'Supprimer' });
        if (typed !== String(run.ids.length)) return;
        const res = await pool(run.ids, 3, (id) => q(`${run.set}(${id})`, { method: 'DELETE' }));
        const ko = res.filter((r) => !r.ok).length;
        const left = st.filter((_, k) => k !== row._i);
        await chrome.storage.local.set({ genRuns: left });
        toast(`${res.length - ko} supprimé(s)${ko ? `, ${ko} en échec` : ''}`, !!ko);
        showRuns();
      },
    }));
  }

  const analyse = () => guarded(plan, async () => { await loadModel(); const d = h('div'); setTimeout(() => draw(), 0); return d; });

  root.append(
    h('div', { class: 'panel' }, h('b', {}, 'Attention : '), 'cet outil écrit dans l\'environnement connecté. Utilisez-le sur un environnement de développement ou de test.'),
    h('p', { class: 'muted' }, 'Lit le modèle de la table (types, obligatoires, longueurs, listes de choix, liens) et génère des valeurs cohérentes : e-mails, téléphones, villes, montants, dates, choix et liens vers des enregistrements existants.'),
    h('div', { class: 'toolbar' }, etn, mode, h('button', { class: 'primary', onclick: analyse }, 'Lire le modèle')),
    plan,
    h('div', { class: 'toolbar' }, 'Nombre', count),
    out,
    h('h2', {}, 'Générations précédentes (cliquer pour supprimer)'), runsBox);
  showRuns();
  if (cur) analyse();
};
