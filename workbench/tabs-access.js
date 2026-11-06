'use strict';
// Rapport d'accès par utilisateur : rôles directs et via équipes, droits effectifs par table (matrice Créer/Lire/Écrire/…),
// droits sensibles et points d'attention. Logique pure dans logic.js (DK.accessMatrix, DK.accessFindings).
// À valider sur un vrai environnement : RetrieveUserPrivileges (sinon repli sur les privilèges des rôles).

Xrmkit.registerTab({
  id: 'access', group: 'Sécurité', order: 1, icon: 'lock', title: 'Rapport d\'accès utilisateur',
  desc: 'Rôles, équipes et droits effectifs d\'un utilisateur table par table, avec les droits sensibles et un rapport Word / Excel.',
  i18n: { en: { title: 'User access report', desc: 'Roles, teams and effective rights of a user table by table, with sensitive rights and a Word / Excel report.' } },
  render: (root) => accessTab(root),
});

const ACCESS_TEAM_TYPES = { 0: 'Propriétaire', 1: 'Accès', 2: 'Groupe de sécurité Entra ID', 3: 'Groupe Office Entra ID' };

async function accessPrivsFromRoles(roleIds) {
  const names = new Map();
  (await rows('privileges?$select=name,privilegeid', { formatted: false, maxPages: 50, pageSize: 5000 })).forEach((p) => names.set(p.privilegeid, p.name));
  const out = [];
  const res = await pool([...new Set(roleIds)], 3, async (rid) => {
    (await rows(`roleprivilegescollection?$select=privilegeid,privilegedepthmask&$filter=roleid eq ${rid}`, { formatted: false, maxPages: 50, pageSize: 5000 })).forEach((rp) => {
      const n = names.get(rp.privilegeid), mk = rp.privilegedepthmask;
      if (n) out.push({ PrivilegeName: n, Depth: mk & 8 ? 3 : mk & 4 ? 2 : mk & 2 ? 1 : mk & 1 ? 0 : -1 });
    });
  });
  if (res.every((r) => !r.ok) && res.length) throw res[0].e;
  return out;
}

// Collecte complète pour un utilisateur → modèle prêt à afficher / exporter.
async function accessCollect(user, progress) {
  const id = cleanGuid(user.id), warns = [];
  if (!isGuid(id)) throw new Error('Identifiant utilisateur invalide.');
  const part = async (label, fn, dflt) => { progress(label); try { return await fn(); } catch (e) { warns.push(`${label} ${e.message}`); return dflt; } };

  const info = await part('Utilisateur…', async () => (await q(`systemusers(${id})?$select=fullname,domainname,internalemailaddress,jobtitle,isdisabled,accessmode&$expand=businessunitid($select=name),parentsystemuserid($select=fullname)`)).data || {}, {});
  const direct = await part('Rôles directs…', () => rows(`systemusers(${id})/systemuserroles_association?$select=name,roleid`, { formatted: false }), []);
  const teams = await part('Équipes…', () => rows(`systemusers(${id})/teammembership_association?$select=name,teamid,teamtype`, { formatted: false }), []);
  progress('Rôles des équipes…');
  const teamRoles = await pool(teams, 4, async (t) => rows(`teams(${t.teamid})/teamroles_association?$select=name,roleid`, { formatted: false }));
  teamRoles.forEach((r, i) => { if (r.ok) teams[i].roles = r.v; else { teams[i].roles = []; warns.push(`Rôles de l'équipe ${teams[i].name} : ${r.e.message}`); } });

  progress('Droits effectifs…');
  let privs = null, source = 'RetrieveUserPrivileges';
  for (const path of [`systemusers(${id})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges`, `RetrieveUserPrivileges(UserId=${id})`]) {
    try { const r = await q(path); const list = r.data && r.data.RolePrivileges; if (Array.isArray(list)) { privs = list; break; } } catch (e) { /* essai suivant */ }
  }
  if (!privs) {
    const roleIds = [...direct.map((r) => r.roleid), ...teams.flatMap((t) => (t.roles || []).map((r) => r.roleid))];
    privs = await part('Droits calculés depuis les rôles…', () => accessPrivsFromRoles(roleIds), []);
    source = 'privilèges des rôles (repli : RetrieveUserPrivileges indisponible)';
  }
  progress('');

  const ents = await entityList();
  const known = ents.map((e) => e.LogicalName);
  const matrix = DK.accessMatrix(privs, known);
  const roleNames = [...direct.map((r) => r.name), ...teams.flatMap((t) => (t.roles || []).map((r) => r.name))];
  const meta = Object.fromEntries(ents.map((e) => [e.LogicalName, e]));
  return { id, info, direct, teams, matrix, findings: DK.accessFindings(matrix, roleNames), warns, source, meta, nbPrivs: privs.length };
}

