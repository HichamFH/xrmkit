'use strict';
// Onglets techniques (v0.2) : impact, étapes de plug-ins, tâches système, audit,
// inspecteur de formulaire, sécurité.

Object.assign(TITLES, {
  impact: 'Analyse d\'impact',
  steps: 'Étapes de plug-ins',
  async: 'Tâches système',
  audit: 'Journal d\'audit',
  inspect: 'Inspecteur de formulaire',
  security: 'Accès & rôles',
});

// =====================================================================
// Analyse d'impact (« utilisé où ? »)
// =====================================================================
const DEP_TYPES = {
  1: 'Table', 2: 'Colonne', 9: 'Option set global', 10: 'Relation', 14: 'Clé', 20: 'Rôle de sécurité', 24: 'Formulaire',
  26: 'Vue', 29: 'Processus / flow / règle', 59: 'Graphique', 60: 'Formulaire', 61: 'Web resource', 62: 'Plan de site',
  63: 'Profil de sécurité de champ', 65: 'Règle de routage', 66: 'Contrôle personnalisé', 80: 'Application pilotée par modèle',
  91: 'Assembly de plug-in', 92: 'Étape de plug-in', 300: 'Application canevas', 371: 'Connecteur', 372: 'Référence de connexion',
  380: 'Variable d\'environnement', 381: 'Valeur de variable d\'environnement',
};
const DEP_RESOLVE = {
  26: ['savedqueries', 'savedqueryid'], 60: ['systemforms', 'formid'], 29: ['workflows', 'workflowid'],
  92: ['sdkmessageprocessingsteps', 'sdkmessageprocessingstepid'], 59: ['savedqueryvisualizations', 'savedqueryvisualizationid'],
  61: ['webresourceset', 'webresourceid'], 66: ['customcontrols', 'customcontrolid'], 80: ['appmodules', 'appmoduleid'],
  91: ['pluginassemblies', 'pluginassemblyid'],
};
const WF_CATS = { 0: 'Workflow', 1: 'Dialogue', 2: 'Règle métier', 3: 'Action', 4: 'Processus métier (BPF)', 5: 'Flow cloud', 6: 'Flow de bureau' };

async function resolveDeps(deps) {
  const byType = new Map();
  deps.forEach((d) => {
    const t = d.dependentcomponenttype;
    if (!byType.has(t)) byType.set(t, new Set());
    byType.get(t).add(cleanGuid(d.dependentcomponentobjectid));
  });
  const names = new Map();
  for (const [t, ids] of byType) {
    const spec = DEP_RESOLVE[t];
    if (!spec) continue;
    const list = [...ids];
    for (let i = 0; i < list.length; i += 20) {
      const part = list.slice(i, i + 20);
      try {
        const r = await rows(`${spec[0]}?$select=name${t === 29 ? ',category' : ''}&$filter=${part.map((id) => `${spec[1]} eq ${id}`).join(' or ')}`);
        r.forEach((x) => names.set(`${t}:${cleanGuid(x[spec[1]])}`, x));
      } catch (e) { /* type non résolu : on affichera l'ID */ }
    }
  }
  return names;
}

