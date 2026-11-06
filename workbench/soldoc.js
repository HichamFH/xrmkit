'use strict';
// Documentation de solutions : sélection → collecte de tous les composants → modèle → rendus (HTML, Word, Markdown, Excel).
// Cas d'utilisation : déduits de la configuration, et enrichis par l'IA si l'utilisateur le demande.

Object.assign(TITLES, { sdoc: 'Documentation de solutions' });

const SD = {};
SD.STAGE = { 10: 'Pré-validation', 20: 'Pré-opération', 30: 'Principal', 40: 'Post-opération' };
SD.FORM_TYPES = { 0: 'Tableau de bord', 1: 'Carnet de rendez-vous', 2: 'Principal', 3: 'Mini', 4: 'Aperçu', 5: 'Mobile', 6: 'Vue rapide', 7: 'Création rapide', 8: 'Dialogue', 9: 'Flux de tâches', 10: 'Tableau de bord interactif', 11: 'Carte', 12: 'Principal interactif' };
SD.VIEW_TYPES = { 0: 'Publique', 1: 'Recherche avancée', 2: 'Associée', 4: 'Recherche rapide', 8: 'Vue Outlook', 16: 'Filtrage hors ligne', 64: 'Recherche (lookup)', 128: 'Vue de service', 256: 'Vue personnelle' };
SD.TRIG = { 1: 'création', 2: 'suppression', 3: 'modification', 4: 'création ou modification', 5: 'création ou suppression', 6: 'modification ou suppression', 7: 'création, modification ou suppression' };
SD.SYS_LOOKUPS = new Set(['createdby', 'modifiedby', 'createdonbehalfby', 'modifiedonbehalfby', 'ownerid', 'owninguser', 'owningteam', 'owningbusinessunit', 'transactioncurrencyid', 'owneridyominame']);
SD.SYS_TABLES = new Set(['systemuser', 'team', 'businessunit', 'transactioncurrency', 'organization', 'processstage', 'workflow', 'queue', 'calendar', 'mailbox', 'syncerror']);

// Collecte : ids de composants par type (solutioncomponents), puis résolution de chaque type.
SD.chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
SD.byIds = async (path, idField, ids, opts = {}) => {
  if (!ids.length) return [];
  const parts = await pool(SD.chunk(ids, opts.size || 12), 3, (c) => rows(`${path}${path.includes('?') ? '&' : '?'}$filter=${c.map((i) => `${idField} eq ${i}`).join(' or ')}`, { formatted: !!opts.formatted, maxPages: 3, pageSize: 500 }));
  const out = [];
  parts.forEach((p) => { if (p.ok) out.push(...p.v); else (opts.warn || (() => {}))(`${opts.what || path.split('?')[0]} : ${p.e.message}`); });
  return out;
};

SD.flowTrigger = (cd) => {
  try {
    const j = typeof cd === 'string' ? JSON.parse(cd) : cd;
    const def = (j.properties && j.properties.definition) || j.definition || {};
    const trig = def.triggers || {};
    const k = Object.keys(trig)[0];
    const tr = trig[k] || {};
    const prm = (tr.inputs && tr.inputs.parameters) || {};
    const refs = (j.properties && j.properties.connectionReferences) || j.connectionReferences || {};
    const connectors = [...new Set(Object.values(refs).map((r) => String((r.api && r.api.name) || r.connectionName || '').replace(/^shared_/, '')).filter(Boolean))];
    let text = k ? k.replace(/_/g, ' ') : '';
    let entity = '';
    if (prm['subscriptionRequest/message'] != null) { text = `Dataverse : ${SD.TRIG[prm['subscriptionRequest/message']] || 'ligne'}`; entity = prm['subscriptionRequest/entityname'] || ''; if (prm['subscriptionRequest/filteringattributes']) text += ` (${String(prm['subscriptionRequest/filteringattributes']).slice(0, 60)})`; }
    else if (tr.recurrence) text = `Planifié (${tr.recurrence.frequency} ×${tr.recurrence.interval})`;
    else if (tr.type === 'Request' || /manual/i.test(k || '')) text = 'Manuel / à la demande';
    return { trigger: text, entity, connectors, actions: Object.keys(def.actions || {}).length };
  } catch (e) { return { trigger: '', entity: '', connectors: [], actions: 0 }; }
};

SD.wfTrigger = (w) => {
  const t = [];
  if (w.triggeroncreate) t.push('création');
  if (w.triggerondelete) t.push('suppression');
  if (w.triggeronupdateattributelist != null && w.triggeronupdateattributelist !== '') t.push(`modification (${String(w.triggeronupdateattributelist).slice(0, 50)})`);
  if (w.ondemand) t.push('à la demande');
  return t.join(', ');
};

