'use strict';
// Chat IA intégré (v0.6) : contexte automatique, outils de lecture, actions proposées (toujours confirmées),
// pièces jointes, historique local, aperçu de ce qui est envoyé, compteur de tokens.

Object.assign(TITLES, { chat: 'Chat IA' });

const clip = (v, n = 6000) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)}… [tronqué : ${s.length - n} caractères]` : s;
};
const estTokens = (s) => Math.ceil(String(s || '').length / 3.6);
const shortVal = (v) => (typeof v === 'string' && v.length > 120 ? v.slice(0, 120) + '…' : v);

// ---------------------------------------------------------------------
// Outils de lecture exposés à l'IA (aucune écriture directe)
// ---------------------------------------------------------------------
const chatCtx = { ui: null }; // renseigné pendant un tour : { msg }
const chatPrefs = { confidential: true, ctx: { env: true, page: true, model: true, form: true, errors: true } };

const CHAT_TOOLS = {
  find_entities: { sig: '{"text":"mot du nom ou du libellé"}', desc: 'Cherche des tables par nom logique ou libellé.', run: async ({ text }) => {
    const t = String(text || '').toLowerCase();
    return (await entityList()).filter((e) => e.LogicalName.includes(t) || label(e.DisplayName).toLowerCase().includes(t)).slice(0, 40).map((e) => `${e.LogicalName} (${label(e.DisplayName)}) set=${e.EntitySetName}`);
  } },
  get_attributes: { sig: '{"entity":"account"}', desc: 'Colonnes d\'une table : nom logique, type, exigence, libellé.', run: async ({ entity }) => (await attributesOf(entity)).filter((a) => a.AttributeOf == null).slice(0, 400).map((a) => `${a.LogicalName}:${a.AttributeType}${['ApplicationRequired', 'SystemRequired'].includes(a.RequiredLevel && a.RequiredLevel.Value) ? '*' : ''} (${label(a.DisplayName)})`) },
  find_columns: { sig: '{"entity":"account","text":"téléphone"}', desc: 'Cherche des colonnes d\'une table par libellé, description ou nom (recherche par sens : formule plusieurs mots).', run: async ({ entity, text }) => {
    const words = String(text || '').toLowerCase().split(/\s+/).filter(Boolean);
    return (await attributesOf(entity)).filter((a) => { const hay = `${a.LogicalName} ${label(a.DisplayName)} ${label(a.Description)}`.toLowerCase(); return words.some((w) => hay.includes(w)); }).slice(0, 40).map((a) => `${a.LogicalName}:${a.AttributeType} (${label(a.DisplayName)}) ${label(a.Description)}`.trim());
  } },
  get_relations: { sig: '{"entity":"account"}', desc: 'Relations 1-N, N-1 et N-N d\'une table.', run: async ({ entity }) => {
    const r = await relationsOf(entity);
    return { '1-N': r.oneToMany.map((x) => `${x.ReferencingEntity}.${x.ReferencingAttribute}`).slice(0, 60), 'N-1': r.manyToOne.map((x) => `${x.ReferencingAttribute}→${x.ReferencedEntity}`).slice(0, 60), 'N-N': r.manyToMany.map((x) => `${x.Entity1LogicalName}↔${x.Entity2LogicalName}`) };
  } },
  get_optionsets: { sig: '{"entity":"account"}', desc: 'Valeurs et libellés des listes de choix d\'une table.', run: async ({ entity }) => (await optionSetsOf(entity)).slice(0, 250).map((o) => `${o.Champ}: ${o.Valeur}=${o['Libellé']}`) },
  list_solutions: { sig: '{}', desc: 'Solutions visibles (nom unique, version, gérée ou non).', run: async () => (await rows('solutions?$select=uniquename,version,ismanaged&$filter=isvisible eq true&$orderby=uniquename')).map((s) => `${s.uniquename} ${s.version} ${s.ismanaged ? '(gérée)' : ''}`) },
  list_plugin_steps: { sig: '{"entity":"account"}', desc: 'Étapes de plug-ins non système, filtrées par table (facultatif).', run: async ({ entity }) => {
    const r = await rows('sdkmessageprocessingsteps?$select=name,stage,mode,statecode,filteringattributes&$filter=ishidden/Value eq false and ismanaged eq false&$orderby=name', { formatted: false, maxPages: 3, pageSize: 500 });
    const e = String(entity || '').toLowerCase();
    return r.filter((s) => !e || String(s.name).toLowerCase().includes(e)).slice(0, 80).map((s) => `${s.name} | stage ${s.stage} | ${s.mode === 0 ? 'sync' : 'async'} | ${s.statecode === 0 ? 'actif' : 'désactivé'} | filtre: ${s.filteringattributes || '—'}`);
  } },
  list_flows: { sig: '{"search":"texte"}', desc: 'Flux cloud et processus (nom, catégorie, état).', run: async ({ search }) => {
    const s = String(search || '').replace(/'/g, "''");
    return (await rows(`workflows?$select=name,category,statecode&$filter=type eq 1${s ? ` and contains(name,'${s}')` : ''}&$top=80`)).map((w) => `${w.name} [${WF_CATS[w.category] || w.category}] ${w.statecode === 1 ? 'activé' : w.statecode === 2 ? 'suspendu' : 'brouillon'}`);
  } },
  get_workflow: { sig: '{"name":"nom exact"}', desc: 'Définition d\'un flux (JSON) ou workflow/règle métier (XAML), tronquée.', run: async ({ name }) => {
    const r = await rows(`workflows?$select=name,category,clientdata,xaml&$filter=name eq '${esc(name)}' and type eq 1&$top=1`);
    if (!r.length) return 'Introuvable.';
    return clip(r[0].clientdata || r[0].xaml || '(vide)', 7000);
  } },
  get_webresource: { sig: '{"name":"new_/js/fichier.js"}', desc: 'Contenu d\'une web resource script/HTML (tronqué).', run: async ({ name }) => {
    const r = await rows(`webresourceset?$select=name,content&$filter=name eq '${esc(name)}'&$top=1`);
    if (!r.length) return 'Introuvable.';
    try { return clip(decodeURIComponent(escape(atob(r[0].content))), 7000); } catch (e) { return clip(atob(r[0].content), 7000); }
  } },
  get_form_info: { sig: '{}', desc: 'Formulaire ouvert : onglets, sections, bibliothèques JS, handlers, champs (sans valeurs).', run: async () => {
    const f = await call('formDebug');
    let xml = null;
    if (f.formId) { try { xml = parseFormXml((await q(`systemforms(${f.formId})?$select=formxml`)).data.formxml); } catch (e) { /* ignore */ } }
    const fields = await call('formFields');
    return { entite: f.entite, formulaire: f.formNom, type: f.typeFormulaire, onglets: f.onglets.map((t) => `${t.libelle || t.nom}${t.visible === false ? ' (masqué)' : ''}: ${t.sections.map((s) => s.libelle || s.nom).join(', ')}`), bibliotheques: xml && xml.libs, handlers: xml && xml.events.map((e) => `${e.Événement}@${e.Cible} → ${e.Bibliothèque}::${e.Fonction}${e.Activé ? '' : ' (désactivé)'}`), champs: fields.map((x) => `${x.champ}:${x.type} ${x.requis}${x.visible === false ? ' masqué' : ''}${x.desactive ? ' verrouillé' : ''}`) };
  } },
  get_recent_errors: { sig: '{}', desc: 'Erreurs JavaScript récentes de la page Dynamics.', run: async () => (await call('recentErrors')).map((e) => `${e.date} ${e.message}`) },
  get_perf: { sig: '{}', desc: 'Mesures de performance de la page (chargement, appels API lents, doublons).', run: async () => {
    const r = await call('perfReport');
    const api = r.ressources.filter((x) => x.type === 'API Web').sort((a, b) => b.duree - a.duree).slice(0, 10).map((x) => `${x.duree} ms ${x.url}`);
    return { navigation: r.navigation, appels_api: r.ressources.filter((x) => x.type === 'API Web').length, plus_lents: api, taches_longues: r.longTasks && r.longTasks.length, js_ko: Math.round(r.ressources.filter((x) => x.type === 'JavaScript').reduce((n, x) => n + x.taille, 0) / 1024) };
  } },
  run_query: { sig: '{"kind":"odata|fetchxml","text":"accounts?$select=name&$top=5"}', desc: 'Exécute une requête en LECTURE (20 lignes max). En mode confidentiel, seules les colonnes et le nombre de lignes sont renvoyés.', run: async ({ kind, text }) => {
    let res;
    if (kind === 'fetchxml') {
      let x = String(text || '').trim();
      if (!/^<fetch\b/i.test(x)) throw new Error('FetchXML invalide.');
      if (!/<fetch[^>]*\b(top|count)=/i.test(x)) x = x.replace(/<fetch\b/i, '<fetch top="20"');
      res = (await call('fetchxml', { fetchXml: x, callerId: state.callerId, formatted: true })).value;
    } else {
      let p = String(text || '').trim().replace(/^\/+/, '');
      if (!/^[A-Za-z0-9_]+(\([0-9a-f-]{36}\))?(\?|$)/.test(p) || /\$batch/i.test(p)) throw new Error('Chemin OData non autorisé (lecture sur une table uniquement).');
      if (!/\$top=|\$count=true/i.test(p)) p += (p.includes('?') ? '&' : '?') + '$top=20';
      res = (await q(p, { formatted: true })).value;
    }
    const rowsOut = (res || []).slice(0, 20).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.includes('@odata') && !k.includes('@Microsoft')).map(([k, v]) => [k, shortVal(v)])));
    const columns = rowsOut[0] ? Object.keys(rowsOut[0]) : [];
    if (chatPrefs.confidential) return { colonnes: columns, nombre_lignes: (res || []).length, note: 'Mode confidentiel : valeurs non transmises.' };
    return { colonnes: columns, nombre_lignes: (res || []).length, lignes: rowsOut };
  } },
  open_tab: { sig: '{"tab":"perf|fdebug|impact|steps|cmp|orphan|fhealth|gen|query|meta|audit|security","note":"pourquoi"}', desc: 'Affiche à l\'utilisateur un bouton pour ouvrir un onglet du Workbench.', run: async ({ tab, note }) => {
    if (!TITLES[tab] || !tabs[tab]) throw new Error('Onglet inconnu : ' + tab);
    chatCtx.ui.buttons.push({ label: `Ouvrir « ${TITLES[tab]} »${note ? ` — ${String(note).slice(0, 120)}` : ''}`, act: 'tab', tab });
    return 'Bouton affiché à l\'utilisateur.';
  } },
  send_to_editor: { sig: '{"kind":"fetchxml|odata","text":"…"}', desc: 'Affiche un bouton qui envoie une requête vers l\'éditeur de requêtes.', run: async ({ kind, text }) => {
    if (!['fetchxml', 'odata'].includes(kind)) throw new Error('kind invalide.');
    chatCtx.ui.buttons.push({ label: `Envoyer vers l'éditeur (${kind})`, act: 'editor', mode: kind, text: String(text) });
    return 'Bouton affiché à l\'utilisateur.';
  } },
  propose_action: { sig: '{"type":"update|create|delete|toggle_step|toggle_flow","entity":"account","id":"guid","fields":{"name":"x"},"enable":true,"summary":"ce que fait l\'action"}', desc: 'PROPOSE une écriture. Rien n\'est exécuté : l\'utilisateur doit cliquer puis confirmer. Les liens se font avec "champ@odata.bind":"/accounts(guid)".', run: async (a) => {
    validateAction(a);
    chatCtx.ui.actions.push({ ...a, done: false });
    return 'Action proposée : carte affichée à l\'utilisateur avec bouton de confirmation. Elle n\'est PAS encore exécutée.';
  } },
};

const GUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function validateAction(a) {
  if (!['update', 'create', 'delete', 'toggle_step', 'toggle_flow'].includes(a.type)) throw new Error('Type d\'action inconnu.');
  if (['update', 'create', 'delete'].includes(a.type) && !isName(a.entity)) throw new Error('Table invalide.');
  if (a.type !== 'create' && !GUID_RE.test(String(a.id || ''))) throw new Error('id (GUID) requis.');
  if (['update', 'create'].includes(a.type)) {
    if (!a.fields || typeof a.fields !== 'object' || !Object.keys(a.fields).length) throw new Error('fields requis.');
    Object.entries(a.fields).forEach(([k, v]) => {
      if (!/^[A-Za-z0-9_]+(@odata\.bind)?$/.test(k)) throw new Error('Nom de champ invalide : ' + k);
      if (v !== null && typeof v === 'object') throw new Error('Valeur non primitive : ' + k);
    });
  }
}

async function executeAction(a) {
  validateAction(a);
  const org = orgName();
  if (a.type === 'toggle_step') {
    if (!(await confirmBox(`${a.enable ? 'Activer' : 'Désactiver'} l'étape de plug-in ${a.id} dans ${org} ?`, { confirmText: a.enable ? 'Activer' : 'Désactiver' }))) return false;
    await q(`sdkmessageprocessingsteps(${a.id})`, { method: 'PATCH', body: { statecode: a.enable ? 0 : 1, statuscode: a.enable ? 1 : 2 }, headers: { 'If-Match': '*' } });
    return true;
  }
  if (a.type === 'toggle_flow') {
    if (!(await confirmBox(`${a.enable ? 'Activer' : 'Désactiver'} le flux / processus ${a.id} dans ${org} ?`, { confirmText: a.enable ? 'Activer' : 'Désactiver' }))) return false;
    await q(`workflows(${a.id})`, { method: 'PATCH', body: { statecode: a.enable ? 1 : 0, statuscode: a.enable ? 2 : 1 }, headers: { 'If-Match': '*' } });
    return true;
  }
  const set = await entitySetOf(a.entity);
  if (a.type === 'delete') {
    const t = await promptBox(`SUPPRIMER définitivement ${a.entity}(${a.id}) dans ${org} ?`, { title: 'Suppression définitive', danger: true, expect: 'SUPPRIMER', confirmText: 'Supprimer' });
    if (t !== 'SUPPRIMER') return false;
    await q(`${set}(${a.id})`, { method: 'DELETE' });
    return true;
  }
  const verb = a.type === 'create' ? 'Créer' : 'Modifier';
  if (!(await confirmBox(`${verb} un enregistrement « ${a.entity} » dans ${org} ?\n${JSON.stringify(a.fields, null, 2)}`, { confirmText: verb }))) return false;
  if (a.type === 'create') await q(set, { method: 'POST', body: a.fields });
  else await q(`${set}(${a.id})`, { method: 'PATCH', body: a.fields, headers: { 'If-Match': '*' } });
  return true;
}