tabs.impact = async (root) => {
  const etn = entityBox();
  const field = h('input', { placeholder: 'colonne (optionnel)', spellcheck: 'false', style: 'width:200px' });
  const inclManaged = h('input', { type: 'checkbox' });
  const prog = progressLine();
  const result = h('div');
  const cur = await currentRecord();
  if (cur) etn.value = cur.entity;

  async function run() {
    const e = etn.value.trim(), f = field.value.trim();
    if (!isName(e) || (f && !isName(f))) throw new Error('Saisissez des noms logiques valides.');
    const term = f || e;
    const re = termRegex(term);
    const out = [], warns = [];
    const add = (Source, Nom, Type, Détail) => out.push({ Source, Nom, Type, Détail });
    const snip = (txt) => {
      const m = re.exec(txt);
      if (!m) return '';
      return txt.slice(Math.max(0, m.index - 50), m.index + term.length + 50).replace(/\s+/g, ' ').trim();
    };
    const step = async (name, fn) => { prog.set(name + '…'); try { await fn(); } catch (err) { warns.push(`${name} : ${err.message}`); } };

    await step('Dépendances de solution', async () => {
      const url = f ? `EntityDefinitions(LogicalName='${e}')/Attributes(LogicalName='${f}')?$select=MetadataId` : `EntityDefinitions(LogicalName='${e}')?$select=MetadataId`;
      const mid = (await q(url)).data.MetadataId;
      const deps = await rows(`RetrieveDependentComponents(ObjectId=${mid},ComponentType=${f ? 2 : 1})`);
      const names = await resolveDeps(deps);
      deps.forEach((d) => {
        const t = d.dependentcomponenttype, id = cleanGuid(d.dependentcomponentobjectid);
        const x = names.get(`${t}:${id}`);
        add('Dépendance (solution)', x ? x.name : id, DEP_TYPES[t] || `Type ${t}`, x && x.category != null ? WF_CATS[x.category] || `catégorie ${x.category}` : '');
      });
    });

    await step('Vues', async () => {
      const r = await rows(`savedqueries?$select=name,returnedtypecode,fetchxml,layoutxml${f ? `&$filter=returnedtypecode eq '${e}'` : ''}`, { maxPages: 50, pageSize: 200 });
      r.forEach((v) => { const t = `${v.fetchxml || ''}\n${v.layoutxml || ''}`; if (re.test(t)) add('Vue', v.name, v.returnedtypecode, snip(t)); });
    });

    await step('Formulaires', async () => {
      const r = await rows(`systemforms?$select=name,objecttypecode,formxml&$filter=objecttypecode eq '${e}'`, { maxPages: 50, pageSize: 200 });
      r.forEach((fm) => {
        if (!f) add('Formulaire', fm.name, fm.objecttypecode, 'Formulaire de la table');
        else if (re.test(fm.formxml || '')) add('Formulaire', fm.name, fm.objecttypecode, snip(fm.formxml));
      });
    });

    await step('Étapes de plug-ins', async () => {
      const r = await rows('sdkmessageprocessingsteps?$select=name,filteringattributes,statecode,_sdkmessagefilterid_value&$filter=ishidden/Value eq false', { formatted: true, maxPages: 50, pageSize: 500 });
      r.forEach((s) => {
        const flt = FV(s, '_sdkmessagefilterid_value') || '';
        const hit = f ? re.test(s.filteringattributes || '') : re.test(`${s.name} ${flt}`);
        if (hit) add('Étape de plug-in', s.name, s.statecode === 0 ? 'activée' : 'désactivée', f ? `Attributs filtrés : ${s.filteringattributes}` : flt);
      });
    });

    await step('Flows cloud', async () => {
      const r = await rows('workflows?$select=name,category,statecode,clientdata&$filter=category eq 5', { maxPages: 50, pageSize: 200 });
      r.forEach((w) => { if (re.test(w.clientdata || '')) add('Flow cloud', w.name, `état ${w.statecode}`, snip(w.clientdata)); });
    });

    await step('Processus, règles métier, actions', async () => {
      const r = await rows('workflows?$select=name,category,statecode,xaml&$filter=type eq 1 and (category eq 0 or category eq 2 or category eq 3 or category eq 4)', { maxPages: 50, pageSize: 200 });
      r.forEach((w) => { if (re.test(w.xaml || '')) add(WF_CATS[w.category] || 'Processus', w.name, `état ${w.statecode}`, snip(w.xaml)); });
    });

    await step('Web resources (JS / HTML)', async () => {
      const hits = await scanWebResources(re, inclManaged.checked, (d, n) => prog.set(`Web resources (JS / HTML) : ${d}/${n}…`));
      hits.forEach((x) => add('Web resource', x.name, `${x.count} occurrence(s)`, `ligne ${x.line} : ${x.text}`));
      if (hits.skipped) warns.push(`Web resources : ${hits.skipped} sur ${hits.total} non lus (${hits.firstError ? hits.firstError.message : 'erreur'})`);
    });

    prog.set('');
    const counts = {};
    out.forEach((x) => { counts[x.Source] = (counts[x.Source] || 0) + 1; });
    return h('div', {},
      warns.length ? h('p', { class: 'error' }, 'Analyse partielle, certaines sources n\'ont pas pu être lues (droits, table absente ou délai) :\n' + warns.join('\n')) : null,
      h('p', {}, out.length ? Object.entries(counts).map(([k, v]) => `${k} : ${v}`).join(' · ') : 'Aucun usage trouvé.'),
      dataTable(out, { exportName: `impact-${term}`, empty: 'Aucun usage trouvé.' }));
  }

  root.append(
    h('p', { class: 'muted' }, 'Recherche les usages d\'une table ou d\'une colonne : dépendances de solution (formulaires, vues, flows, règles, étapes…) puis recherche texte dans les vues, formulaires, flows, workflows, règles métier et web resources. Les scripts JS non déclarés comme dépendances ne sont détectés que par la recherche texte.'),
    h('div', { class: 'toolbar' }, etn, field,
      h('label', { class: 'inline' }, inclManaged, 'Web resources gérés (lent)'),
      h('button', { class: 'primary', onclick: () => guarded(result, run) }, 'Analyser')),
    prog, result);
};