SD.collect = async (solIds, opts, progress) => {
  const warn = []; const W = (x) => warn.push(x);
  const step = (t) => progress && progress(t);
  step('Lecture des solutions…');
  const solRows = await rows('solutions?$select=solutionid,friendlyname,uniquename,version,ismanaged,description,installedon,modifiedon&$expand=publisherid($select=friendlyname,customizationprefix)&$filter=isvisible eq true');
  const chosen = solRows.filter((s) => solIds.includes(s.solutionid));
  const solutions = chosen.map((s) => ({ id: s.solutionid, name: s.friendlyname, unique: s.uniquename, version: s.version, managed: !!s.ismanaged, description: s.description || '', installedon: s.installedon, modifiedon: s.modifiedon, publisher: s.publisherid && s.publisherid.friendlyname, prefix: s.publisherid && s.publisherid.customizationprefix }));

  step('Récupération de la liste des composants…');
  const comp = {}; // type -> Set(id)
  await pool(solIds, 3, async (sid) => {
    (await rows(`solutioncomponents?$select=objectid,componenttype&$filter=_solutionid_value eq ${sid}`, { maxPages: 30, pageSize: 5000 })).forEach((c) => { (comp[c.componenttype] ||= new Set()).add(String(c.objectid).toLowerCase()); });
  });
  const ids = (t) => [...(comp[t] || [])];
  const total = Object.values(comp).reduce((n, s) => n + s.size, 0);

  const m = {
    meta: { title: opts.title, client: opts.client || '', author: opts.author || '', org: orgName(), date: new Date().toISOString(), solutions, options: opts },
    tables: [], globalOptionSets: [], forms: [], views: [], dashboards: [], charts: [], flows: [], rules: [], workflows: [], actions: [], bpf: [],
    plugins: { assemblies: [], steps: [] }, webresources: [], apps: [], sitemaps: [], roles: [], fieldProfiles: [], envVars: [], connRefs: [], connectors: [], canvasApps: [], customControls: [], emailTemplates: [], reports: [], other: [],
    uc: [], issues: [], ai: null, warnings: warn, total,
  };
  const known = new Set([1, 2, 9, 10, 14, 20, 24, 26, 29, 31, 36, 59, 60, 61, 62, 66, 70, 80, 90, 91, 92, 300, 371, 372, 380, 381]);

  // ---- Tables (détail des colonnes et relations plus bas)
  step('Tables et métadonnées…');
  const tableIds = ids(1);
  const metaT = await pool(tableIds, 4, (id) => q(`EntityDefinitions(${id})?$select=LogicalName,SchemaName,DisplayName,Description,EntitySetName,PrimaryNameAttribute,IsCustomEntity,OwnershipType,IsAuditEnabled,IsActivity`).then((r) => r.data));
  metaT.forEach((r, i) => { if (!r.ok) { W(`Table ${tableIds[i]} : ${r.e.message}`); return; } const e = r.v; m.tables.push({ logical: e.LogicalName, label: label(e.DisplayName), desc: label(e.Description), set: e.EntitySetName, primary: e.PrimaryNameAttribute, custom: !!e.IsCustomEntity, ownership: e.OwnershipType === 'UserOwned' ? 'Utilisateur / équipe' : e.OwnershipType === 'OrganizationOwned' ? 'Organisation' : e.OwnershipType || '', audit: !!(e.IsAuditEnabled && e.IsAuditEnabled.Value), activity: !!e.IsActivity, columns: [], options: [], relations: [], forms: [], views: [], auto: { flows: 0, rules: 0, workflows: 0, pluginsSync: 0, pluginsAsync: 0, scripts: 0 } }); });
  m.tables.sort((a, b) => a.logical.localeCompare(b.logical));
  const tmap = Object.fromEntries(m.tables.map((t) => [t.logical, t]));
  const names = new Set(m.tables.map((t) => t.logical));

  // ---- Listes de choix globales
  if (ids(9).length) {
    step('Listes de choix globales…');
    (await pool(ids(9), 4, (id) => q(`GlobalOptionSetDefinitions(${id})`).then((r) => r.data))).forEach((r) => { if (!r.ok) return W('Liste globale : ' + r.e.message); const o = r.v; m.globalOptionSets.push({ name: o.Name, label: label(o.DisplayName), options: (o.Options || []).slice(0, 14).map((x) => `${x.Value}=${label(x.Label)}`).join(' · ') + ((o.Options || []).length > 14 ? ' …' : '') }); });
  }

  // ---- Formulaires, tableaux de bord, vues, graphiques
  step('Formulaires, vues et tableaux de bord…');
  (await SD.byIds('systemforms?$select=name,objecttypecode,type,formid,description,formxml', 'formid', ids(60).concat(ids(24)), { size: 8, warn: W, what: 'Formulaires' })).forEach((f) => {
    const xml = f.formxml || '';
    const libs = [...new Set([...xml.matchAll(/<Library\s+name="([^"]+)"/g)].map((x) => x[1]))];
    const rec = { name: f.name, entity: f.objecttypecode === 'none' ? '' : f.objecttypecode, type: f.type, typeLabel: SD.FORM_TYPES[f.type] || `Type ${f.type}`, libs, events: (xml.match(/<Handler\b/g) || []).length, desc: f.description || '' };
    if (f.type === 0 || f.type === 10) m.dashboards.push(rec); else m.forms.push(rec);
  });
  (await SD.byIds('savedqueries?$select=name,returnedtypecode,querytype,isdefault,savedqueryid,description', 'savedqueryid', ids(26), { size: 12, warn: W, what: 'Vues' })).forEach((v) => m.views.push({ name: v.name, entity: v.returnedtypecode, typeLabel: SD.VIEW_TYPES[v.querytype] || `Type ${v.querytype}`, isdefault: !!v.isdefault, desc: v.description || '' }));
  (await SD.byIds('savedqueryvisualizations?$select=name,primaryentitytypecode,description,savedqueryvisualizationid', 'savedqueryvisualizationid', ids(59), { warn: W, what: 'Graphiques' })).forEach((c) => m.charts.push({ name: c.name, entity: c.primaryentitytypecode, desc: c.description || '' }));

  // ---- Automatisations
  step('Flux, règles et workflows…');
  const wf = await SD.byIds('workflows?$select=name,workflowid,category,primaryentity,statecode,mode,triggeroncreate,triggerondelete,triggeronupdateattributelist,ondemand,scope,description,_ownerid_value', 'workflowid', ids(29), { size: 10, formatted: true, warn: W, what: 'Workflows' });
  const flowIds = wf.filter((w) => w.category === 5).map((w) => w.workflowid);
  const cdata = {};
  if (flowIds.length) (await SD.byIds('workflows?$select=workflowid,clientdata', 'workflowid', flowIds, { size: 4, warn: W, what: 'Définitions de flux' })).forEach((w) => { cdata[w.workflowid] = w.clientdata; });
  wf.forEach((w) => {
    const state = w['statecode@OData.Community.Display.V1.FormattedValue'] || (w.statecode === 1 ? 'Activé' : w.statecode === 2 ? 'Suspendu' : 'Brouillon');
    const a = { name: w.name, kind: WF_CATS[w.category] || `Catégorie ${w.category}`, entity: w.primaryentity && w.primaryentity !== 'none' ? w.primaryentity : '', state, owner: w['_ownerid_value@OData.Community.Display.V1.FormattedValue'] || '', desc: w.description || '', trigger: '', connectors: [], ai: '' };
    if (w.category === 5) { const f = SD.flowTrigger(cdata[w.workflowid]); a.trigger = f.trigger; a.connectors = f.connectors; a.actions = f.actions; if (f.entity) a.entity = f.entity; m.flows.push(a); }
    else if (w.category === 2) { a.trigger = 'Formulaire / serveur'; m.rules.push(a); }
    else if (w.category === 3) { a.trigger = 'À la demande (action)'; m.actions.push(a); }
    else if (w.category === 4) { a.trigger = 'Processus métier'; m.bpf.push(a); }
    else { a.trigger = SD.wfTrigger(w); m.workflows.push(a); }
  });

  // ---- Plug-ins
  step('Plug-ins et étapes…');
  (await SD.byIds('pluginassemblies?$select=name,version,isolationmode,pluginassemblyid,description', 'pluginassemblyid', ids(91), { warn: W, what: 'Assemblies' })).forEach((a) => m.plugins.assemblies.push({ id: a.pluginassemblyid, name: a.name, version: a.version, isolation: a.isolationmode === 2 ? 'Sandbox' : 'Aucune', types: [] }));
  await pool(m.plugins.assemblies, 3, async (a) => { a.types = (await rows(`plugintypes?$select=typename&$filter=_pluginassemblyid_value eq ${a.id}`)).map((t) => t.typename); });
  (await SD.byIds('sdkmessageprocessingsteps?$select=name,stage,mode,rank,statecode,filteringattributes,sdkmessageprocessingstepid', 'sdkmessageprocessingstepid', ids(92), { size: 10, formatted: true, warn: W, what: 'Étapes de plug-ins' })).forEach((s) => {
    const f = s['_sdkmessagefilterid_value@OData.Community.Display.V1.FormattedValue'] || '';
    const mm = /^(.+?) of (\w+)$/.exec(f);
    const message = (mm && mm[1]) || s['_sdkmessageid_value@OData.Community.Display.V1.FormattedValue'] || '';
    m.plugins.steps.push({ name: s.name, message, entity: mm ? mm[2] : '', stage: s.stage, stageLabel: SD.STAGE[s.stage] || String(s.stage), mode: s.mode, modeLabel: s.mode === 0 ? 'Synchrone' : 'Asynchrone', state: s.statecode === 0 ? 'Activée' : 'Désactivée', filter: s.filteringattributes || '' });
  });

  // ---- Web resources, applications, plans de site
  step('Web resources et applications…');
  const WR = { 1: 'HTML', 2: 'CSS', 3: 'JavaScript', 4: 'XML', 5: 'PNG', 6: 'JPG', 7: 'GIF', 8: 'Silverlight', 9: 'XSL', 10: 'ICO', 11: 'SVG', 12: 'RESX' };
  (await SD.byIds('webresourceset?$select=name,displayname,webresourcetype,description,webresourceid', 'webresourceid', ids(61), { size: 15, warn: W, what: 'Web resources' })).forEach((w) => m.webresources.push({ name: w.name, label: w.displayname || '', type: WR[w.webresourcetype] || String(w.webresourcetype), desc: w.description || '' }));
  (await SD.byIds('appmodules?$select=name,uniquename,description,statecode,appmoduleid', 'appmoduleid', ids(80), { warn: W, what: 'Applications' })).forEach((a) => m.apps.push({ name: a.name, unique: a.uniquename, desc: a.description || '', state: a.statecode === 0 ? 'Active' : 'Inactive', ai: '' }));
  (await SD.byIds('sitemaps?$select=sitemapname,sitemapid', 'sitemapid', ids(62), { warn: W, what: 'Plans de site' })).forEach((s) => m.sitemaps.push({ name: s.sitemapname || '(plan de site)' }));
  if (ids(66).length) (await SD.byIds('customcontrols?$select=name,description,customcontrolid', 'customcontrolid', ids(66), { warn: W, what: 'Contrôles personnalisés' })).forEach((c) => m.customControls.push({ name: c.name, desc: c.description || '' }));

  // ---- Sécurité
  step('Sécurité…');
  const roleRows = await SD.byIds('roles?$select=name,roleid,ismanaged', 'roleid', ids(20), { warn: W, what: 'Rôles' });
  await pool(roleRows, 3, async (r) => { let n = null; try { n = ((await q(`RetrieveRolePrivilegesRole(RoleId=${r.roleid})`)).data.RolePrivileges || []).length; } catch (e) { /* droits */ } m.roles.push({ name: r.name, managed: !!r.ismanaged, privCount: n }); });
  m.roles.sort((a, b) => a.name.localeCompare(b.name));
  if (ids(70).length) (await SD.byIds('fieldsecurityprofiles?$select=name,description,fieldsecurityprofileid', 'fieldsecurityprofileid', ids(70), { warn: W, what: 'Profils de champ' })).forEach((p) => m.fieldProfiles.push({ name: p.name, desc: p.description || '' }));

  // ---- Intégration & configuration
  step('Variables, connexions et connecteurs…');
  const defs = await SD.byIds('environmentvariabledefinitions?$select=schemaname,displayname,defaultvalue,type,environmentvariabledefinitionid', 'environmentvariabledefinitionid', ids(380), { warn: W, what: 'Variables d\'environnement' });
  let vals = [];
  if (defs.length) { try { vals = await rows('environmentvariablevalues?$select=value,_environmentvariabledefinitionid_value', { maxPages: 3, pageSize: 1000 }); } catch (e) { W('Valeurs des variables : ' + e.message); } }
  const EVT = { 100000000: 'Texte', 100000001: 'Nombre', 100000002: 'JSON', 100000003: 'Source de données', 100000004: 'Secret' };
  defs.forEach((d) => { const v = vals.find((x) => String(x._environmentvariabledefinitionid_value).toLowerCase() === String(d.environmentvariabledefinitionid).toLowerCase()); m.envVars.push({ schema: d.schemaname, label: d.displayname || '', type: EVT[d.type] || String(d.type), default: d.type === 100000004 ? '(secret)' : d.defaultvalue, current: d.type === 100000004 ? (v ? '(secret)' : null) : v ? v.value : null }); });
  (await SD.byIds('connectionreferences?$select=connectionreferencelogicalname,connectionreferencedisplayname,connectorid,connectionid,connectionreferenceid', 'connectionreferenceid', ids(372), { warn: W, what: 'Références de connexion' })).forEach((c) => m.connRefs.push({ name: c.connectionreferencelogicalname, label: c.connectionreferencedisplayname || '', connector: String(c.connectorid || '').split('/').pop().replace(/^shared_/, ''), connected: !!c.connectionid }));
  if (ids(371).length) (await SD.byIds('connectors?$select=name,displayname,description,connectorid', 'connectorid', ids(371), { warn: W, what: 'Connecteurs' })).forEach((c) => m.connectors.push({ name: c.displayname || c.name, desc: c.description || '' }));
  if (ids(300).length) (await SD.byIds('canvasapps?$select=displayname,name,description,canvasappid', 'canvasappid', ids(300), { warn: W, what: 'Applications canevas' })).forEach((c) => m.canvasApps.push({ name: c.displayname, unique: c.name, desc: c.description || '' }));
  if (ids(36).length) (await SD.byIds('templates?$select=title,templatetypecode,templateid', 'templateid', ids(36), { warn: W, what: 'Modèles d\'e-mail' })).forEach((t) => m.emailTemplates.push({ name: t.title, entity: t.templatetypecode }));
  if (ids(31).length) (await SD.byIds('reports?$select=name,description,reportid', 'reportid', ids(31), { warn: W, what: 'Rapports' })).forEach((r) => m.reports.push({ name: r.name, desc: r.description || '' }));
  Object.keys(comp).filter((t) => !known.has(Number(t))).forEach((t) => m.other.push({ type: Number(t), count: comp[t].size }));

  // ---- Détail de chaque table (colonnes, relations, listes de choix)
  const tlist = m.tables.slice(0, opts.maxTables || 60);
  if (m.tables.length > tlist.length) W(`Détail limité aux ${tlist.length} premières tables sur ${m.tables.length}.`);
  let done = 0;
  await pool(tlist, 3, async (t) => {
    step(`Détail des tables… ${++done}/${tlist.length} (${t.logical})`);
    const attrs = await attributesOf(t.logical);
    t.columns = attrs.filter((a) => a.AttributeOf == null && a.IsValidForRead && a.AttributeType !== 'Virtual' && (opts.allColumns || a.IsCustomAttribute || a.IsPrimaryName || ['ApplicationRequired', 'SystemRequired'].includes(a.RequiredLevel && a.RequiredLevel.Value)))
      .map((a) => ({ name: a.LogicalName, label: label(a.DisplayName), type: a.AttributeType, required: ['ApplicationRequired', 'SystemRequired'].includes(a.RequiredLevel && a.RequiredLevel.Value) && !a.IsPrimaryId, custom: !!a.IsCustomAttribute, desc: label(a.Description) }))
      .sort((a, b) => (b.custom - a.custom) || a.name.localeCompare(b.name));
    try {
      const rel = await relationsOf(t.logical);
      rel.manyToOne.forEach((r) => { if (SD.SYS_LOOKUPS.has(r.ReferencingAttribute) || SD.SYS_TABLES.has(r.ReferencedEntity)) return; if (names.has(r.ReferencedEntity) || r.ReferencedEntity.includes('_')) t.relations.push({ kind: 'N-1', other: r.ReferencedEntity, attr: r.ReferencingAttribute, schema: r.SchemaName }); });
      rel.oneToMany.forEach((r) => { if (SD.SYS_TABLES.has(r.ReferencingEntity)) return; if (names.has(r.ReferencingEntity) || r.ReferencingEntity.includes('_')) t.relations.push({ kind: '1-N', other: r.ReferencingEntity, attr: r.ReferencingAttribute, schema: r.SchemaName }); });
      rel.manyToMany.forEach((r) => { const other = r.Entity1LogicalName === t.logical ? r.Entity2LogicalName : r.Entity1LogicalName; if (names.has(other) || other.includes('_')) t.relations.push({ kind: 'N-N', other, attr: r.SchemaName, schema: r.SchemaName }); });
    } catch (e) { W(`Relations de ${t.logical} : ${e.message}`); }
    if (opts.optionSets !== false && t.columns.some((c) => c.custom && /Picklist|State|Status|Boolean|Virtual/.test(c.type))) {
      try {
        const customs = new Set(t.columns.filter((c) => c.custom).map((c) => c.name));
        const grouped = {};
        (await optionSetsOf(t.logical)).filter((o) => customs.has(o.Champ)).forEach((o) => { (grouped[o.Champ] ||= []).push(`${o.Valeur}=${o['Libellé']}`); });
        t.options = Object.entries(grouped).map(([col, v]) => ({ col, values: v.slice(0, 14).join(' · ') + (v.length > 14 ? ' …' : '') }));
      } catch (e) { /* ignore */ }
    }
  });

  // ---- Rattachements aux tables + matrice d'automatisation
  m.forms.forEach((f) => { const t = tmap[f.entity]; if (t) { t.forms.push({ name: f.name, typeLabel: f.typeLabel }); t.auto.scripts += f.libs.length; } });
  m.views.forEach((v) => { const t = tmap[v.entity]; if (t) t.views.push({ name: v.name, isdefault: v.isdefault }); });
  m.flows.forEach((a) => { const t = tmap[a.entity]; if (t) t.auto.flows++; });
  m.rules.forEach((a) => { const t = tmap[a.entity]; if (t) t.auto.rules++; });
  [...m.workflows, ...m.actions, ...m.bpf].forEach((a) => { const t = tmap[a.entity]; if (t) t.auto.workflows++; });
  m.plugins.steps.forEach((s) => { const t = tmap[s.entity]; if (t) { if (s.mode === 0) t.auto.pluginsSync++; else t.auto.pluginsAsync++; } });

  SD.deriveUseCases(m);
  SD.deriveIssues(m);
  step('Terminé.');
  return m;
};

// Cas d'utilisation déduits de la configuration (sans IA).
SD.deriveUseCases = (m) => {
  const lab = (e) => (m.tables.find((t) => t.logical === e) || {}).label || e;
  const actors = m.roles.slice(0, 3).map((r) => r.name);
  const user = actors[0] || 'Utilisateur';
  const uc = [];
  const add = (u) => { if (uc.length < 14) uc.push({ id: `UC${uc.length + 1}`, ...u }); };
  [...m.flows, ...m.workflows].filter((a) => a.entity && a.trigger).forEach((a) => {
    add({ titre: `${a.name}`, acteur: user, actors: [user, 'Système'], declencheur: `${a.trigger} d'un(e) ${lab(a.entity)}`, objectif: a.desc || `Automatiser un traitement lorsqu'un(e) ${lab(a.entity)} est ${a.trigger}.`,
      prerequis: [`L'utilisateur a accès à la table ${lab(a.entity)}`, a.state && !/activ/i.test(a.state) ? `Le traitement est actuellement « ${a.state} » (à activer)` : 'Le traitement est activé'].filter(Boolean),
      scenario: [`L'utilisateur agit sur un(e) ${lab(a.entity)} (${a.trigger}).`, `${a.kind} « ${a.name} » se déclenche automatiquement.`, a.connectors && a.connectors.length ? `Le traitement s'appuie sur : ${a.connectors.join(', ')}.` : 'Le traitement applique ses règles sur les données.'],
      resultat: 'Les données sont mises à jour ou les notifications attendues sont envoyées.', composants: [a.name, a.entity] });
  });
  const byEnt = {};
  m.plugins.steps.filter((s) => s.entity).forEach((s) => { (byEnt[`${s.message}|${s.entity}`] ||= []).push(s); });
  Object.entries(byEnt).forEach(([k, l]) => {
    const [msg, ent] = k.split('|');
    add({ titre: `Logique serveur à l'opération « ${msg} » sur ${lab(ent)}`, acteur: user, actors: [user, 'Système'], declencheur: `${msg} d'un(e) ${lab(ent)}`, objectif: 'Contrôler ou enrichir les données côté serveur.',
      prerequis: ['Les assemblies de plug-ins sont déployées', l.some((s) => s.state !== 'Activée') ? 'Certaines étapes sont désactivées' : 'Les étapes sont activées'],
      scenario: [`L'utilisateur ou un processus effectue l'opération ${msg} sur ${lab(ent)}.`, ...l.slice(0, 4).map((s) => `${s.stageLabel} (${s.modeLabel.toLowerCase()}) : ${s.name}`)], resultat: 'La règle serveur est appliquée avant ou après l\'enregistrement.', composants: l.slice(0, 4).map((s) => s.name) });
  });
  m.rules.slice(0, 6).forEach((r) => add({ titre: `Saisie guidée : ${r.name}`, acteur: user, actors: [user], declencheur: `Saisie sur ${lab(r.entity)}`, objectif: r.desc || 'Guider la saisie (champs obligatoires, visibilité, valeurs par défaut).', scenario: [`L'utilisateur ouvre un formulaire ${lab(r.entity)}.`, `La règle métier « ${r.name} » s'applique pendant la saisie.`], resultat: 'La saisie est cohérente avec les règles de gestion.', composants: [r.name] }));
  m.bpf.forEach((p) => add({ titre: `Suivre le processus « ${p.name} »`, acteur: user, actors: [user], declencheur: 'Ouverture d\'un enregistrement', objectif: p.desc || 'Faire avancer l\'enregistrement étape par étape.', scenario: [`L'utilisateur ouvre un(e) ${lab(p.entity)}.`, 'Il suit les étapes du processus et renseigne les champs requis.', 'Il passe à l\'étape suivante jusqu\'à la fin du processus.'], resultat: 'Le processus est terminé et les données obligatoires sont complètes.', composants: [p.name] }));
  m.apps.forEach((a) => add({ titre: `Travailler dans l'application « ${a.name} »`, acteur: user, actors: actors.length ? actors : [user], declencheur: 'Ouverture de l\'application', objectif: a.desc || 'Accéder aux tables et vues de l\'application.', scenario: ['L\'utilisateur ouvre l\'application depuis le menu des applications.', 'Il navigue dans le plan de site vers les tables et vues.', 'Il consulte, crée ou modifie des enregistrements.'], resultat: 'L\'utilisateur réalise son travail quotidien dans l\'application.', composants: [a.name] }));
  m.uc = uc;
};

// Points d'attention (contrôles automatiques).
SD.deriveIssues = (m) => {
  const I = (level, text) => m.issues.push({ level, text });
  m.meta.solutions.filter((s) => !s.managed).forEach((s) => I('low', `La solution « ${s.name} » est non gérée : exportez-la en gérée pour la production.`));
  [...m.flows, ...m.workflows].filter((a) => /brouillon|suspend/i.test(a.state)).forEach((a) => I('mid', `${a.kind} « ${a.name} » : état « ${a.state} » (ne s'exécute pas).`));
  m.plugins.steps.filter((s) => s.mode === 0 && /^Update$/i.test(s.message) && !s.filter).forEach((s) => I('high', `L'étape synchrone « ${s.name} » s'exécute à chaque modification de ${s.entity || 'la table'} sans filtrer de colonnes : risque de lenteur.`));
  const dis = m.plugins.steps.filter((s) => s.state !== 'Activée');
  if (dis.length) I('low', `${dis.length} étape(s) de plug-in désactivée(s) : ${dis.slice(0, 4).map((s) => s.name).join(' ; ')}${dis.length > 4 ? '…' : ''}.`);
  m.envVars.filter((v) => v.current == null && (v.default == null || v.default === '')).forEach((v) => I('high', `Variable d'environnement « ${v.schema} » sans valeur par défaut ni valeur actuelle.`));
  m.envVars.filter((v) => v.current == null && v.default).forEach((v) => I('low', `Variable « ${v.schema} » : seule la valeur par défaut est utilisée.`));
  m.connRefs.filter((c) => !c.connected).forEach((c) => I('mid', `Référence de connexion « ${c.name} » non liée à une connexion : les flux associés échoueront.`));
  m.forms.filter((f) => f.libs.length > 5).forEach((f) => I('mid', `Le formulaire « ${f.name} » (${f.entity}) charge ${f.libs.length} bibliothèques JavaScript : impact sur le temps d'ouverture.`));
  const noDesc = m.tables.filter((t) => t.custom && !t.desc);
  if (noDesc.length) I('low', `${noDesc.length} table(s) personnalisée(s) sans description : ${noDesc.slice(0, 5).map((t) => t.logical).join(', ')}${noDesc.length > 5 ? '…' : ''}.`);
  const wrNoDesc = m.webresources.filter((w) => !w.desc && !w.label);
  if (wrNoDesc.length > 3) I('low', `${wrNoDesc.length} web resources sans libellé ni description.`);
  m.other.forEach((o) => I('low', `${o.count} composant(s) de type ${o.type} non détaillé(s) dans ce document.`));
};

// ---------------------------------------------------------------------
// Enrichissement IA : résumé, acteurs, cas d'utilisation, descriptions, risques
// ---------------------------------------------------------------------
SD.aiPayload = (m) => {
  const tl = m.tables.slice(0, 40).map((t) => `- ${t.logical} (${t.label})${t.desc ? ' : ' + t.desc.slice(0, 120) : ''} | colonnes perso : ${t.columns.filter((c) => c.custom).slice(0, 14).map((c) => c.label || c.name).join(', ')}`);
  const au = [...m.flows, ...m.workflows, ...m.rules, ...m.actions, ...m.bpf].slice(0, 60).map((a) => `- [${a.kind}] ${a.name} | table: ${a.entity || '—'} | déclencheur: ${a.trigger || '—'} | état: ${a.state}${a.desc ? ' | ' + a.desc.slice(0, 120) : ''}`);
  const st = m.plugins.steps.slice(0, 40).map((s) => `- ${s.name} | ${s.message} ${s.entity} | ${s.stageLabel} ${s.modeLabel}`);
  return `Solutions : ${m.meta.solutions.map((s) => `${s.name}${s.description ? ' (' + s.description.slice(0, 160) + ')' : ''}`).join(' ; ')}
Tables :\n${tl.join('\n') || '—'}
Automatisations :\n${au.join('\n') || '—'}
Étapes de plug-ins :\n${st.join('\n') || '—'}
Applications : ${m.apps.map((a) => a.name).join(', ') || '—'}
Rôles : ${m.roles.map((r) => r.name).join(', ') || '—'}
Variables / connexions : ${[...m.envVars.map((v) => v.schema), ...m.connRefs.map((c) => c.name)].slice(0, 30).join(', ') || '—'}
Formulaires (scripts) : ${m.forms.filter((f) => f.libs.length).slice(0, 15).map((f) => `${f.name}[${f.libs.join(',')}]`).join(' ; ') || '—'}`;
};

SD.aiEnrich = async (m, onStatus) => {
  onStatus && onStatus('L\'IA rédige les cas d\'utilisation…');
  const system = `Tu es un analyste fonctionnel Dynamics 365 / Power Platform. À partir de la configuration d'une solution (noms, descriptions, déclencheurs — aucune donnée d'enregistrement), tu rédiges en français une documentation fonctionnelle. Ne rien inventer qui contredise la configuration : si une information manque, reste générique. Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de la forme :
{"resume":"3 à 5 phrases : à quoi sert la solution et pour qui",
"acteurs":[{"nom":"…","role":"…"}],
"cas_usage":[{"id":"UC1","titre":"…","acteur":"…","actors":["…"],"declencheur":"…","objectif":"…","prerequis":["…"],"scenario":["étape 1","étape 2"],"resultat":"…","composants":["nom exact d'un composant"]}],
"descriptions":{"nom exact d'un flux, workflow, règle ou application":"une phrase"},
"risques":["point d'attention technique ou fonctionnel"],
"recommandations":["action concrète"]}
Produis 6 à 12 cas d'utilisation concrets et variés, 3 à 6 acteurs, au plus 8 risques.`;
  const text = await askAI(system, SD.aiPayload(m), { maxTokens: 4000 });
  const mm = /\{[\s\S]*\}/.exec(String(text));
  if (!mm) throw new Error('Réponse IA non exploitable (JSON introuvable).');
  let j;
  try { j = JSON.parse(mm[0]); } catch (e) { throw new Error('Réponse IA invalide (JSON mal formé) : relancez la génération.'); }
  m.ai = { resume: String(j.resume || ''), acteurs: Array.isArray(j.acteurs) ? j.acteurs.slice(0, 8) : [], cas_usage: (Array.isArray(j.cas_usage) ? j.cas_usage : []).slice(0, 14).map((u, i) => ({ ...u, id: u.id || `UC${i + 1}`, actors: Array.isArray(u.actors) && u.actors.length ? u.actors : (u.acteur ? [u.acteur] : []) })), risques: Array.isArray(j.risques) ? j.risques.slice(0, 10).map(String) : [], recommandations: Array.isArray(j.recommandations) ? j.recommandations.slice(0, 10).map(String) : [] };
  const d = j.descriptions || {};
  [...m.flows, ...m.workflows, ...m.rules, ...m.actions, ...m.bpf, ...m.apps].forEach((a) => { if (!a.desc && d[a.name]) a.ai = String(d[a.name]); });
  return m.ai;
};

// ---------------------------------------------------------------------
// Onglet
// ---------------------------------------------------------------------
tabs.sdoc = async (root) => {
  const listBox = h('div'), out = h('div'), prog = progressLine();
  let sols = [], model = null;
  const checks = new Map();
  const title = h('input', { placeholder: 'Titre du document', style: 'width:360px' });
  const client = h('input', { placeholder: 'Client / projet (optionnel)', style: 'width:240px' });
  const author = h('input', { placeholder: 'Auteur (optionnel)', style: 'width:200px' });
  const useAi = h('input', { type: 'checkbox' });
  const allCols = h('input', { type: 'checkbox' });
  const secChecks = SolDocRender.sectionList.map(([k, lab]) => { const c = h('input', { type: 'checkbox', checked: true }); return [k, lab, c]; });
  try { const st = await chrome.storage.local.get('sdocPrefs'); const p = st.sdocPrefs || {}; if (p.author) author.value = p.author; if (p.client) client.value = p.client; } catch (e) { /* ignore */ }

  async function logo() {
    try { const r = await fetch(chrome.runtime.getURL('icons/icon48.png')); const b = new Uint8Array(await r.arrayBuffer()); let s = ''; b.forEach((x) => { s += String.fromCharCode(x); }); return 'data:image/png;base64,' + btoa(s); } catch (e) { return ''; }
  }
  const sections = () => secChecks.filter(([, , c]) => c.checked).map(([k]) => k);

  async function loadSolutions() {
    await guarded(listBox, async () => {
      sols = await rows('solutions?$select=solutionid,friendlyname,uniquename,version,ismanaged,modifiedon&$expand=publisherid($select=friendlyname)&$filter=isvisible eq true&$orderby=friendlyname');
      checks.clear();
      const filt = h('input', { type: 'search', placeholder: 'Filtrer les solutions…', style: 'width:260px' });
      const tb = h('tbody');
      const draw = () => {
        const q_ = filt.value.toLowerCase();
        tb.replaceChildren(...sols.filter((s) => !q_ || `${s.friendlyname} ${s.uniquename}`.toLowerCase().includes(q_)).map((s) => {
          if (!checks.has(s.solutionid)) checks.set(s.solutionid, h('input', { type: 'checkbox' }));
          return h('tr', {}, h('td', {}, checks.get(s.solutionid)), h('td', {}, h('b', {}, s.friendlyname)), h('td', {}, s.uniquename), h('td', {}, s.version), h('td', {}, s.ismanaged ? 'gérée' : 'non gérée'), h('td', {}, (s.publisherid && s.publisherid.friendlyname) || ''), h('td', {}, new Date(s.modifiedon).toLocaleDateString('fr-FR')));
        }));
      };
      filt.oninput = draw; draw();
      return h('div', {},
        h('div', { class: 'toolbar' }, filt, h('button', { onclick: () => { checks.forEach((c) => { c.checked = false; }); } }, 'Tout décocher'), h('button', { onclick: () => { sols.filter((s) => !s.ismanaged).forEach((s) => { if (checks.has(s.solutionid)) checks.get(s.solutionid).checked = true; }); } }, 'Cocher les non gérées')),
        h('div', { class: 'scroll', style: 'max-height:340px' }, h('table', {}, h('thead', {}, h('tr', {}, ['', 'Solution', 'Nom unique', 'Version', 'Type', 'Éditeur', 'Modifiée'].map((c) => h('th', {}, c)))), tb)));
    });
  }

  function showResult() {
    const m = model;
    const SR = SolDocRender;
    const opts = () => ({ sections: sections(), allColumns: allCols.checked, logo: m._logo });
    const base = () => `documentation-${(m.meta.solutions[0] ? m.meta.solutions[0].unique : 'solution')}-${stamp()}`;
    const layerKpis = SR.LAYERS.map((L) => ({ L, n: L.types.reduce((s, [k]) => s + SR.count(m, k), 0) })).filter((x) => x.n);
    out.replaceChildren(
      h('h2', {}, `Documentation prête : ${m.total} composant(s)`),
      m.warnings.length ? h('p', { class: 'alert' }, 'Collecte partielle : ' + m.warnings.slice(0, 6).join(' · ')) : null,
      h('div', { class: 'kpis' }, layerKpis.map(({ L, n }) => kpi(`${L.icon} ${L.label}`, String(n)))),
      h('div', { class: 'toolbar' },
        h('button', { class: 'primary', onclick: () => saveBlob(base() + '.html', new Blob([SR.html(m, opts())], { type: 'text/html;charset=utf-8' })) }, '⬇ HTML (design complet)'),
        h('button', { onclick: () => saveBlob(base() + '.docx', Office.docx(SR.docxBlocks(m, opts()), { landscape: true })) }, 'Word (.docx)'),
        h('button', { onclick: () => saveBlob(base() + '.md', new Blob([SR.markdown(m, opts())], { type: 'text/markdown;charset=utf-8' })) }, 'Markdown + Mermaid'),
        h('button', { onclick: () => saveBlob(base() + '.xlsx', Office.xlsx(SR.xlsxSheets(m))) }, 'Excel (inventaire)'),
        h('button', { onclick: () => saveBlob(base() + '.json', new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' })) }, 'JSON')),
      !m.ai ? h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: async () => { prog.set('L\'IA rédige…'); try { await SD.aiEnrich(m, (t) => prog.set(t)); prog.set('✓ Cas d\'utilisation IA ajoutés.'); showResult(); } catch (e) { prog.set(''); toast(e.message, true); } } }, '✨ Générer résumé et cas d\'utilisation avec l\'IA'), h('span', { class: 'muted' }, 'Envoie les noms et descriptions des composants (jamais de données d\'enregistrements).')) : null,
      h('p', { class: 'muted' }, 'Le fichier HTML téléchargé est interactif (sommaire, filtres, thème sombre). Pour un PDF : ouvrez-le dans Chrome puis utilisez « PDF / Imprimer ».'));
  }

  async function generate() {
    const ids = [...checks.entries()].filter(([, c]) => c.checked).map(([id]) => id);
    if (!ids.length) { toast('Cochez au moins une solution.', true); return; }
    if (!sections().length) { toast('Cochez au moins une section.', true); return; }
    try { await chrome.storage.local.set({ sdocPrefs: { author: author.value, client: client.value } }); } catch (e) { /* ignore */ }
    const first = sols.find((s) => s.solutionid === ids[0]);
    const opts = { title: title.value.trim() || `Documentation — ${ids.length > 1 ? `${ids.length} solutions` : first.friendlyname}`, client: client.value.trim(), author: author.value.trim(), allColumns: allCols.checked };
    out.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Collecte en cours…'), prog);
    try {
      model = await SD.collect(ids, opts, (t) => prog.set(t));
      model._logo = await logo();
      if (useAi.checked) { try { await SD.aiEnrich(model, (t) => prog.set(t)); } catch (e) { toast('IA : ' + e.message, true); } }
      showResult();
    } catch (e) { out.replaceChildren(h('p', { class: 'error' }, e.message)); }
  }

  root.append(
    h('p', { class: 'muted' }, 'Choisissez une ou plusieurs solutions : Xrmkit récupère tous leurs composants (tables, colonnes, relations, flux, règles, plug-ins, scripts, formulaires, vues, applications, rôles, variables, connexions…), puis produit une documentation illustrée avec architecture, diagramme entité-relation, cas d\'utilisation et points d\'attention. Lecture seule : rien n\'est modifié.'),
    h('h2', {}, '1. Solutions à documenter'), listBox,
    h('h2', {}, '2. Contenu'),
    h('div', { class: 'toolbar' }, title, client, author),
    h('div', { class: 'toolbar' }, ...secChecks.map(([, lab, c]) => h('label', { class: 'inline' }, c, lab))),
    h('div', { class: 'toolbar' }, h('label', { class: 'inline' }, allCols, 'Lister toutes les colonnes (sinon : personnalisées et obligatoires)'), h('label', { class: 'inline' }, useAi, '✨ Cas d\'utilisation et résumé rédigés par l\'IA (envoie noms et descriptions des composants)')),
    h('h2', {}, '3. Générer'),
    h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: generate }, '📘 Collecter et générer la documentation')),
    out);
  loadSolutions();
};