// ---------------------------------------------------------------------
// Contexte automatique
// ---------------------------------------------------------------------
const CTX_LABELS = { env: 'Environnement', page: 'Page ouverte', model: 'Modèle de la table', form: 'Formulaire', errors: 'Erreurs récentes' };
const CTX_BUILDERS = {
  env: async () => { const i = await call('envInfo'); return `URL: ${i.URL}\nOrganisation: ${i['Organisation (nom unique)']}\nVersion: ${i.Version}\nUtilisateur: ${i.Utilisateur}`; },
  page: async () => { const r = await call('recordInfo'); return `Table: ${r.entity}\nFormulaire: ${r.formName || '—'}\nEnregistrement: ${r.isNew ? 'nouveau' : r.id || '—'}\nPage: ${r.pageUrl || r.url || ''}`; },
  model: async () => {
    const r = await call('recordInfo');
    if (!r || !r.entity) throw new Error('aucune table');
    return `Colonnes de ${r.entity} (nom:type, * = obligatoire):\n` + (await attributesOf(r.entity)).filter((a) => a.AttributeOf == null && a.IsValidForRead).slice(0, 250).map((a) => `${a.LogicalName}:${a.AttributeType}${['ApplicationRequired', 'SystemRequired'].includes(a.RequiredLevel && a.RequiredLevel.Value) ? '*' : ''}`).join(', ');
  },
  form: async () => {
    const fields = await call('formFields');
    const lines = fields.map((x) => `${x.champ}:${x.type} ${x.requis}${x.visible === false ? ' masqué' : ''}${x.desactive ? ' verrouillé' : ''}${x.modifie ? ' modifié' : ''}${chatPrefs.confidential ? '' : ` = ${x.valeur}`}`);
    return `Champs du formulaire (${fields.length})${chatPrefs.confidential ? ' — valeurs non transmises' : ''}:\n${lines.join('\n')}`;
  },
  errors: async () => { const e = await call('recentErrors'); if (!e.length) throw new Error('aucune'); return e.slice(-8).map((x) => `${x.date} ${x.message}`).join('\n'); },
};