// =====================================================================
// Étapes de plug-ins (explorateur)
// =====================================================================
const STAGES = { 10: 'Pré-validation', 20: 'Pré-opération', 30: 'Principal', 40: 'Post-opération' };

tabs.steps = async (root) => {
  const sys = h('input', { type: 'checkbox', onchange: () => showAssemblies() });
  const crumbs = h('div', { class: 'crumbs' });
  const view = h('div');
  const detail = h('div');
  const nav = { asm: null, type: null };

  const stepSelect = '$select=name,stage,mode,rank,statecode,statuscode,filteringattributes,ismanaged,_sdkmessageid_value,_sdkmessagefilterid_value,_eventhandler_value';
  const stepRow = (x) => withRaw({
    Message: FV(x, '_sdkmessageid_value') || '', Cible: FV(x, '_sdkmessagefilterid_value') || '', 'Étape': x.name,
    Phase: STAGES[x.stage] || x.stage, Mode: x.mode === 0 ? 'Synchrone' : 'Asynchrone', Ordre: x.rank,
    'Attributs filtrés': x.filteringattributes || '', 'État': x.statecode === 0 ? 'Activée' : 'Désactivée', 'Gérée': x.ismanaged,
  }, x);

  function drawCrumbs() {
    const link = (txt, fn) => h('button', { class: 'crumb-link', onclick: fn }, txt);
    crumbs.replaceChildren(
      nav.asm ? link('Assemblies', showAssemblies) : h('span', { class: 'crumb-cur' }, 'Assemblies'),
      nav.asm ? h('span', { class: 'crumb-sep' }, '›') : null,
      nav.asm && !nav.type ? h('span', { class: 'crumb-cur' }, nav.asm.name) : null,
      nav.asm && nav.type ? link(nav.asm.name, () => showTypes(nav.asm)) : null,
      nav.type ? h('span', { class: 'crumb-sep' }, '›') : null,
      nav.type ? h('span', { class: 'crumb-cur' }, shortType(nav.type.typename)) : null);
  }
  const shortType = (t) => String(t || '').split('.').pop();

  // Niveau 1 : assemblies
  function showAssemblies() {
    nav.asm = null; nav.type = null; detail.replaceChildren(); drawCrumbs();
    guarded(view, async () => {
      const flt = sys.checked ? '' : '&$filter=ishidden/Value eq false and ismanaged eq false';
      const r = await rows(`pluginassemblies?$select=name,version,isolationmode,ismanaged,modifiedon,pluginassemblyid&$orderby=name${flt}`, { formatted: true, maxPages: 20, pageSize: 500 });
      const data = r.map((x) => withRaw({ Assembly: x.name, Version: x.version, Isolation: FV(x, 'isolationmode') || x.isolationmode, 'Gérée': x.ismanaged, 'Modifiée': x.modifiedon }, x));
      return h('div', {},
        h('p', { class: 'muted' }, `${data.length} assembly(ies). Cliquez sur une assembly pour voir ses plug-ins.`),
        dataTable(data, { exportName: 'assemblies', empty: 'Aucune assembly (cochez « système et gérées » pour les inclure).', onRow: (row) => showTypes(row._raw) }));
    });
  }

  // Niveau 2 : plug-ins (types) de l'assembly, avec nombre d'étapes
  function showTypes(asm) {
    nav.asm = asm; nav.type = null; detail.replaceChildren(); drawCrumbs();
    guarded(view, async () => {
      const types = await rows(`plugintypes?$select=typename,friendlyname,isworkflowactivity,plugintypeid&$filter=_pluginassemblyid_value eq ${asm.pluginassemblyid}&$orderby=typename`, { maxPages: 20, pageSize: 500 });
      const counts = new Map();
      for (let i = 0; i < types.length; i += 20) {
        const part = types.slice(i, i + 20);
        try {
          const st = await rows(`sdkmessageprocessingsteps?$select=statecode,_eventhandler_value&$filter=${part.map((t) => `_eventhandler_value eq ${t.plugintypeid}`).join(' or ')}`, { maxPages: 10, pageSize: 500 });
          st.forEach((x) => { const c = counts.get(x._eventhandler_value) || { on: 0, off: 0 }; if (x.statecode === 0) c.on++; else c.off++; counts.set(x._eventhandler_value, c); });
        } catch (e) { /* décompte indisponible */ }
      }
      const data = types.map((t) => {
        const c = counts.get(t.plugintypeid) || { on: 0, off: 0 };
        return withRaw({ 'Plug-in': shortType(t.typename), 'Nom complet': t.typename, Genre: t.isworkflowactivity ? 'Activité de workflow' : 'Plug-in', 'Étapes actives': c.on, 'Étapes désactivées': c.off }, t);
      });
      return h('div', {},
        h('p', { class: 'muted' }, `${data.length} plug-in(s) dans ${asm.name}. Cliquez sur un plug-in pour voir ses étapes.`),
        dataTable(data, { exportName: `plugins-${asm.name}`, empty: 'Aucun plug-in dans cette assembly.', onRow: (row) => showSteps(asm, row._raw) }));
    });
  }

  // Niveau 3 : étapes du plug-in
  function showSteps(asm, type) {
    nav.asm = asm; nav.type = type; detail.replaceChildren(); drawCrumbs();
    guarded(view, async () => {
      const r = await rows(`sdkmessageprocessingsteps?${stepSelect}&$filter=_eventhandler_value eq ${type.plugintypeid}`, { formatted: true, maxPages: 10, pageSize: 500 });
      const data = r.map(stepRow);
      data.sort((a, b) => String(a.Cible).localeCompare(String(b.Cible)) || a._raw.stage - b._raw.stage || a._raw.rank - b._raw.rank);
      return h('div', {},
        h('p', { class: 'muted' }, `${data.length} étape(s) pour ${shortType(type.typename)}. Cliquez sur une ligne pour activer ou désactiver l'étape (impossible sur une solution gérée verrouillée).`),
        dataTable(data, { exportName: `etapes-${shortType(type.typename)}`, empty: 'Aucune étape enregistrée pour ce plug-in.', onRow: showDetail }));
    });
  }

  function showDetail(row) {
    const x = row._raw, enabled = x.statecode === 0;
    const msg = h('div');
    detail.replaceChildren(h('div', { class: 'card step-detail' },
      h('h2', {}, x.name),
      kvTable({ Message: row.Message, Cible: row.Cible, Phase: row.Phase, Mode: row.Mode, Ordre: row.Ordre, 'Attributs filtrés': row['Attributs filtrés'] || '(tous)', 'État': row['État'], 'Gérée': row['Gérée'], ID: x.sdkmessageprocessingstepid }),
      h('div', { class: 'toolbar' }, h('button', {
        class: enabled ? 'danger' : 'primary',
        onclick: async () => {
          if (!(await confirmBox(`${enabled ? 'Désactiver' : 'Activer'} l'étape « ${x.name} » sur ${orgName()} ?`, { confirmText: enabled ? 'Désactiver' : 'Activer', danger: enabled }))) return;
          try {
            await q(`sdkmessageprocessingsteps(${x.sdkmessageprocessingstepid})`, { method: 'PATCH', body: { statecode: enabled ? 1 : 0, statuscode: enabled ? 2 : 1 } });
            toast(`✓ Étape ${enabled ? 'désactivée' : 'activée'}.`);
            if (nav.type) showSteps(nav.asm, nav.type);
          } catch (err) { msg.replaceChildren(h('p', { class: 'error' }, err.message)); }
        },
      }, enabled ? 'Désactiver l\'étape' : 'Activer l\'étape')), msg));
    if (detail.scrollIntoView) detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  root.append(
    h('div', { class: 'toolbar' },
      h('label', { class: 'inline' }, sys, 'Inclure les assemblies système et gérées'),
      h('button', { class: 'primary', onclick: showAssemblies }, 'Recharger')),
    crumbs, view, detail);
  showAssemblies();
};

// =====================================================================
// Tâches système (asyncoperations)
// =====================================================================
tabs.async = async (root) => {
  const sel = h('select', {},
    h('option', { value: 'failed' }, 'Échecs'), h('option', { value: 'waiting' }, 'En attente'),
    h('option', { value: 'running' }, 'En cours'), h('option', { value: 'paused' }, 'Suspendues'), h('option', { value: 'all' }, 'Toutes'));
  const hours = h('input', { type: 'number', value: '24', min: '0', style: 'width:70px', title: '0 = pas de limite' });
  const top = h('input', { type: 'number', value: '100', min: '1', max: '500', style: 'width:70px' });
  const cards = h('div'), result = h('div'), detail = h('div');
  const FILTERS = { failed: 'statuscode eq 31', waiting: '(statuscode eq 0 or statuscode eq 10)', running: 'statuscode eq 20', paused: 'statecode eq 1', all: '' };

  const summary = async () => {
    try {
      const r = await call('fetchxml', {
        fetchXml: '<fetch aggregate="true"><entity name="asyncoperation"><attribute name="statuscode" groupby="true" alias="s"/><attribute name="asyncoperationid" aggregate="count" alias="n"/><filter><condition attribute="createdon" operator="last-x-hours" value="24"/></filter></entity></fetch>',
        callerId: state.callerId, formatted: true,
      });
      cards.replaceChildren(h('p', { class: 'muted' }, 'Dernières 24 h : ' + r.value.map((x) => `${FV(x, 's') || x.s} : ${x.n}`).join(' · ')));
    } catch (e) { cards.replaceChildren(); }
  };

  const load = () => guarded(result, async () => {
    summary();
    const f = [];
    if (FILTERS[sel.value]) f.push(FILTERS[sel.value]);
    if (Number(hours.value) > 0) f.push(`createdon ge ${new Date(Date.now() - Number(hours.value) * 3600e3).toISOString()}`);
    const r = await rows(`asyncoperations?$select=name,operationtype,statecode,statuscode,message,createdon,completedon,errorcode,_regardingobjectid_value&$orderby=createdon desc&$top=${Number(top.value) || 100}${f.length ? `&$filter=${f.join(' and ')}` : ''}`, { formatted: true });
    detail.replaceChildren();
    return dataTable(r.map((x) => withRaw({
      Créée: x.createdon, Nom: x.name, Type: FV(x, 'operationtype') || x.operationtype, Statut: FV(x, 'statuscode') || x.statuscode,
      'Concerne': FV(x, '_regardingobjectid_value') || '', 'Code erreur': x.errorcode, Message: (x.message || '').slice(0, 160),
    }, x)), {
      exportName: 'taches-systeme', empty: 'Aucune tâche pour ce filtre.',
      onRow: (row) => {
        const x = row._raw, msg = h('div');
        detail.replaceChildren(h('h2', {}, x.name), h('pre', {}, x.message || '(pas de message)'),
          h('div', { class: 'toolbar' }, h('button', {
            onclick: async () => {
              if (!(await confirmBox(`Remettre la tâche « ${x.name} » en file d'attente sur ${orgName()} ?`, { confirmText: 'Relancer' }))) return;
              try {
                await q(`asyncoperations(${x.asyncoperationid})`, { method: 'PATCH', body: { statecode: 0, statuscode: 10 } });
                toast('✓ Tâche remise en attente (statut « Waiting »).');
              } catch (err) { msg.replaceChildren(h('p', { class: 'error' }, err.message)); }
            },
          }, 'Relancer (remettre en attente)')), msg);
      },
    });
  });

  root.append(
    h('div', { class: 'toolbar' }, sel, 'Dernières (h)', hours, 'Top', top, h('button', { class: 'primary', onclick: load }, 'Charger')),
    cards, result, detail);
  load();
};

// =====================================================================
// Journal d'audit d'un enregistrement
// =====================================================================
tabs.audit = async (root) => {
  const etn = entityBox();
  const id = h('input', { placeholder: 'GUID de l\'enregistrement', style: 'width:330px', spellcheck: 'false' });
  const result = h('div');
  const cur = await currentRecord();
  if (cur) { etn.value = cur.entity; id.value = cur.id || ''; }

  const run = () => guarded(result, async () => {
    const e = etn.value.trim(), gid = cleanGuid(id.value);
    if (!isName(e) || !isGuid(gid)) throw new Error('Renseignez une table et un GUID valides.');
    const set = await entitySetOf(e);
    const target = encodeURIComponent(JSON.stringify({ '@odata.id': `${set}(${gid})` }));
    let list = [];
    try {
      const res = await q(`RetrieveRecordChangeHistory(Target=@p1)?@p1=${target}`, { formatted: true });
      const d = res.data || {};
      list = (d.AuditDetailCollection || d).AuditDetails || [];
    } catch (err) {
      const aud = await rows(`audits?$select=createdon,operation,action,attributemask,_userid_value&$filter=_objectid_value eq ${gid}&$orderby=createdon desc&$top=200`, { formatted: true });
      return h('div', {}, h('p', { class: 'muted' }, `Historique détaillé indisponible (${err.message}). Liste brute :`),
        dataTable(aud.map(flatten), { exportName: 'audit', empty: 'Aucun historique.' }));
    }
    const out = [];
    list.forEach((det) => {
      const rec = det.AuditRecord || {};
      const base = {
        Date: rec.createdon, Utilisateur: FV(rec, '_userid_value') || rec._userid_value || '',
        'Opération': FV(rec, 'operation') || rec.operation, Action: FV(rec, 'action') || rec.action,
      };
      const o = flatten(det.OldValue || {}), n = flatten(det.NewValue || {});
      const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !/^@|odata|entityimage_/.test(k));
      if (!keys.length) out.push({ ...base, Champ: '(opération)', Avant: '', 'Après': '' });
      keys.forEach((k) => out.push({ ...base, Champ: k, Avant: o[k] ?? '', 'Après': n[k] ?? '' }));
    });
    return dataTable(out, { exportName: `audit-${e}-${gid.slice(0, 8)}`, empty: 'Aucun historique : l\'audit n\'est pas activé (organisation, table ou colonne) ou aucun changement enregistré.' });
  });

  root.append(
    h('p', { class: 'muted' }, 'Historique des modifications avec valeurs avant/après (audit Dataverse). L\'enregistrement ouvert dans l\'onglet Dynamics est prérempli.'),
    h('div', { class: 'toolbar' }, etn, id, h('button', { class: 'primary', onclick: run }, 'Charger l\'historique')), result);
  if (cur && cur.id) run();
};

