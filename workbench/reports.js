'use strict';
// Rapports Word à partir d'un modèle importé par l'utilisateur (chargé après helpers.js, avant les onglets).
// Chaque onglet décrit ses balises (spec) et fournit les données ; le moteur de remplacement est dans office.js.
//   Reports.panel({ key, fileName, vars: [[balise, description]], lists: [{ name, desc, fields: [[balise, description]] }], getData: async () => ({ … }) })
// Les modèles sont conservés dans chrome.storage.local (jamais envoyés ailleurs) ; 3 Mo maximum par modèle.

const Reports = (() => {
  const STORE = 'reportTemplates', MAX_BYTES = 3 * 1024 * 1024;
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const loadAll = async () => { try { return (await chrome.storage.local.get(STORE))[STORE] || {}; } catch (e) { return {}; } };
  const saveAll = (all) => chrome.storage.local.set({ [STORE]: all });
  const tagText = (t) => `{{${t}}}`;

  // Modèle de départ : toutes les balises du rapport, prêtes à être mises en forme dans Word.
  function sampleBlocks(spec) {
    const b = [{ t: 'title', text: spec.title || 'Rapport' }, { t: 'p', text: 'Modèle de départ : mettez en forme ce document dans Word (polices, logo, en-tête, pied de page), puis importez-le à nouveau. Supprimez les balises inutiles.' }];
    if (spec.vars.length) {
      b.push({ t: 'h1', text: 'Informations générales' });
      spec.vars.forEach(([tag, desc]) => b.push({ t: 'p', text: `${desc} : ${tagText(tag)}` }));
    }
    const lists = spec.lists || [];
    const table = (l) => ({ t: 'table', header: l.fields.map(([, d]) => d), rows: [l.fields.map(([tag], i) => (i === 0 ? tagText('#' + l.name) : '') + tagText(tag) + (i === l.fields.length - 1 ? tagText('/' + l.name) : ''))] });
    lists.filter((l) => !l.parent).forEach((l) => {
      const kids = lists.filter((k) => k.parent === l.name);
      if (!kids.length) { b.push({ t: 'h1', text: l.desc }, table(l)); return; }
      // liste avec sous-listes : boucle sur des paragraphes, les sous-listes sont des tableaux à l'intérieur
      b.push({ t: 'p', text: tagText('#' + l.name) }, { t: 'h1', text: `${tagText(l.fields[0][0])}${l.fields[1] ? ' — ' + tagText(l.fields[1][0]) : ''}` });
      l.fields.slice(2).forEach(([tag, desc]) => b.push({ t: 'p', text: `${desc} : ${tagText(tag)}` }));
      kids.forEach((k) => b.push({ t: 'h2', text: k.desc }, table(k)));
      b.push({ t: 'p', text: tagText('/' + l.name) });
    });
    return b;
  }

  function panel(spec) {
    const box = h('details', { class: 'tpl-panel' });
    const msg = h('div');
    const sel = h('select', { style: 'min-width:220px' });
    const file = h('input', { type: 'file', accept: '.docx,.dotx', style: 'display:none' });
    let templates = [];

    const knownTags = new Set([...spec.vars.map(([t]) => t), ...(spec.lists || []).flatMap((l) => [l.name, ...l.fields.map(([t]) => t)])]);

    async function refresh(selectName) {
      templates = (await loadAll())[spec.key] || [];
      sel.replaceChildren(h('option', { value: '' }, templates.length ? '— choisir un modèle —' : '— aucun modèle importé —'),
        ...templates.map((t) => h('option', { value: t.name, selected: t.name === selectName }, `${t.name} (${Math.round(t.size / 1024)} Ko)`)));
    }

    async function importFile() {
      const f = file.files[0];
      file.value = '';
      if (!f) return;
      msg.replaceChildren();
      try {
        if (!/\.(docx|dotx)$/i.test(f.name)) throw new Error('Choisissez un fichier Word (.docx ou .dotx).');
        if (f.size > MAX_BYTES) throw new Error('Modèle trop volumineux (3 Mo maximum).');
        const buf = new Uint8Array(await f.arrayBuffer());
        const found = await Office.docxTags(buf); // valide aussi que le fichier est bien un .docx
        const all = await loadAll();
        const list = (all[spec.key] || []).filter((t) => t.name !== f.name);
        list.push({ name: f.name, b64: toB64(buf), size: buf.length, date: new Date().toISOString() });
        all[spec.key] = list;
        await saveAll(all);
        await refresh(f.name);
        const names = [...found.vars, ...found.loops];
        const unknown = [...new Set(names)].filter((n) => !knownTags.has(n));
        msg.replaceChildren(
          h('p', { class: 'ok' }, `Modèle « ${f.name} » importé : ${new Set(names).size} balise(s) trouvée(s).`),
          unknown.length ? h('p', { class: 'error' }, 'Balises inconnues pour ce rapport (elles resteront vides) : ' + unknown.map(tagText).join(', ')) : null,
          !names.length ? h('p', { class: 'muted' }, 'Aucune balise {{…}} détectée : le document sera copié tel quel. Téléchargez le modèle de départ pour voir la syntaxe.') : null);
      } catch (e) {
        msg.replaceChildren(h('p', { class: 'error' }, e.message));
      }
    }

    async function generate() {
      msg.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Génération…'));
      try {
        const t = templates.find((x) => x.name === sel.value);
        if (!t) throw new Error('Importez puis sélectionnez un modèle Word.');
        const data = await spec.getData();
        const r = await Office.docxFromTemplate(fromB64(t.b64), data);
        saveBlob(`${spec.fileName || 'rapport'}-${stamp()}.docx`, r.blob);
        msg.replaceChildren(h('p', { class: 'ok' }, 'Rapport généré à partir du modèle « ' + t.name + ' ».'),
          r.missing.length ? h('p', { class: 'error' }, 'Balises du modèle sans donnée (laissées vides) : ' + r.missing.map((m) => (m.startsWith('{{') ? m : tagText(m))).join(', ')) : null);
      } catch (e) {
        msg.replaceChildren(h('p', { class: 'error' }, e.message));
      }
    }

    async function remove() {
      if (!sel.value) return;
      if (!(await confirmBox(`Supprimer le modèle « ${sel.value} » ?`, { danger: true, confirmText: 'Supprimer' }))) return;
      const all = await loadAll();
      all[spec.key] = (all[spec.key] || []).filter((t) => t.name !== sel.value);
      await saveAll(all);
      await refresh();
    }

    const tagList = h('div', { class: 'tpl-tags' },
      h('p', { class: 'muted' }, 'Écrivez ces balises dans votre document Word ; elles sont remplacées à la génération. Cliquez sur une balise pour la copier.'),
      h('p', { class: 'muted' }, 'Boucle : placez {{#liste}} au début et {{/liste}} à la fin d\'une ligne de tableau (la ligne est répétée) ou de paragraphes. Les balises fonctionnent aussi dans l\'en-tête et le pied de page.'),
      dataTable([
        ...spec.vars.map(([tag, desc]) => ({ Balise: tagText(tag), Type: 'Valeur', Description: desc })),
        ...(spec.lists || []).flatMap((l) => [
          { Balise: tagText('#' + l.name) + ' … ' + tagText('/' + l.name), Type: l.parent ? 'Boucle dans ' + l.parent : 'Boucle', Description: l.desc },
          ...l.fields.map(([tag, desc]) => ({ Balise: '   ' + tagText(tag), Type: 'Dans la boucle ' + l.name, Description: desc })),
        ]),
      ], { onRow: (r) => { navigator.clipboard.writeText(r.Balise.trim()).then(() => toast('✓ Balise copiée')); }, exportName: 'balises-' + spec.key }));

    box.append(
      h('summary', {}, 'Rapport Word à partir de votre modèle'),
      h('p', { class: 'muted' }, 'Importez un document Word contenant des balises {{…}} : Xrmkit le remplit avec les données de cet écran et produit un .docx qui garde votre mise en forme. Le modèle reste dans votre navigateur.'),
      h('div', { class: 'toolbar' },
        h('button', { onclick: () => file.click() }, 'Importer un modèle (.docx)'), file,
        sel,
        h('button', { class: 'primary', onclick: generate }, 'Générer le rapport'),
        h('button', { class: 'danger', onclick: remove }, 'Supprimer le modèle'),
        h('button', { onclick: () => saveBlob(`modele-${spec.key}.docx`, Office.docx(sampleBlocks(spec))) }, 'Télécharger un modèle de départ')),
      msg, h('details', {}, h('summary', {}, 'Balises disponibles'), tagList));
    file.addEventListener('change', importFile);
    refresh();
    return box;
  }

  return { panel, sampleBlocks };
})();