async function buildContext() {
  const parts = [], missing = [];
  for (const [k, fn] of Object.entries(CTX_BUILDERS)) {
    if (!chatPrefs.ctx[k]) continue;
    try { parts.push(`## ${CTX_LABELS[k]}\n${clip(await fn(), 5000)}`); } catch (e) { missing.push(CTX_LABELS[k]); }
  }
  return { text: parts.join('\n\n'), missing };
}

function chatSystemPrompt(ctxText) {
  const tools = Object.entries(CHAT_TOOLS).map(([n, t]) => `- ${n} ${t.sig} : ${t.desc}`).join('\n');
  return `Tu es l'assistant IA intégré à Xrmkit, une extension Chrome pour les consultants Dynamics 365 / Dataverse (applications pilotées par modèle). Tu réponds en français, de façon concise, structurée et directement exploitable (tableaux, listes, blocs de code).

Règles :
- N'invente jamais un nom de table, de colonne ou de valeur : vérifie avec les outils ou dis que tu ne sais pas.
- Tu ne peux RIEN écrire directement. Pour une modification, appelle propose_action : l'utilisateur voit une carte et confirme lui-même.
- Mode ${chatPrefs.confidential ? 'CONFIDENTIEL : les valeurs d\'enregistrements ne te sont pas transmises ; raisonne sur la structure.' : 'standard : des valeurs d\'enregistrements peuvent t\'être transmises, ne les répète pas inutilement.'}
- Mets les requêtes dans des blocs de code avec la langue (\`\`\`fetchxml ou \`\`\`odata). Pour FetchXML utilise uniquement des noms de colonnes vérifiés.
- Si la demande est ambiguë, pose UNE question courte.

Outils (appel en une ligne, plusieurs possibles par message) :
<tool>{"name":"nom_outil","args":{...}}</tool>
Après un appel, arrête-toi : les résultats te sont renvoyés dans le message suivant, puis tu poursuis. N'écris pas de réponse finale dans le même message qu'un appel d'outil. Maximum 6 tours d'outils.
Outils disponibles :
${tools}

Date du jour : ${new Date().toLocaleDateString('fr-FR')}.

# Contexte actuel
${ctxText || '(aucun contexte joint)'}`;
}

// ---------------------------------------------------------------------
// Rendu Markdown léger (sans innerHTML)
// ---------------------------------------------------------------------
function mdInline(text) {
  const out = [];
  String(text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g).forEach((p) => {
    if (!p) return;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1) out.push(h('code', {}, p.slice(1, -1)));
    else if (p.startsWith('**') && p.endsWith('**') && p.length > 3) out.push(h('b', {}, p.slice(2, -2)));
    else out.push(p);
  });
  return out;
}

function mdBlocks(text) {
  const out = [], lines = text.split('\n');
  let para = [], list = null, table = null;
  const flushPara = () => { if (para.length) { out.push(h('p', {}, ...mdInline(para.join(' ')))); para = []; } };
  const flushList = () => { if (list) { out.push(h(list.ordered ? 'ol' : 'ul', {}, list.items.map((i) => h('li', {}, ...mdInline(i))))); list = null; } };
  const flushTable = () => {
    if (!table) return;
    const rowsT = table.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
    if (rowsT.length) out.push(h('div', { class: 'scroll' }, h('table', {}, h('thead', {}, h('tr', {}, rowsT[0].map((c) => h('th', {}, ...mdInline(c))))), h('tbody', {}, rowsT.slice(1).map((r) => h('tr', {}, r.map((c) => h('td', {}, ...mdInline(c)))))))));
    table = null;
  };
  lines.forEach((ln) => {
    if (/^\s*\|.*\|\s*$/.test(ln)) { flushPara(); flushList(); (table ||= []).push(ln); return; }
    flushTable();
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(ln))) { flushPara(); flushList(); out.push(h('h4', {}, ...mdInline(m[2]))); return; }
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(ln))) { flushPara(); if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; } list.items.push(m[1]); return; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) { flushPara(); if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; } list.items.push(m[1]); return; }
    if (!ln.trim()) { flushPara(); flushList(); return; }
    flushList(); para.push(ln.trim());
  });
  flushPara(); flushList(); flushTable();
  return out;
}