const accessCell = (v) => (v == null ? '—' : v < 0 ? '?' : DK.DEPTH_SHORT[v]);
function accessRows(m, onlyCustom) {
  return m.matrix.rows.filter((r) => !onlyCustom || (m.meta[r.table] && m.meta[r.table].IsCustomEntity)).map((r) => ({
    Table: r.table, Libellé: label(m.meta[r.table] && m.meta[r.table].DisplayName), Créer: accessCell(r.Create), Lire: accessCell(r.Read), Écrire: accessCell(r.Write), Supprimer: accessCell(r.Delete),
    'Ajouter à': accessCell(r.Append), Ajouter: accessCell(r.AppendTo), Attribuer: accessCell(r.Assign), Partager: accessCell(r.Share),
  }));
}
const accessRoleRows = (m) => [
  ...m.direct.map((r) => ({ Source: 'Direct', Rôle: r.name })),
  ...m.teams.flatMap((t) => (t.roles || []).map((r) => ({ Source: `Équipe : ${t.name}`, Rôle: r.name }))),
];

const ACCESS_SPEC = {
  key: 'access', fileName: 'rapport-acces',
  vars: [['environnement', 'Environnement'], ['date', 'Date de génération'], ['utilisateur', 'Nom complet'], ['compte', 'Compte'], ['email', 'E-mail'], ['poste', 'Fonction'],
    ['unite_commerciale', 'Unité commerciale'], ['responsable', 'Responsable'], ['desactive', 'Compte désactivé'], ['nb_roles', 'Nombre de rôles'], ['nb_equipes', 'Nombre d\'équipes'],
    ['nb_tables', 'Tables avec des droits'], ['nb_lecture_org', 'Tables en lecture niveau Organisation'], ['nb_ecriture_org', 'Tables en écriture niveau Organisation'],
    ['nb_suppression_org', 'Tables en suppression niveau Organisation'], ['nb_points_attention', 'Nombre de points d\'attention'], ['source_droits', 'Méthode de calcul des droits']],
  lists: [
    { name: 'roles', desc: 'Rôles de sécurité', fields: [['source', 'Source'], ['nom', 'Rôle']] },
    { name: 'equipes', desc: 'Équipes', fields: [['nom', 'Équipe'], ['type', 'Type'], ['roles', 'Rôles']] },
    { name: 'tables', desc: 'Droits par table', fields: [['table', 'Table'], ['libelle', 'Libellé'], ['creer', 'Créer'], ['lire', 'Lire'], ['ecrire', 'Écrire'], ['supprimer', 'Supprimer'], ['ajouter_a', 'Ajouter à'], ['ajouter', 'Ajouter'], ['attribuer', 'Attribuer'], ['partager', 'Partager']] },
    { name: 'droits_speciaux', desc: 'Autres droits (hors tables)', fields: [['nom', 'Droit'], ['niveau', 'Niveau']] },
    { name: 'points_attention', desc: 'Points d\'attention', fields: [['gravite', 'Gravité'], ['message', 'Constat']] },
  ],
};
function accessData(m) {
  const rws = m.matrix.rows, at = (v) => rws.filter((r) => r[v] === 3).length;
  const t = accessRows(m, false);
  return {
    environnement: orgName(), date: new Date().toLocaleString('fr-FR'), utilisateur: m.info.fullname || '', compte: m.info.domainname || '', email: m.info.internalemailaddress || '', poste: m.info.jobtitle || '',
    unite_commerciale: (m.info.businessunitid && m.info.businessunitid.name) || '', responsable: (m.info.parentsystemuserid && m.info.parentsystemuserid.fullname) || '', desactive: !!m.info.isdisabled,
    nb_roles: accessRoleRows(m).length, nb_equipes: m.teams.length, nb_tables: rws.length, nb_lecture_org: at('Read'), nb_ecriture_org: at('Write'), nb_suppression_org: at('Delete'),
    nb_points_attention: m.findings.length, source_droits: m.source,
    roles: accessRoleRows(m).map((r) => ({ source: r.Source, nom: r['Rôle'] })),
    equipes: m.teams.map((x) => ({ nom: x.name, type: ACCESS_TEAM_TYPES[x.teamtype] || String(x.teamtype), roles: (x.roles || []).map((r) => r.name).join(', ') })),
    tables: t.map((r) => ({ table: r.Table, libelle: r['Libellé'], creer: r['Créer'], lire: r['Lire'], ecrire: r['Écrire'], supprimer: r.Supprimer, ajouter_a: r['Ajouter à'], ajouter: r.Ajouter, attribuer: r.Attribuer, partager: r.Partager })),
    droits_speciaux: m.matrix.other.map((o) => ({ nom: o.name, niveau: o.depth < 0 ? '?' : DK.DEPTHS[o.depth] })),
    points_attention: m.findings.map(([g, msg]) => ({ gravite: g, message: msg })),
  };
}