// =====================================================================
// Inspecteur de formulaire
// =====================================================================
tabs.inspect = async (root) => {
  const fieldsBox = h('div'), scriptsBox = h('div'), netBox = h('div'), errBox = h('div'), wrBox = h('div');
  const term = h('input', { placeholder: 'texte à chercher (ex. nom de colonne, fonction)', style: 'width:300px' });
  const inclManaged = h('input', { type: 'checkbox' });
  const slow = h('input', { type: 'number', value: '0', min: '0', style: 'width:80px', title: 'Durée minimale (ms)' });

  const fields = () => guarded(fieldsBox, async () => {
    const r = await call('formFields');
    return dataTable(r.map((x) => ({ Champ: x.champ, 'Libellé': x.libelle, Type: x.type, Requis: x.requis, Soumission: x.soumission, 'Modifié': x.modifie, Valeur: x.valeur, Visible: x.visible, 'Désactivé': x.desactive, Contrôles: x.controles })), { exportName: 'champs-formulaire' });
  });

  const scripts = () => guarded(scriptsBox, async () => {
    const info = await call('recordInfo');
    if (!info.formId) throw new Error('Formulaire courant introuvable (ouvrez un formulaire de table).');
    const f = (await q(`systemforms(${info.formId})?$select=name,formxml`)).data;
    const doc = new DOMParser().parseFromString(f.formxml, 'text/xml');
    const libs = [...doc.querySelectorAll('formLibraries > Library')].map((l) => l.getAttribute('name'));
    const out = [];
    doc.querySelectorAll('event').forEach((ev) => {
      ev.querySelectorAll('Handler').forEach((hd) => {
        out.push({
          'Événement': ev.getAttribute('name'), Cible: ev.getAttribute('attribute') || ev.getAttribute('control') || '(formulaire)',
          'Bibliothèque': hd.getAttribute('libraryName'), Fonction: hd.getAttribute('functionName'),
          Actif: hd.getAttribute('enabled'), 'Contexte passé': hd.getAttribute('passExecutionContext'), 'Paramètres': hd.getAttribute('parameters') || '',
        });
      });
    });
    const used = new Set(out.map((x) => x['Bibliothèque']));
    return h('div', {},
      h('h2', {}, `${f.name} — ${out.length} gestionnaire(s), ${libs.length} bibliothèque(s)`),
      libs.some((l) => !used.has(l)) ? h('p', { class: 'muted' }, 'Bibliothèques chargées sans gestionnaire : ' + libs.filter((l) => !used.has(l)).join(', ')) : null,
      dataTable(out, { exportName: 'gestionnaires-formulaire', empty: 'Aucun gestionnaire d\'événement sur ce formulaire.' }),
      h('div', { class: 'toolbar' }, h('button', { onclick: () => download(`formxml-${info.entity}.xml`, f.formxml, 'application/xml') }, 'Télécharger le FormXML')));
  });

  const net = () => guarded(netBox, async () => {
    const r = await call('networkLog');
    const min = Number(slow.value) || 0;
    const data = r.filter((x) => x.duree >= min).sort((a, b) => b.duree - a.duree);
    const totalMs = r.reduce((n, x) => n + x.duree, 0);
    return h('div', {}, h('p', { class: 'muted' }, `${r.length} appel(s) API depuis le chargement de la page, cumul ${totalMs} ms.`),
      dataTable(data.map((x) => ({ 'Durée (ms)': x.duree, 'Début (ms)': x.debut, 'Taille (o)': x.taille, Statut: x.statut, URL: x.url })), { exportName: 'appels-api', empty: 'Aucun appel API mesuré.' }));
  });

  const errs = () => guarded(errBox, async () => {
    const r = await call('recentErrors');
    return dataTable(r.map((x) => ({ Date: x.date, Message: x.message })), { exportName: 'erreurs-js', empty: 'Aucune erreur JS capturée depuis le chargement de l\'extension.' });
  });

  const wr = () => guarded(wrBox, async () => {
    const t = term.value.trim();
    if (!t) throw new Error('Saisissez un texte à chercher.');
    const hits = await scanWebResources(termRegex(t), inclManaged.checked, (d, n) => { const el = wrBox.querySelector('.loading'); if (el) el.lastChild.textContent = `Lecture des web resources : ${d}/${n}…`; });
    const note = hits.skipped ? h('p', { class: 'error' }, `${hits.skipped} web resource(s) sur ${hits.total} non lue(s) : ${hits.firstError ? hits.firstError.message : 'erreur'}`) : null;
    return h('div', {}, note, dataTable(hits.map((x) => ({ 'Web resource': x.name, Occurrences: x.count, Ligne: x.line, Extrait: x.text })), { exportName: 'recherche-webresources', empty: 'Aucune occurrence.' }));
  });

  root.append(
    h('p', { class: 'muted' }, 'À utiliser avec un formulaire ouvert dans l\'onglet Dynamics.'),
    h('h2', {}, 'Champs du formulaire'), h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: fields }, 'Lister les champs')), fieldsBox,
    h('h2', {}, 'Scripts et événements (FormXML)'), h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: scripts }, 'Analyser le formulaire')), scriptsBox,
    h('h2', {}, 'Appels Web API de la page'), h('div', { class: 'toolbar' }, 'Durée min. (ms)', slow, h('button', { class: 'primary', onclick: net }, 'Afficher')), netBox,
    h('h2', {}, 'Erreurs JavaScript récentes'), h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: errs }, 'Afficher')), errBox,
    h('h2', {}, 'Recherche dans les web resources'), h('div', { class: 'toolbar' }, term, h('label', { class: 'inline' }, inclManaged, 'Gérés (lent)'), h('button', { class: 'primary', onclick: wr }, 'Chercher')), wrBox);
};

