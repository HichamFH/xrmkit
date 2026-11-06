'use strict';
// Tableau de bord (accueil), utilisateur connecté, onglets à chargement différé.
Xrmkit.registerTab({
  id: 'home', group: 'Menu', icon: 'home', title: 'Tableau de bord',
  desc: 'Vue d\'ensemble de l\'environnement : modèle, solutions, automatisation, tâches système et utilisateur connecté.',
  render: (root) => homeTab(root),
});

// Documentation de solutions : ~800 lignes chargées uniquement à la première ouverture.
TITLES.sdoc = 'Documentation de solutions';
Xrmkit.lazy('sdoc', ['soldoc-render.js', 'soldoc.js']);

// ---------- Utilisateur connecté (partagé : tableau de bord, performance, barre du haut) ----------
let _user = null;
async function currentUser(force) {
  if (_user && !force) return _user;
  const who = (await q('WhoAmI')).data || {};
  const id = who.UserId;
  let u = {};
  try { u = (await q(`systemusers(${id})?$select=fullname,internalemailaddress,jobtitle,domainname&$expand=businessunitid($select=name)`)).data || {}; } catch (e) { /* droits limités */ }
  let roles = [];
  try { roles = (await rows(`systemusers(${id})/systemuserroles_association?$select=name`)).map((r) => r.name).sort(); } catch (e) { /* ignore */ }
  const name = u.fullname || (state.orgInfo && state.orgInfo.user) || id || '—';
  _user = { id, name, email: u.internalemailaddress || u.domainname || '', title: u.jobtitle || '', bu: (u.businessunitid && u.businessunitid.name) || '', roles, initials: initialsOf(name) };
  return _user;
}
function initialsOf(name) {
  const p = String(name || '?').replace(/[^\p{L}\s'-]/gu, '').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
const avatar = (name, cls = '') => h('span', { class: `avatar ${cls}`, 'aria-hidden': 'true' }, initialsOf(name));

// Carte qui se remplit toute seule (spinner → contenu ou erreur), sans bloquer les autres.
function lazyCard(title, subtitle, loader, cls = '') {
  const body = h('div', { class: 'dcard-body' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
  const card = Charts.card(title, subtitle, body);
  if (cls) card.classList.add(...cls.split(' '));
  Promise.resolve().then(loader).then((n) => body.replaceChildren(n)).catch((e) => body.replaceChildren(h('p', { class: 'muted' }, e.message || String(e))));
  return card;
}

const WF_CATEGORY = { 0: 'Workflows', 1: 'Dialogues', 2: 'Règles métier', 3: 'Actions', 4: 'Processus métier', 5: 'Flux cloud' };
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

async function homeTab(root) {
  const stats = h('div', { class: 'stats' });
  const grid = h('div', { class: 'dgrid' });
  const refresh = () => { q.clearCache(); _user = null; root.replaceChildren(); homeTab(root); };

  // Données partagées entre indicateurs et graphiques (chaque requête n'est faite qu'une fois)
  const dTables = entityList();
  const dSols = rows('solutions?$select=solutionid,friendlyname,uniquename,version,ismanaged,modifiedon&$expand=publisherid($select=friendlyname)&$filter=isvisible eq true&$orderby=modifiedon desc', { maxPages: 2 });
  const dSteps = rows('sdkmessageprocessingsteps?$select=statecode,stage,mode&$filter=ishidden/Value eq false and ismanaged eq false', { formatted: false, maxPages: 3, pageSize: 5000 });
  const dWf = rows('workflows?$select=category,statecode&$filter=type eq 1', { formatted: false, maxPages: 3, pageSize: 5000 });
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const dJobs = rows(`asyncoperations?$select=createdon&$filter=statuscode eq 31 and createdon gt ${since}`, { formatted: false, maxPages: 2, pageSize: 5000 });
  [dTables, dSols, dSteps, dWf, dJobs].forEach((p) => p.catch(() => {})); // évite les « unhandled » : gérés carte par carte

  const slot = (label, tag, p, build) => {
    const box = h('div', { class: 'stat' }, h('div', { class: 'stat-top' }, h('span', { class: 'stat-l' }, Charts.statBadge(label), label), tag ? h('span', { class: 'stat-tag' }, tag) : null), h('div', { class: 'stat-mid' }, h('div', { class: 'stat-v' }, '…')), Charts.progress(0));
    p.then((d) => box.replaceWith(Charts.stat(build(d)))).catch((e) => { box.querySelector('.stat-v').textContent = '—'; box.title = e.message; });
    return box;
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  stats.append(
    slot('Tables', 'Modèle', dTables, (t) => { const c = t.filter((x) => x.IsCustomEntity).length; return { label: 'Tables', tag: 'Modèle', value: String(t.length), delta: `${pct(c, t.length)} % perso`, deltaGood: true, pct: pct(c, t.length), color: 'var(--c-teal)', sub: `${c} personnalisées` }; }),
    slot('Solutions', 'Configuration', dSols, (s) => { const u = s.filter((x) => !x.ismanaged).length; return { label: 'Solutions', tag: 'Configuration', value: String(s.length), delta: `${u} non gérées`, deltaGood: true, pct: pct(u, s.length), color: 'var(--c-red)', sub: `${s.length - u} gérées` }; }),
    slot('Étapes de plug-ins', 'Logique', dSteps, (s) => { const a = s.filter((x) => x.statecode === 0).length; return { label: 'Étapes de plug-ins', tag: 'Logique', value: String(s.length), delta: `${pct(a, s.length)} % actives`, deltaGood: a === s.length, pct: pct(a, s.length), color: 'var(--c-amber)', sub: `${s.length - a} désactivées` }; }),
    slot('Flux cloud', 'Automatisation', dWf, (w) => { const f = w.filter((x) => x.category === 5); const a = f.filter((x) => x.statecode === 1).length; return { label: 'Flux cloud', tag: 'Automatisation', value: String(f.length), delta: `${pct(a, f.length)} % activés`, deltaGood: a === f.length, pct: pct(a, f.length), color: 'var(--c-cyan)', sub: `${f.length - a} désactivés` }; }));

  const autoCard = lazyCard('Automatisations par catégorie', 'Définitions actives et inactives (flux, workflows, règles, actions, processus)', async () => {
    const w = await dWf; const by = {};
    w.forEach((x) => { by[x.category] = (by[x.category] || 0) + 1; });
    return Charts.bars(Object.entries(by).map(([k, v]) => ({ label: T(WF_CATEGORY[k] || `Cat. ${k}`), value: v })), { height: 230 });
  }, 'span2');
  const gaugeCard = lazyCard('Santé des flux', 'Flux activés', async () => {
    const f = (await dWf).filter((x) => x.category === 5); const a = f.filter((x) => x.statecode === 1).length;
    if (!f.length) return h('p', { class: 'muted' }, T('Aucune donnée.'));
    return Charts.gauge(pct(a, f.length), { sub: `${a} / ${f.length}`, color: 'var(--c-violet)', label: `${pct(a, f.length)} %` });
  });
  const jobsCard = lazyCard('Tâches système en échec', 'Dernières 14 jours', async () => {
    const j = await dJobs; const by = {};
    for (let i = 13; i >= 0; i--) by[dayKey(Date.now() - i * 864e5)] = 0;
    j.forEach((x) => { const k = dayKey(x.createdon); if (k in by) by[k]++; });
    return h('div', {}, h('div', { class: 'big-n' }, String(j.length)), Charts.area(Object.entries(by).map(([k, v]) => ({ x: k.slice(5), y: v })), { color: 'var(--c-red)', height: 180, width: 300 }));
  });
  const solCard = lazyCard('Solutions récemment modifiées', 'Les 6 dernières mises à jour', async () => {
    const s = (await dSols).slice(0, 6);
    return h('table', { class: 'plain' }, h('thead', {}, h('tr', {}, ['Solution', 'Éditeur', 'Version', 'Modifiée'].map((c) => h('th', {}, c)))),
      h('tbody', {}, s.map((x) => h('tr', {}, h('td', {}, h('span', { class: 'who' }, avatar(x.friendlyname), x.friendlyname)), h('td', {}, (x.publisherid && x.publisherid.friendlyname) || ''), h('td', {}, x.version), h('td', {}, String(x.modifiedon || '').slice(0, 10))))));
  }, 'span3');
  const userCard = lazyCard('Utilisateur connecté', '', async () => {
    const u = await currentUser();
    return h('div', { class: 'usercard' }, avatar(u.name, 'big'), h('div', { class: 'u-name' }, u.name), u.title ? h('div', { class: 'muted' }, u.title) : null,
      h('dl', {}, u.email ? [h('dt', {}, 'E-mail'), h('dd', {}, u.email)] : null, u.bu ? [h('dt', {}, 'Unité commerciale'), h('dd', {}, u.bu)] : null, h('dt', {}, 'Rôles'), h('dd', {}, u.roles.length ? u.roles.map((r) => h('span', { class: 'chip static' }, r)) : '—')));
  });
  grid.append(autoCard, gaugeCard, jobsCard, solCard, userCard);
  root.append(h('div', { class: 'toolbar' }, h('button', { onclick: refresh }, '↻ ' + T('Actualiser le tableau de bord'))), stats, grid);
}