function chatCodeBlock(lang, code) {
  const l = (lang || '').toLowerCase();
  const isFetch = /^<fetch\b/i.test(code.trim());
  const isOdata = l === 'odata' || /^[a-z_0-9]+\?\$/i.test(code.trim());
  const bar = h('div', { class: 'cc-bar' }, h('span', { class: 'muted' }, lang || 'code'), copyBtn(() => code, 'Copier'));
  if (isFetch) bar.append(h('button', { onclick: () => { state.pendingQuery = { mode: 'fetchxml', text: code }; closeChatDrawer(); show('query'); } }, 'Envoyer vers l\'éditeur'));
  else if (isOdata) bar.append(h('button', { onclick: () => { state.pendingQuery = { mode: 'odata', text: code.trim() }; closeChatDrawer(); show('query'); } }, 'Envoyer vers l\'éditeur'));
  return h('div', { class: 'cc' }, bar, h('pre', {}, code));
}

function mdToDom(text) {
  const root = h('div', { class: 'md' });
  String(text).split('```').forEach((part, i) => {
    if (i % 2 === 1) {
      const m = /^([A-Za-z0-9_+.-]*)\n?([\s\S]*)$/.exec(part);
      root.append(chatCodeBlock(m[1], m[2].replace(/\n$/, '')));
    } else mdBlocks(part).forEach((b) => root.append(b));
  });
  return root;
}

// ---------------------------------------------------------------------
// Composant de chat (instance unique déplacée entre l'onglet et le panneau latéral)
// ---------------------------------------------------------------------
const chat = { conv: null, history: [], atts: [], busy: false, el: null };
const newConv = () => ({ id: String(Date.now()), title: 'Nouvelle conversation', date: new Date().toISOString(), messages: [], tokens: 0 });

async function chatLoad() {
  const st = await chrome.storage.local.get(['chatHistory', 'chatPrefs']);
  const MAX_AGE = 30 * 864e5; // les conversations de plus de 30 jours sont supprimées
  chat.history = (st.chatHistory || []).filter((c) => !c.date || Date.now() - new Date(c.date).getTime() < MAX_AGE);
  if (st.chatPrefs) { chatPrefs.confidential = st.chatPrefs.confidential !== false; Object.assign(chatPrefs.ctx, st.chatPrefs.ctx || {}); }
  chat.conv = chat.history[0] || newConv();
}
const chatSavePrefs = () => chrome.storage.local.set({ chatPrefs: { confidential: chatPrefs.confidential, ctx: chatPrefs.ctx } });
async function chatSaveHistory() {
  const c = chat.conv;
  if (c.messages.length) {
    c.date = new Date().toISOString();
    if (c.title === 'Nouvelle conversation') { const first = c.messages.find((m) => m.role === 'user' && !m.hidden); c.title = (first && (first.shown || first.content).slice(0, 60)) || c.title; }
    chat.history = [c, ...chat.history.filter((x) => x.id !== c.id)].slice(0, 20);
  }
  try { await chrome.storage.local.set({ chatHistory: chat.history }); } catch (e) { toast('Historique trop volumineux : supprimez d\'anciennes conversations.', true); }
}

function showText(title, text) {
  const back = h('div', { class: 'dlg-back', onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div', { class: 'dlg wide', role: 'dialog' },
      h('div', { class: 'dlg-head' }, h('span', { class: 'dlg-ico' }, '👁'), h('h3', {}, title)),
      h('div', { class: 'dlg-body' }, h('pre', { class: 'preview' }, text)),
      h('div', { class: 'dlg-foot' }, copyBtn(() => text, 'Copier'), h('button', { class: 'primary', onclick: () => back.remove() }, 'Fermer'))));
  document.body.append(back);
}