// =====================================================================
// Accès & rôles : « pourquoi cet accès ? » + diff de rôles
// =====================================================================
tabs.security = async (root) => {
  let picked = null;
  const who = h('p', { class: 'muted' }, 'Aucun utilisateur sélectionné.');
  const etn = entityBox();
  const rid = h('input', { placeholder: 'GUID de l\'enregistrement', style: 'width:330px', spellcheck: 'false' });
  const accessOut = h('div');
  const cur = await currentRecord();
  if (cur) { etn.value = cur.entity; rid.value = cur.id || ''; }

  const analyse = () => guarded(accessOut, async () => {
    if (!picked) throw new Error('Choisissez d\'abord un utilisateur.');
    const e = etn.value.trim(), gid = cleanGuid(rid.value);
    if (!isName(e) || !isGuid(gid)) throw new Error('Renseignez une table et un GUID valides.');
    const set = await entitySetOf(e);
    const uid = picked.id;
    const user = (await q(`systemusers(${uid})?$select=fullname,isdisabled&$expand=businessunitid($select=name)`)).data;
    const direct = await rows(`systemusers(${uid})/systemuserroles_association?$select=name`);
    const teams = await rows(`systemusers(${uid})/teammembership_association?$select=name,teamid`);
    const teamRoles = [];
    for (const t of teams) {
      try { (await rows(`teams(${t.teamid})/teamroles_association?$select=name`)).forEach((r) => teamRoles.push({ Source: `Équipe : ${t.name}`, 'Rôle': r.name })); } catch (e2) { /* équipe sans accès */ }
    }
    let rights = null, rightsErr = null;
    const tgt = encodeURIComponent(JSON.stringify({ '@odata.id': `${set}(${gid})` }));
    const attempts = [
      `systemusers(${uid})/Microsoft.Dynamics.CRM.RetrievePrincipalAccess(Target=@p1)?@p1=${tgt}`,
      `RetrievePrincipalAccess(Target=@p1,Principal=@p2)?@p1=${tgt}&@p2=${encodeURIComponent(JSON.stringify({ '@odata.id': `systemusers(${uid})` }))}`,
    ];
    for (const p of attempts) {
      try { rights = (await q(p)).data.AccessRights; break; } catch (err) { rightsErr = err.message; }
    }
    let owner = null;
    try { owner = (await q(`${set}(${gid})?$select=_ownerid_value,_owningbusinessunit_value`, { formatted: true })).data; } catch (err) { /* table sans propriétaire */ }
    const ownerName = owner && (FV(owner, '_ownerid_value') || owner._ownerid_value);
    const ownerBu = owner && (FV(owner, '_owningbusinessunit_value') || owner._owningbusinessunit_value);
    const userBu = user.businessunitid && user.businessunitid.name;
    const list = rights ? String(rights).split(/,\s*/).filter((x) => x && x !== 'None') : [];

    const verdict = [];
    if (user.isdisabled) verdict.push('Le compte est désactivé.');
    if (owner && owner._ownerid_value && cleanGuid(owner._ownerid_value) === cleanGuid(uid)) verdict.push('L\'utilisateur est propriétaire de l\'enregistrement.');
    if (list.length) verdict.push(`Droits effectifs : ${list.join(', ')}.`);
    else if (rights !== null) {
      verdict.push('Aucun droit effectif sur cet enregistrement.');
      verdict.push('Pistes : privilège de lecture absent ou de profondeur insuffisante dans les rôles ; unité commerciale différente'
        + (ownerBu && userBu && ownerBu !== userBu ? ` (enregistrement : ${ownerBu}, utilisateur : ${userBu})` : '') + ' ; enregistrement non partagé ni détenu par une équipe de l\'utilisateur.');
    } else verdict.push(`Calcul des droits indisponible : ${rightsErr}`);

    return h('div', {},
      h('h2', {}, `${user.fullname} → ${e} ${gid.slice(0, 8)}…`),
      h('div', { class: 'panel' }, verdict.map((v) => h('div', {}, v))),
      kvTable({ 'Unité commerciale de l\'utilisateur': userBu || '', 'Propriétaire de l\'enregistrement': ownerName || '(n/a)', 'Unité commerciale de l\'enregistrement': ownerBu || '(n/a)', 'Équipes de l\'utilisateur': teams.map((t) => t.name).join(', ') || '(aucune)' }),
      h('h2', {}, 'Rôles de l\'utilisateur'),
      dataTable([...direct.map((r) => ({ Source: 'Direct', 'Rôle': r.name })), ...teamRoles], { exportName: 'roles-utilisateur', empty: 'Aucun rôle.' }));
  });

  // --- diff de rôles ---
  const selA = h('select'), selB = h('select');
  const diffOut = h('div');
  let roleList = [];
  const rolePrivs = async (id) => ((await q(`RetrieveRolePrivilegesRole(RoleId=${id})`)).data.RolePrivileges || []);
  const diff = () => guarded(diffOut, async () => {
    if (!selA.value || !selB.value) throw new Error('Choisissez deux rôles.');
    const [pa, pb] = await Promise.all([rolePrivs(selA.value), rolePrivs(selB.value)]);
    let names = null;
    const norm = async (arr) => {
      if (arr.length && !arr[0].PrivilegeName) {
        if (!names) names = new Map((await rows('privileges?$select=name,privilegeid', { maxPages: 20 })).map((p) => [cleanGuid(p.privilegeid), p.name]));
        return arr.map((p) => ({ name: names.get(cleanGuid(p.PrivilegeId)) || p.PrivilegeId, depth: p.Depth }));
      }
      return arr.map((p) => ({ name: p.PrivilegeName, depth: p.Depth }));
    };
    const [na, nb] = [await norm(pa), await norm(pb)];
    const d = DK.diffPrivileges(na, nb);
    return h('div', {}, h('p', { class: 'muted' }, `A : ${selA.selectedOptions[0].text} (${na.length} privilèges) — B : ${selB.selectedOptions[0].text} (${nb.length} privilèges) — ${d.length} différence(s).`),
      dataTable(d, { exportName: 'diff-roles', empty: 'Les deux rôles ont exactement les mêmes privilèges et profondeurs.' }));
  });

  root.append(
    h('h2', {}, 'Pourquoi cet accès ?'),
    h('p', { class: 'muted' }, 'Calcule les droits effectifs d\'un utilisateur sur un enregistrement (RetrievePrincipalAccess) et affiche ses rôles directs et via équipes.'),
    userPicker((u) => { picked = u; who.textContent = `Utilisateur sélectionné : ${u.name}`; }), who,
    h('div', { class: 'toolbar' }, etn, rid, h('button', { class: 'primary', onclick: analyse }, 'Analyser l\'accès')), accessOut,
    h('h2', {}, 'Comparer deux rôles de sécurité'),
    h('div', { class: 'toolbar' }, 'A', selA, 'B', selB, h('button', { class: 'primary', onclick: diff }, 'Comparer')), diffOut);

  try {
    roleList = await rows('roles?$select=name,roleid&$expand=businessunitid($select=name)&$orderby=name');
    [selA, selB].forEach((s) => s.append(h('option', { value: '' }, '— choisir —'), ...roleList.map((r) => h('option', { value: r.roleid }, `${r.name}${r.businessunitid ? ' (' + r.businessunitid.name + ')' : ''}`))));
  } catch (e) { diffOut.append(h('p', { class: 'error' }, 'Liste des rôles indisponible : ' + e.message)); }
};
