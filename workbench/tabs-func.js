'use strict';
// Onglets fonctionnels (v0.2) : dictionnaire de données.

Object.assign(TITLES, {
  doc: 'Dictionnaire de données',
});

const parseNames = (txt) => [...new Set(String(txt).split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];

// =====================================================================
// Dictionnaire de données (Excel / Word)
// =====================================================================
tabs.doc = async (root) => {
  const list = h('textarea', { rows: '3', placeholder: 'account, contact, new_matable …', spellcheck: 'false' });
  const optChk = h('input', { type: 'checkbox', checked: true });
  const relChk = h('input', { type: 'checkbox', checked: true });
  const prog = progressLine();
  const out = h('div');
  const cur = await currentRecord();
  if (cur) list.value = cur.entity;

  async function collect() {
    const names = parseNames(list.value);
    if (!names.length) throw new Error('Saisissez au moins une table.');
    if (names.some((n) => !isName(n))) throw new Error('Noms logiques invalides.');
    if (names.length > 60) throw new Error('60 tables maximum par export.');
    const ents = await entityList();
    const res = await pool(names, 4, async (e) => {
      const meta = ents.find((x) => x.LogicalName === e);
      if (!meta) throw new Error('table inconnue');
      return { e, meta, attrs: await attributesOf(e), os: optChk.checked ? await optionSetsOf(e) : [], rel: relChk.checked ? await relationsOf(e) : null };
    }, (d, t) => prog.set(`${d}/${t} table(s) lue(s)…`));
    prog.set('');
    return {
      items: res.filter((r) => r.ok).map((r) => r.v),
      errs: res.map((r, i) => (r.ok ? null : `${names[i]} : ${r.e.message}`)).filter(Boolean),
    };
  }

  const colRows = (item) => item.attrs.filter((a) => a.AttributeOf == null).sort((x, y) => x.LogicalName.localeCompare(y.LogicalName));
  const relRows = (item) => (item.rel ? [
    ...item.rel.manyToOne.map((x) => ['N:1', x.SchemaName, x.ReferencedEntity, x.ReferencingAttribute]),
    ...item.rel.oneToMany.map((x) => ['1:N', x.SchemaName, x.ReferencingEntity, x.ReferencingAttribute]),
    ...item.rel.manyToMany.map((x) => ['N:N', x.SchemaName, `${x.Entity1LogicalName} / ${x.Entity2LogicalName}`, '']),
  ] : []);

  const toXlsx = (m) => {
    const tables = [['Nom logique', 'Libellé', 'Description', 'Entity set', 'Personnalisée', 'Colonne ID', 'Colonne nom principale', 'Nb colonnes']];
    const cols = [['Table', 'Nom logique', 'Nom de schéma', 'Libellé', 'Type', 'Requis', 'Personnalisée', 'Audit', 'Sécurisée', 'Description']];
    const os = [['Table', 'Champ', 'Valeur', 'Libellé', 'Type']];
    const rel = [['Table', 'Type', 'Relation', 'Table liée', 'Champ']];
    m.items.forEach((it) => {
      const c = colRows(it);
      tables.push([it.e, label(it.meta.DisplayName), label(it.meta.Description), it.meta.EntitySetName, yesNo(it.meta.IsCustomEntity), it.meta.PrimaryIdAttribute, it.meta.PrimaryNameAttribute, c.length]);
      c.forEach((a) => cols.push([it.e, a.LogicalName, a.SchemaName, label(a.DisplayName), a.AttributeType, a.RequiredLevel && a.RequiredLevel.Value, yesNo(a.IsCustomAttribute), yesNo(managed(a.IsAuditEnabled)), yesNo(a.IsSecured), label(a.Description)]));
      it.os.forEach((o) => os.push([it.e, o.Champ, o.Valeur, o['Libellé'], o.Type]));
      relRows(it).forEach((r) => rel.push([it.e, ...r]));
    });
    const sheets = [{ name: 'Tables', rows: tables }, { name: 'Colonnes', rows: cols }];
    if (optChk.checked) sheets.push({ name: 'Option sets', rows: os });
    if (relChk.checked) sheets.push({ name: 'Relations', rows: rel });
    return Office.xlsx(sheets);
  };

  const toDocx = (m) => {
    const blocks = [{ t: 'title', text: 'Dictionnaire de données' }, { t: 'p', text: `Environnement : ${orgName()} — généré le ${new Date().toLocaleString('fr-FR')} — ${m.items.length} table(s)` }];
    m.items.forEach((it, i) => {
      if (i) blocks.push({ t: 'pb' });
      const c = colRows(it);
      blocks.push({ t: 'h1', text: `${label(it.meta.DisplayName) || it.e} (${it.e})` });
      blocks.push({ t: 'p', text: label(it.meta.Description) || 'Description à compléter.' });
      blocks.push({ t: 'p', text: `Entity set : ${it.meta.EntitySetName} — clé : ${it.meta.PrimaryIdAttribute} — nom principal : ${it.meta.PrimaryNameAttribute} — ${c.length} colonne(s)` });
      blocks.push({ t: 'h2', text: 'Colonnes' });
      blocks.push({ t: 'table', header: ['Nom logique', 'Libellé', 'Type', 'Requis', 'Description'], rows: c.map((a) => [a.LogicalName, label(a.DisplayName), a.AttributeType, (a.RequiredLevel && a.RequiredLevel.Value) || '', label(a.Description)]) });
      if (it.os.length) { blocks.push({ t: 'h2', text: 'Listes de valeurs' }); blocks.push({ t: 'table', header: ['Champ', 'Valeur', 'Libellé'], rows: it.os.map((o) => [o.Champ, o.Valeur, o['Libellé']]) }); }
      const rr = relRows(it);
      if (rr.length) { blocks.push({ t: 'h2', text: 'Relations' }); blocks.push({ t: 'table', header: ['Type', 'Relation', 'Table liée', 'Champ'], rows: rr }); }
    });
    return Office.docx(blocks, { landscape: true });
  };

  const exportAs = (kind) => guarded(out, async () => {
    const m = await collect();
    if (!m.items.length) throw new Error('Aucune table exploitable.\n' + m.errs.join('\n'));
    saveBlob(`dictionnaire-${stamp()}.${kind}`, kind === 'xlsx' ? toXlsx(m) : toDocx(m));
    return h('div', {}, h('p', { class: 'ok' }, `Fichier .${kind} généré : ${m.items.length} table(s).`), m.errs.length ? h('p', { class: 'error' }, 'Ignorées :\n' + m.errs.join('\n')) : null);
  });

  const addCustom = async () => {
    const custom = (await entityList()).filter((x) => x.IsCustomEntity).map((x) => x.LogicalName).sort();
    list.value = [...new Set([...parseNames(list.value), ...custom])].join(', ');
  };

  const DOC_SPEC = {
    key: 'doc', fileName: 'dictionnaire', title: 'Dictionnaire de données',
    vars: [['environnement', 'Environnement'], ['date', 'Date de génération'], ['nb_tables', 'Nombre de tables'], ['nb_colonnes', 'Nombre total de colonnes']],
    lists: [
      { name: 'tables', desc: 'Tables', fields: [['nom_logique', 'Nom logique'], ['libelle', 'Libellé'], ['description', 'Description'], ['entity_set', 'Entity set'], ['personnalisee', 'Personnalisée'], ['colonne_id', 'Colonne ID'], ['colonne_nom', 'Colonne nom principale'], ['nb_colonnes', 'Nombre de colonnes']] },
      { name: 'colonnes', parent: 'tables', desc: 'Colonnes', fields: [['nom_logique', 'Nom logique'], ['libelle', 'Libellé'], ['type', 'Type'], ['requis', 'Requis'], ['description', 'Description']] },
      { name: 'valeurs', parent: 'tables', desc: 'Listes de valeurs', fields: [['champ', 'Champ'], ['valeur', 'Valeur'], ['libelle', 'Libellé']] },
      { name: 'relations', parent: 'tables', desc: 'Relations', fields: [['type', 'Type'], ['nom', 'Relation'], ['table_liee', 'Table liée'], ['champ', 'Champ']] },
    ],
    getData: async () => {
      const m = await collect();
      if (!m.items.length) throw new Error('Aucune table exploitable.\n' + m.errs.join('\n'));
      const tables = m.items.map((it) => {
        const c = colRows(it);
        return {
          nom_logique: it.e, libelle: label(it.meta.DisplayName), description: label(it.meta.Description), entity_set: it.meta.EntitySetName, personnalisee: yesNo(it.meta.IsCustomEntity),
          colonne_id: it.meta.PrimaryIdAttribute, colonne_nom: it.meta.PrimaryNameAttribute, nb_colonnes: c.length,
          colonnes: c.map((a) => ({ nom_logique: a.LogicalName, libelle: label(a.DisplayName), type: a.AttributeType, requis: (a.RequiredLevel && a.RequiredLevel.Value) || '', description: label(a.Description) })),
          valeurs: it.os.map((o) => ({ champ: o.Champ, valeur: o.Valeur, libelle: o['Libellé'] })),
          relations: relRows(it).map((r) => ({ type: r[0], nom: r[1], table_liee: r[2], champ: r[3] })),
        };
      });
      return { environnement: orgName(), date: new Date().toLocaleString('fr-FR'), nb_tables: tables.length, nb_colonnes: tables.reduce((n, t) => n + t.nb_colonnes, 0), tables };
    },
  };

  root.append(
    h('p', { class: 'muted' }, 'Génère la documentation des tables : colonnes (type, requis, audit, sécurité, description), listes de valeurs et relations. La colonne « Description » reprend les descriptions Dataverse : complétez-les dans les métadonnées pour enrichir le document.'),
    list,
    h('div', { class: 'toolbar' },
      h('button', { onclick: addCustom }, 'Ajouter les tables personnalisées'), h('button', { onclick: () => { list.value = ''; } }, 'Vider'),
      h('label', { class: 'inline' }, optChk, 'Listes de valeurs'), h('label', { class: 'inline' }, relChk, 'Relations')),
    h('div', { class: 'toolbar' },
      h('button', { class: 'primary', onclick: () => exportAs('xlsx') }, 'Exporter en Excel (.xlsx)'),
      h('button', { class: 'primary', onclick: () => exportAs('docx') }, 'Exporter en Word (.docx)')),
    prog, out, Reports.panel(DOC_SPEC));
};