function buildChatEl() {
  const msgBox = h('div', { class: 'chat-msgs' });
  const status = h('div', { class: 'chat-status muted' });
  const input = h('textarea', { rows: '2', placeholder: 'Posez une question sur la page, la table, un flux, une erreur…  (Entrée pour envoyer, Maj+Entrée = nouvelle ligne)', class: 'chat-input' });
  const attBox = h('div', { class: 'chat-atts' });
  const ctxBox = h('div', { class: 'chat-ctx' });
  const convSel = h('select', { class: 'chat-conv', title: 'Conversations enregistrées' });
  const foot = h('div', { class: 'chat-foot muted' });
  const sendBtn = h('button', { class: 'primary' }, 'Envoyer');

  function drawCtx() {
    ctxBox.replaceChildren(
      ...Object.keys(CTX_LABELS).map((k) => h('button', { class: 'chip' + (chatPrefs.ctx[k] ? ' on' : ''), title: 'Joindre ou retirer ce contexte', onclick: () => { chatPrefs.ctx[k] = !chatPrefs.ctx[k]; chatSavePrefs(); drawCtx(); } }, (chatPrefs.ctx[k] ? '✓ ' : '') + CTX_LABELS[k])),
      h('label', { class: 'inline chat-conf', title: 'Les valeurs des enregistrements ne sont jamais envoyées à l\'IA' }, h('input', { type: 'checkbox', checked: chatPrefs.confidential, onchange: (e) => { chatPrefs.confidential = e.target.checked; chatSavePrefs(); } }), '🔒 Confidentiel'),
      h('button', { onclick: preview }, '👁 Voir ce qui part'));
  }

  function drawAtts() {
    attBox.replaceChildren(...chat.atts.map((a, i) => h('span', { class: 'chip on att', title: 'Pièce jointe envoyée telle quelle à l\'IA (peut contenir des valeurs)' }, `📎 ${a.name} (${Math.round(a.text.length / 1000)} k car.) `, h('button', { class: 'x', onclick: () => { chat.atts.splice(i, 1); drawAtts(); } }, '×'))));
  }

  function drawConvs() {
    const all = [chat.conv, ...chat.history.filter((c) => c.id !== chat.conv.id)];
    convSel.replaceChildren(...all.map((c) => h('option', { value: c.id, selected: c.id === chat.conv.id }, `${c.title} — ${new Date(c.date).toLocaleDateString('fr-FR')}`)));
  }

  function drawFoot() {
    getAiCfg().then((cfg) => { foot.textContent = `${AI_PROVIDERS[cfg.provider].label} · ≈ ${chat.conv.tokens || 0} tokens cette conversation (estimation) · l'IA peut se tromper : vérifiez avant d'appliquer.`; });
  }

  function renderAction(a, msg) {
    const label_ = { update: 'Modifier un enregistrement', create: 'Créer un enregistrement', delete: 'Supprimer un enregistrement', toggle_step: a.enable ? 'Activer une étape de plug-in' : 'Désactiver une étape de plug-in', toggle_flow: a.enable ? 'Activer un flux' : 'Désactiver un flux' }[a.type];
    const btn = h('button', { class: a.type === 'delete' ? 'danger' : 'primary' }, a.done ? '✓ Appliqué' : 'Appliquer…');
    btn.disabled = !!a.done;
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if (await executeAction(a)) { a.done = true; btn.textContent = '✓ Appliqué'; toast('✓ Action appliquée'); chatSaveHistory(); } else btn.disabled = false;
      } catch (e) { btn.disabled = false; toast(e.message, true); }
    };
    return h('div', { class: 'act' }, h('div', { class: 'act-h' }, '⚡ Action proposée : ', h('b', {}, label_)), a.summary ? h('p', {}, a.summary) : null,
      h('pre', {}, [a.entity && `${a.entity}${a.id ? '(' + a.id + ')' : ''}`, a.fields && JSON.stringify(a.fields, null, 2), a.type.startsWith('toggle') && `id: ${a.id}`].filter(Boolean).join('\n')),
      btn, h('span', { class: 'muted' }, ` Rien n'est modifié tant que vous n'avez pas confirmé (${orgName()}).`));
  }

  function renderMsgs() {
    msgBox.replaceChildren();
    if (!chat.conv.messages.length) {
      msgBox.append(h('div', { class: 'chat-empty' }, h('div', { class: 'chat-hero' }, '💬'), h('p', {}, 'Bonjour ! Je connais la page Dynamics ouverte, son modèle et ses erreurs. Je peux lire vos métadonnées, plug-ins, flux et scripts, écrire des requêtes, et proposer des modifications que vous validez.'),
        h('div', { class: 'chat-quick' },
          ...[['🔎 Expliquer cette page', 'Explique la page Dynamics ouverte : table, formulaire, champs importants, scripts et handlers, et ce qu\'un consultant doit savoir avant de la modifier.'],
            ['🩺 Chercher les problèmes', 'Analyse le formulaire ouvert, les erreurs récentes et les performances. Liste les problèmes par gravité avec la correction proposée pour chacun.'],
            ['🧭 Résumer l\'environnement', 'Résume cet environnement : version, solutions, plug-ins et flux notables, points d\'attention pour un consultant qui le découvre.'],
            ['🧪 Idées de requêtes', 'Propose cinq requêtes FetchXML utiles pour auditer la table de la page ouverte (qualité des données, doublons, enregistrements incomplets).']]
            .map(([t, p]) => h('button', { onclick: () => send(p) }, t)))));
      return;
    }
    chat.conv.messages.forEach((m) => {
      if (m.hidden) return;
      if (m.role === 'user') {
        msgBox.append(h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, m.shown ?? m.content, ...(m.atts || []).map((n) => h('div', { class: 'muted' }, `📎 ${n}`)))));
      } else if (m.role === 'error') {
        msgBox.append(h('div', { class: 'msg' }, h('div', { class: 'bubble err' }, m.content, ' ', /clé|Clé|manquante|renseign/i.test(m.content) ? h('button', { onclick: () => { closeChatDrawer(); show('ai'); } }, 'Configurer l\'IA') : null)));
      } else {
        const b = h('div', { class: 'bubble' });
        if (m.tools && m.tools.length) b.append(h('details', { class: 'tools' }, h('summary', {}, `🔧 ${m.tools.length} outil(s) utilisé(s)`), ...m.tools.map((t) => h('div', { class: t.ok ? 'muted' : 'error' }, `${t.name}(${clip(JSON.stringify(t.args || {}), 160)}) → ${t.ok ? 'ok' : t.err}`))));
        if (m.text) b.append(mdToDom(m.text));
        (m.actions || []).forEach((a) => b.append(renderAction(a, m)));
        (m.buttons || []).forEach((bt) => b.append(h('div', {}, h('button', { class: 'primary', onclick: () => { closeChatDrawer(); if (bt.act === 'tab') show(bt.tab); else { state.pendingQuery = { mode: bt.mode, text: bt.text }; show('query'); } } }, bt.label))));
        msgBox.append(h('div', { class: 'msg' }, b));
      }
    });
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  async function preview() {
    try {
      const ctx = await buildContext();
      const sys = chatSystemPrompt(ctx.text);
      const draft = input.value.trim();
      showText('Ce qui sera envoyé au fournisseur IA', `${chatPrefs.confidential ? '🔒 Mode confidentiel : aucune valeur d\'enregistrement.\n' : '⚠ Mode standard : des valeurs peuvent être transmises (formulaire, résultats de requêtes).\n'}${ctx.missing.length ? `Contexte indisponible : ${ctx.missing.join(', ')}\n` : ''}\n=== INSTRUCTIONS + CONTEXTE ===\n${sys}\n\n=== CONVERSATION ===\n${chat.conv.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => `[${m.role}] ${clip(m.content, 1500)}`).join('\n\n')}${draft ? `\n\n[user — brouillon] ${draft}` : ''}${chat.atts.length ? `\n\n[Pièces jointes] ${chat.atts.map((a) => a.name).join(', ')}` : ''}\n\n≈ ${estTokens(sys) + estTokens(draft)} tokens pour le contexte + brouillon (estimation).`);
    } catch (e) { toast(e.message, true); }
  }

  async function agentLoop() {
    for (let step = 0; step < 6; step++) {
      status.textContent = step ? `🔧 Tour ${step + 1}…` : '⏳ L\'IA réfléchit…';
      const ctx = await buildContext();
      const system = chatSystemPrompt(ctx.text);
      const apiMsgs = chat.conv.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));
      const reply = String(await askAI(system, apiMsgs, { maxTokens: 3000 }) || '');
      chat.conv.tokens = (chat.conv.tokens || 0) + estTokens(system) + apiMsgs.reduce((n, m) => n + estTokens(m.content), 0) + estTokens(reply);
      const calls = [];
      reply.replace(/<tool>\s*([\s\S]*?)\s*<\/tool>/g, (_, j) => { calls.push(j); return ''; });
      const msg = { role: 'assistant', content: reply, text: reply.replace(/<tool>[\s\S]*?<\/tool>/g, '').trim(), tools: [], actions: [], buttons: [] };
      chat.conv.messages.push(msg);
      if (!calls.length) { renderMsgs(); return; }
      chatCtx.ui = msg;
      const results = [];
      for (const raw of calls.slice(0, 4)) {
        let call_ = null;
        try { call_ = JSON.parse(raw); } catch (e) { results.push(`<result name="?">Erreur : JSON d'appel invalide.</result>`); continue; }
        const tool = CHAT_TOOLS[call_.name];
        if (!tool) { msg.tools.push({ name: call_.name, args: call_.args, ok: false, err: 'outil inconnu' }); results.push(`<result name="${call_.name}">Outil inconnu.</result>`); continue; }
        status.textContent = `🔧 ${call_.name}…`;
        try {
          const r = await tool.run(call_.args || {});
          msg.tools.push({ name: call_.name, args: call_.args, ok: true });
          results.push(`<result name="${call_.name}">${clip(r, 6000)}</result>`);
        } catch (e) { msg.tools.push({ name: call_.name, args: call_.args, ok: false, err: e.message }); results.push(`<result name="${call_.name}">Erreur : ${e.message}</result>`); }
      }
      chat.conv.messages.push({ role: 'user', content: `Résultats des outils :\n${results.join('\n')}`, hidden: true });
      renderMsgs();
    }
    chat.conv.messages.push({ role: 'assistant', content: 'Limite de 6 tours d\'outils atteinte.', text: '_Limite de 6 tours d\'outils atteinte : reformulez ou précisez la demande._' });
  }

  async function send(text) {
    if (chat.busy) return;
    text = String(text ?? input.value).trim();
    if (!text && !chat.atts.length) return;
    const atts = chat.atts.splice(0);
    chat.conv.messages.push({ role: 'user', content: text + atts.map((a) => `\n\n[Pièce jointe : ${a.name}]\n${a.text}`).join(''), shown: text, atts: atts.map((a) => a.name) });
    input.value = '';
    drawAtts(); renderMsgs();
    chat.busy = true; sendBtn.disabled = true;
    try { await agentLoop(); } catch (e) { chat.conv.messages.push({ role: 'error', content: e.message }); }
    chat.busy = false; sendBtn.disabled = false; status.textContent = '';
    renderMsgs(); drawConvs(); drawFoot(); chatSaveHistory();
  }

  function attachView() {
    const v = document.getElementById('view');
    if (!v) return;
    const clone = v.cloneNode(true);
    clone.querySelectorAll('.chat-root, button, .tablebar, script, style').forEach((n) => n.remove());
    const text = clone.textContent.replace(/\s+/g, ' ').trim();
    const name = `Onglet « ${TITLES[(location.hash || '').slice(1)] || 'affiché'} »`;
    if (!text) { toast('Rien à joindre sur cet onglet.', true); return; }
    chat.atts.push({ name, text: clip(text, 8000) });
    drawAtts();
  }

  sendBtn.onclick = () => send();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  convSel.onchange = () => { const c = chat.history.find((x) => x.id === convSel.value); if (c) { chat.conv = c; renderMsgs(); drawFoot(); } };

  const el = h('div', { class: 'chat-root' },
    h('div', { class: 'chat-bar' }, convSel,
      h('button', { onclick: () => { chat.conv = newConv(); renderMsgs(); drawConvs(); drawFoot(); } }, '＋ Nouvelle'),
      h('button', { onclick: async () => { chat.history = chat.history.filter((c) => c.id !== chat.conv.id); chat.conv = chat.history[0] || newConv(); await chatSaveHistory(); renderMsgs(); drawConvs(); drawFoot(); } }, 'Supprimer'),
      h('button', { class: 'danger', onclick: async () => { if (await confirmBox('Effacer toutes les conversations enregistrées sur cet ordinateur ?', { danger: true, confirmText: 'Tout effacer' })) { chat.history = []; chat.conv = newConv(); await chrome.storage.local.set({ chatHistory: [] }); renderMsgs(); drawConvs(); } } }, 'Tout effacer')),
    ctxBox, msgBox, status, attBox,
    h('div', { class: 'chat-compose' }, input,
      h('div', { class: 'chat-actions' }, h('button', { title: 'Joindre le contenu de l\'onglet affiché', onclick: attachView }, '📎 Joindre l\'onglet'), sendBtn)),
    foot);
  el.refresh = () => { drawCtx(); drawAtts(); drawConvs(); drawFoot(); renderMsgs(); };
  el.focusInput = () => input.focus();
  el.send = send;
  el.addAtt = (a) => { chat.atts.push(a); drawAtts(); };
  return el;
}