async function accessTab(root) {
  const out = h('div'), prog = progressLine(), tplHost = h('div');
  let last = null;
  const customChk = h('input', { type: 'checkbox' });

  async function analyse(user) {
    await guarded(out, async () => {
      const m = await accessCollect(user, (t) => prog.set(t));
      last = { m, user };
      tplHost.replaceChildren(Reports.panel({ ...ACCESS_SPEC, title: 'Rapport d\'accès utilisateur', getData: async () => accessData(last.m) }));
      const info = m.info, sev = { haute: 'error', moyenne: 'muted', info: 'muted' };
      const render = () => dataTable(accessRows(m, customChk.checked), { exportName: `droits-${(info.fullname || 'utilisateur').replace(/\W+/g, '-')}`, empty: 'Aucun droit sur les tables.' });
      const matrixHost = h('div', {}, render());
      customChk.onchange = () => matrixHost.replaceChildren(render());
      return h('div', {},
        h('h2', {}, info.fullname || user.name),
        m.warns.length ? h('p', { class: 'error' }, 'Collecte incomplète (droits insuffisants ?) : ' + m.warns.join(' | ')) : null,
        kvTable({ Compte: info.domainname, 'E-mail': info.internalemailaddress, Fonction: info.jobtitle, 'Unité commerciale': info.businessunitid && info.businessunitid.name, Responsable: info.parentsystemuserid && info.parentsystemuserid.fullname, Désactivé: info.isdisabled, 'Droits calculés par': m.source }),
        h('h2', {}, 'Points d\'attention'),
        m.findings.length ? h('div', {}, ...m.findings.map(([g, msg]) => h('p', { class: sev[g] }, (g === 'haute' ? '⚠ ' : '• ') + msg))) : h('p', { class: 'ok' }, 'Aucun point d\'attention détecté.'),
        h('h2', {}, `Rôles (${accessRoleRows(m).length})`),
        dataTable(accessRoleRows(m), { exportName: 'roles-utilisateur', empty: 'Aucun rôle.' }),
        h('h2', {}, `Équipes (${m.teams.length})`),
        dataTable(m.teams.map((t) => ({ Équipe: t.name, Type: ACCESS_TEAM_TYPES[t.teamtype] || t.teamtype, Rôles: (t.roles || []).map((r) => r.name).join(', ') })), { exportName: 'equipes-utilisateur', empty: 'Aucune équipe.' }),
        h('h2', {}, 'Droits par table'),
        h('p', { class: 'muted' }, 'Niveau le plus élevé obtenu par cumul des rôles et des équipes : Util. = ses propres enregistrements, UC = son unité commerciale, UC+ = UC et enfants, Org = toute l\'organisation, — = aucun droit.'),
        h('div', { class: 'toolbar' }, h('label', { class: 'inline' }, customChk, 'Tables personnalisées seulement')),
        matrixHost,
        m.matrix.other.length ? h('div', {}, h('h2', {}, `Autres droits (${m.matrix.other.length})`), dataTable(m.matrix.other.map((o) => ({ Droit: o.name, Niveau: o.depth < 0 ? '?' : DK.DEPTHS[o.depth], Sensible: DK.SENSITIVE_PRIVS[o.name] ? 'oui' : '' })), { exportName: 'autres-droits' })) : null);
    });
  }

  const exportXlsx = () => guarded(prog, async () => {
    if (!last) throw new Error('Choisissez d\'abord un utilisateur.');
    const { m } = last, tbl = accessRows(m, false);
    saveBlob(`acces-${(m.info.fullname || 'utilisateur').replace(/\W+/g, '-')}-${stamp()}.xlsx`, Office.xlsx([
      { name: 'Rôles', rows: [['Source', 'Rôle'], ...accessRoleRows(m).map((r) => [r.Source, r['Rôle']])] },
      { name: 'Droits par table', rows: tbl.length ? [Object.keys(tbl[0]), ...tbl.map((r) => Object.values(r))] : [['Aucun droit']] },
      { name: 'Autres droits', rows: [['Droit', 'Niveau'], ...m.matrix.other.map((o) => [o.name, o.depth < 0 ? '?' : DK.DEPTHS[o.depth]])] },
      { name: 'Points d\'attention', rows: [['Gravité', 'Constat'], ...m.findings] }]));
    return h('p', { class: 'ok' }, 'Fichier Excel généré.');
  });
  const exportDocx = () => guarded(prog, async () => {
    if (!last) throw new Error('Choisissez d\'abord un utilisateur.');
    const { m } = last, d = accessData(m), tbl = accessRows(m, false);
    const B = [{ t: 'title', text: `Rapport d'accès — ${d.utilisateur}` }, { t: 'p', text: `Environnement : ${d.environnement} — ${d.date}` },
      { t: 'p', text: `Compte : ${d.compte} — Unité commerciale : ${d.unite_commerciale} — Droits calculés par : ${d.source_droits}` }, { t: 'h1', text: 'Points d\'attention' }];
    B.push(m.findings.length ? { t: 'table', header: ['Gravité', 'Constat'], rows: m.findings } : { t: 'p', text: 'Aucun point d\'attention détecté.' });
    B.push({ t: 'h1', text: 'Rôles' }, accessRoleRows(m).length ? { t: 'table', header: ['Source', 'Rôle'], rows: accessRoleRows(m).map((r) => [r.Source, r['Rôle']]) } : { t: 'p', text: 'Aucun rôle.' });
    B.push({ t: 'h1', text: 'Droits par table' }, tbl.length ? { t: 'table', header: ['Table', 'Libellé', 'Créer', 'Lire', 'Écrire', 'Suppr.', 'Ajouter à', 'Ajouter', 'Attrib.', 'Partager'], rows: tbl.map((r) => Object.values(r)) } : { t: 'p', text: 'Aucun droit.' });
    saveBlob(`acces-${(d.utilisateur || 'utilisateur').replace(/\W+/g, '-')}-${stamp()}.docx`, Office.docx(B, { landscape: true }));
    return h('p', { class: 'ok' }, 'Document Word généré.');
  });

  const mine = async () => {
    const u = await currentUser();
    if (!u || !u.id) { toast('Utilisateur courant introuvable.', true); return; }
    analyse({ id: u.id, name: u.name });
  };

  root.append(
    h('p', { class: 'muted' }, 'Cherchez un utilisateur puis cliquez sur sa ligne : Xrmkit calcule ses droits effectifs (rôles directs + équipes) et signale ce qui mérite une revue.'),
    h('div', { class: 'toolbar' }, h('button', { onclick: mine }, 'Mon compte')),
    userPicker(analyse),
    h('div', { class: 'toolbar' }, h('button', { onclick: exportDocx }, 'Rapport Word (.docx)'), h('button', { onclick: exportXlsx }, 'Excel (.xlsx)')),
    prog, out, tplHost);
}
