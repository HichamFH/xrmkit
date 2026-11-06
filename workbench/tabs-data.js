'use strict';
// Onglet « Jeux de données & import » (v0.2) : données de test, import CSV, modification en masse.
// Toutes les écritures demandent une confirmation nommant l'environnement.

Object.assign(TITLES, { data: 'Données de test & import' });

const TEST_SETS = { account: ['accounts', 'accountid', 'Comptes'], contact: ['contacts', 'contactid', 'Contacts'], lead: ['leads', 'leadid', 'Prospects'] };

tabs.data = async (root) => {
  const tag = DK.TAG;

  // ------------------------------------------------ jeux de données de test
  const kind = h('select', {}, Object.entries(TEST_SETS).map(([k, v]) => h('option', { value: k }, v[2])));
  const count = h('input', { type: 'number', value: '10', min: '1', max: '200', style: 'width:80px' });
  const link = h('input', { type: 'checkbox', checked: true });
  const genOut = h('div');

  const report = (label_, res, items) => {
    const failed = res.map((r, i) => (r.ok ? null : { Ligne: i + 1, Erreur: r.e.message })).filter(Boolean);
    return h('div', {}, h('p', { class: failed.length ? 'error' : 'ok' }, `${label_} : ${res.length - failed.length}/${items.length} réussi(s).`),
      failed.length ? dataTable(failed, { exportName: 'erreurs' }) : null);
  };

  const generate = () => guarded(genOut, async () => {
    const k = kind.value, [set] = TEST_SETS[k];
    const n = Math.max(1, Math.min(200, Number(count.value) || 0));
    if (!(await confirmBox(`Créer ${n} enregistrement(s) de test « ${TEST_SETS[k][2]} » dans ${orgName()} ?\nIls sont repérables par la description « ${tag} ».`, { confirmText: `Créer ${n}` }))) throw new Error('Annulé.');
    let parents = [];
    if (k === 'contact' && link.checked) parents = (await rows(`accounts?$select=accountid&$filter=description eq '${tag}'&$top=200`)).map((a) => a.accountid);
    const items = Array.from({ length: n }, (_, i) => {
      const body = DK.fake(k, i);
      if (parents.length) body['parentcustomerid_account@odata.bind'] = `/accounts(${parents[Math.floor(Math.random() * parents.length)]})`;
      return body;
    });
    const prog = progressLine();
    genOut.replaceChildren(prog);
    const res = await pool(items, 3, (b) => q(set, { method: 'POST', body: b }), (d, t) => prog.set(`${d}/${t}…`));
    return report('Création', res, items);
  });

  const cleanup = () => guarded(genOut, async () => {
    const found = [];
    for (const k of ['contact', 'lead', 'account']) {
      const [set, pk, name] = TEST_SETS[k];
      const r = await rows(`${set}?$select=${pk}&$filter=description eq '${tag}'&$top=5000`);
      if (r.length) found.push({ set, pk, name, ids: r.map((x) => x[pk]) });
    }
    const total = found.reduce((n, x) => n + x.ids.length, 0);
    if (!total) return h('p', { class: 'muted' }, 'Aucun enregistrement de test à supprimer.');
    const typed = await promptBox(`${total} enregistrement(s) de test (${found.map((x) => `${x.ids.length} ${x.name.toLowerCase()}`).join(', ')}) seront SUPPRIMÉS DÉFINITIVEMENT dans ${orgName()}.`, { title: 'Suppression définitive', danger: true, expect: String(total), confirmText: `Supprimer ${total}` });
    if (typed !== String(total)) throw new Error('Suppression annulée.');
    const prog = progressLine();
    genOut.replaceChildren(prog);
    let ok = 0, ko = 0;
    for (const f of found) {
      const res = await pool(f.ids, 3, (id) => q(`${f.set}(${id})`, { method: 'DELETE' }), (d, t) => prog.set(`${f.name} ${d}/${t}…`));
      res.forEach((r) => { if (r.ok) ok++; else ko++; });
    }
    return h('p', { class: ko ? 'error' : 'ok' }, `${ok} supprimé(s), ${ko} en échec (références restantes ?).`);
  });

  // ------------------------------------------------------------ import CSV
  const csv = h('textarea', { class: 'code', rows: '8', spellcheck: 'false', placeholder: 'name;telephone1;parentaccountid@odata.bind\nAtlas SA;+33 2 40 00 00 00;accounts(00000000-0000-0000-0000-000000000000)' });
  const file = h('input', { type: 'file', accept: '.csv,.txt,text/csv' });
  file.addEventListener('change', async () => { if (file.files[0]) csv.value = await file.files[0].text(); });
  const iEtn = entityBox();
  const iMode = h('select', {}, h('option', { value: 'create' }, 'Créer'), h('option', { value: 'update' }, 'Mettre à jour (colonne id)'));
  const iOut = h('div');
  const cur = await currentRecord();
  if (cur) iEtn.value = cur.entity;

  async function prepare() {
    const e = iEtn.value.trim();
    if (!isName(e)) throw new Error('Nom de table invalide.');
    const p = DK.parseCsv(csv.value);
    if (!p.headers.length || !p.rows.length) throw new Error('CSV vide : la première ligne doit contenir les noms logiques des colonnes.');
    const ent = (await entityList()).find((x) => x.LogicalName === e);
    if (!ent) throw new Error('Table inconnue : ' + e);
    const attrMap = Object.fromEntries((await attributesOf(e)).map((a) => [a.LogicalName, a]));
    const items = p.rows.map((row, i) => {
      const r = DK.buildRecord(p.headers, row, attrMap, ent.PrimaryIdAttribute);
      if (iMode.value === 'update' && !r.id) r.errors.push('colonne id manquante ou vide');
      if (!Object.keys(r.body).length && !r.errors.length) r.errors.push('aucune valeur à écrire');
      return { n: i + 2, ...r };
    });
    return { e, set: ent.EntitySetName, items };
  }

  const dry = () => guarded(iOut, async () => {
    const pr = await prepare();
    const bad = pr.items.filter((x) => x.errors.length);
    return h('div', {}, h('p', { class: bad.length ? 'error' : 'ok' }, `${pr.items.length} ligne(s) : ${pr.items.length - bad.length} valide(s), ${bad.length} en erreur. Rien n'a été écrit.`),
      bad.length ? dataTable(bad.map((x) => ({ Ligne: x.n, Erreurs: x.errors.join(' ; ') })), { exportName: 'erreurs-import' }) : null,
      h('h2', {}, 'Aperçu des 10 premières lignes valides'),
      h('pre', {}, JSON.stringify(pr.items.filter((x) => !x.errors.length).slice(0, 10).map((x) => (x.id ? { id: x.id, ...x.body } : x.body)), null, 2)));
  });

  const runImport = () => guarded(iOut, async () => {
    const pr = await prepare();
    const ok = pr.items.filter((x) => !x.errors.length);
    const skipped = pr.items.length - ok.length;
    if (!ok.length) throw new Error('Aucune ligne valide à importer. Utilisez « Valider » pour voir les erreurs.');
    const verb = iMode.value === 'create' ? 'Créer' : 'Mettre à jour';
    if (!(await confirmBox(`${verb} ${ok.length} enregistrement(s) « ${pr.e} » dans ${orgName()} ?${skipped ? `\n${skipped} ligne(s) en erreur seront ignorées.` : ''}`, { confirmText: `${verb} ${ok.length}` }))) throw new Error('Annulé.');
    const prog = progressLine();
    iOut.replaceChildren(prog);
    const res = await pool(ok, 3, (it) => (iMode.value === 'create'
      ? q(pr.set, { method: 'POST', body: it.body })
      : q(`${pr.set}(${it.id})`, { method: 'PATCH', body: it.body, headers: { 'If-Match': '*' } })), (d, t) => prog.set(`${d}/${t}…`));
    const failed = res.map((r, i) => (r.ok ? null : { Ligne: ok[i].n, Erreur: r.e.message })).filter(Boolean);
    return h('div', {}, h('p', { class: failed.length ? 'error' : 'ok' }, `${res.length - failed.length}/${ok.length} ligne(s) importée(s)${skipped ? `, ${skipped} ignorée(s)` : ''}.`),
      failed.length ? dataTable(failed, { exportName: 'erreurs-import' }) : null);
  });

  // --------------------------------------------------- modification en masse
  const mEtn = entityBox();
  const mFilter = h('input', { placeholder: 'filtre OData obligatoire, ex. statecode eq 0 and address1_city eq \'Nantes\'', style: 'width:480px', spellcheck: 'false' });
  const mField = h('input', { placeholder: 'colonne (nom logique)', style: 'width:200px', spellcheck: 'false' });
  const mValue = h('input', { placeholder: 'nouvelle valeur (NULL pour vider)', style: 'width:240px' });
  const mOut = h('div');
  let plan = null;
  if (cur) mEtn.value = cur.entity;

  const mDry = () => guarded(mOut, async () => {
    const e = mEtn.value.trim(), f = mField.value.trim(), flt = mFilter.value.trim();
    if (!isName(e) || !isName(f)) throw new Error('Table et colonne doivent être des noms logiques valides.');
    if (!flt) throw new Error('Un filtre est obligatoire (aucune modification sans filtre).');
    const ent = (await entityList()).find((x) => x.LogicalName === e);
    if (!ent) throw new Error('Table inconnue : ' + e);
    const attr = (await attributesOf(e)).find((a) => a.LogicalName === f);
    if (!attr) throw new Error('Colonne inconnue : ' + f);
    if (['Lookup', 'Customer', 'Owner'].includes(attr.AttributeType)) throw new Error('Les colonnes de liaison ne sont pas gérées ici (utilisez l\'import CSV avec @odata.bind).');
    const value = DK.convertValue(attr.AttributeType, mValue.value);
    const res = await q(`${ent.EntitySetName}?$select=${ent.PrimaryIdAttribute}&$top=5000&$count=true&$filter=${encodeURIComponent(flt)}`);
    plan = { e, set: ent.EntitySetName, ids: res.value.map((r) => r[ent.PrimaryIdAttribute]), body: { [f]: value } };
    const n = plan.ids.length;
    if (!n) return h('p', { class: 'muted' }, 'Aucun enregistrement ne correspond au filtre.');
    return h('div', {}, h('p', { class: 'ok' }, `${n} enregistrement(s) seraient modifiés (limite 5000 par exécution) : ${f} = ${JSON.stringify(value)}. Rien n'a été écrit.`),
      h('pre', {}, plan.ids.slice(0, 10).join('\n') + (n > 10 ? `\n… +${n - 10}` : '')),
      h('div', { class: 'toolbar' }, h('button', { class: 'danger', onclick: mApply }, `Appliquer à ${n} enregistrement(s)`)));
  });

  const mApply = () => guarded(mOut, async () => {
    if (!plan) throw new Error('Lancez d\'abord la simulation.');
    const n = plan.ids.length;
    const typed = await promptBox(`Modifier ${n} enregistrement(s) « ${plan.e} » dans ${orgName()} : ${JSON.stringify(plan.body)}.`, { title: 'Modification en masse', danger: true, expect: String(n), confirmText: `Modifier ${n}` });
    if (typed !== String(n)) throw new Error('Modification annulée.');
    const prog = progressLine();
    mOut.replaceChildren(prog);
    const res = await pool(plan.ids, 3, (id) => q(`${plan.set}(${id})`, { method: 'PATCH', body: plan.body, headers: { 'If-Match': '*' } }), (d, t) => prog.set(`${d}/${t}…`));
    plan = null;
    return report('Modification', res, res);
  });

  root.append(
    h('div', { class: 'panel' }, h('b', {}, 'Attention : '), 'ces outils écrivent dans l\'environnement connecté. Utilisez-les sur un environnement de développement ou de test ; chaque action demande une confirmation nommant l\'environnement.'),
    h('h2', {}, 'Jeux de données de test'),
    h('p', { class: 'muted' }, `Crée des comptes, contacts ou prospects fictifs (français), repérables par la description « ${tag} », et permet de les supprimer.`),
    h('div', { class: 'toolbar' }, kind, 'Nombre', count, h('label', { class: 'inline' }, link, 'Rattacher les contacts aux comptes de test'),
      h('button', { class: 'primary', onclick: generate }, 'Créer'), h('button', { class: 'danger', onclick: cleanup }, 'Supprimer les données de test')),
    genOut,
    h('h2', {}, 'Import CSV'),
    h('p', { class: 'muted' }, 'Première ligne = noms logiques des colonnes (séparateur ; , ou tabulation détecté). Liaisons : colonne « nom_nav@odata.bind » avec une valeur « accounts(GUID) ». Mise à jour : colonne « id ». Décimaux « 12,5 », dates « 25/12/2024 » et booléens « oui/non » acceptés. Une valeur NULL vide la colonne.'),
    h('div', { class: 'toolbar' }, iEtn, iMode, file),
    csv,
    h('div', { class: 'toolbar' }, h('button', { onclick: dry }, 'Valider (simulation)'), h('button', { class: 'primary', onclick: runImport }, 'Importer')),
    iOut,
    h('h2', {}, 'Modification en masse'),
    h('p', { class: 'muted' }, 'Définit une colonne sur tous les enregistrements correspondant au filtre. Simulation d\'abord (comptage + aperçu), puis application avec confirmation par saisie du nombre d\'enregistrements.'),
    h('div', { class: 'toolbar' }, mEtn, mField, mValue), h('div', { class: 'toolbar' }, mFilter, h('button', { class: 'primary', onclick: mDry }, 'Simuler')),
    mOut);
};