async function ensureChat() {
  if (!chat.el) { await chatLoad(); chat.el = buildChatEl(); }
  chat.el.refresh();
  return chat.el;
}

// ---------------------------------------------------------------------
// Panneau latéral + bouton flottant + onglet plein écran
// ---------------------------------------------------------------------
let drawer = null, fab = null;
function closeChatDrawer() { if (drawer) drawer.classList.remove('open'); updateFab(); }
function updateFab() { if (fab) fab.hidden = (location.hash || '').slice(1) === 'chat' || (drawer && drawer.classList.contains('open')); }
async function openChatDrawer() {
  if ((location.hash || '').slice(1) === 'chat') return;
  const el = await ensureChat();
  drawer.querySelector('.drawer-body').replaceChildren(el);
  drawer.classList.add('open');
  updateFab();
  el.focusInput();
}
async function openChatWith({ prompt, attachment, send } = {}) {
  if ((location.hash || '').slice(1) !== 'chat') await openChatDrawer(); else await ensureChat();
  if (attachment) chat.el.addAtt(attachment);
  if (prompt) { chat.el.querySelector('.chat-input').value = prompt; if (send) chat.el.send(); }
  chat.el.focusInput();
}
async function askAboutTable(name, data, cols) {
  const cfg = await getAiCfg().catch(() => ({ provider: 'anthropic' }));
  const who = (AI_PROVIDERS[cfg.provider] || {}).label || 'le fournisseur IA';
  const ok = await confirmBox(`Les ${Math.min(40, data.length)} premières lignes de « ${name} » (${cols.length} colonnes) seront envoyées à ${who}. Elles peuvent contenir des données d'enregistrements${cfg.mask === false ? '' : ' (e-mails, téléphones et IBAN sont masqués)'}. Continuer ?`, { confirmText: 'Envoyer à l\'IA' });
  if (!ok) return;
  const lines = [cols.join(' | '), ...data.slice(0, 40).map((r) => cols.map((c) => String(shortVal(r[c]) ?? '').replace(/\s+/g, ' ')).join(' | '))];
  openChatWith({ attachment: { name: `Tableau « ${name} » (${Math.min(40, data.length)}/${data.length} lignes)`, text: clip(lines.join('\n'), 8000) }, prompt: 'Analyse ce tableau : points d\'attention, anomalies, et actions recommandées.' });
}

tabs.chat = async (root) => {
  closeChatDrawer();
  const el = await ensureChat();
  root.append(el);
  updateFab();
  el.focusInput();
};

window.addEventListener('DOMContentLoaded', () => {
  drawer = h('aside', { class: 'chat-drawer', id: 'chatDrawer' },
    h('div', { class: 'drawer-head' }, h('b', {}, '💬 Chat IA'),
      h('span', { class: 'grow' }),
      h('button', { title: 'Ouvrir en pleine page', onclick: () => { closeChatDrawer(); show('chat'); } }, '⤢'),
      h('button', { title: 'Fermer', onclick: closeChatDrawer }, '✕')),
    h('div', { class: 'drawer-body' }));
  fab = h('button', { class: 'chat-fab', id: 'chatFab', title: 'Chat IA', onclick: openChatDrawer }, '💬');
  document.body.append(drawer, fab);
  window.addEventListener('hashchange', updateFab);
  updateFab();
});
