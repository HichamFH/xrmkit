'use strict';
// Registre d'onglets : point d'extension unique du Workbench.
//   Xrmkit.registerTab({ id: 'monOutil', group: 'Technique', order: 50, icon: 'bolt',
//     title: 'Mon outil', desc: 'Ce que fait l\'outil.', i18n: { en: { title: 'My tool', desc: '…' } },
//     render: async (root) => { root.append(h('p', {}, 'Bonjour')); } });
// Il suffit ensuite d'ajouter <script src="mon-outil.js"> dans workbench.html (avant main.js).
// `script` (optionnel) : chargement différé d'un fichier au premier affichage de l'onglet.
// Groupes de navigation (les clés absentes de TITLES / tabs sont ignorées).
const GROUPS = [
  ['Menu', ['home']],
  ['Assistant IA', ['chat', 'ai']],
  ['Données', ['query', 'data', 'gen', 'meta']],
  ['Technique', ['perf', 'inspect', 'fdebug', 'impact', 'steps', 'traces', 'async', 'audit']],
  ['Sécurité', ['security', 'imp']],
  ['Fonctionnel', ['sdoc', 'doc']],
  ['Environnements', ['cmp', 'orphan', 'sol', 'flows', 'fhealth', 'env']],
];

const ICONS = {
  home: 'home', query: 'search', data: 'flask', meta: 'folder', impact: 'network', steps: 'plug', traces: 'scroll', async: 'timer', audit: 'receipt', inspect: 'stethoscope',
  security: 'lock', imp: 'mask', doc: 'book', sol: 'box', flows: 'repeat', env: 'globe', ai: 'sparkle', cmp: 'scale', perf: 'rocket', fdebug: 'bug', fhealth: 'heart', orphan: 'broom', gen: 'dice', chat: 'chat', sdoc: 'books',
};
const DESC = {
  query: 'Exécutez du FetchXML, de l\'OData ou un appel Web API brut, puis exportez le résultat.',
  data: 'Générez des données de test, importez un CSV ou modifiez des enregistrements en masse, avec simulation et confirmation.',
  meta: 'Explorez les tables, colonnes, option sets et relations de l\'environnement.',
  impact: 'Trouvez où un champ, une table ou un composant est utilisé avant de le modifier.',
  steps: 'Assemblies, plug-ins puis étapes : sélectionnez pour descendre, activez ou désactivez une étape.',
  traces: 'Consultez les traces de plug-ins et faites-les expliquer par l\'IA.',
  async: 'Suivez les tâches système (échecs, attente) et relancez-les.',
  audit: 'Historique des modifications d\'un enregistrement.',
  inspect: 'Champs du formulaire, scripts, appels réseau, erreurs JavaScript et web resources.',
  security: 'Comprenez pourquoi un utilisateur a (ou n\'a pas) accès, et comparez deux rôles.',
  imp: 'Exécutez les requêtes du Workbench au nom d\'un autre utilisateur.',
  doc: 'Produisez le dictionnaire de données en Excel ou Word.',
  sol: 'Solutions, rôles de sécurité et utilisateurs.',
  flows: 'Flows cloud Dataverse et historique des exécutions.',
  env: 'Informations sur l\'organisation, l\'utilisateur et liens d\'administration.',
  sdoc: 'Choisissez des solutions : Xrmkit collecte tous leurs composants et produit une documentation illustrée (architecture, ER, cas d\'utilisation).',
  chat: 'Discutez avec une IA qui connaît la page, la table et les erreurs ; elle lit vos métadonnées et propose des actions que vous validez.',
  cmp: 'Comparez en direct deux environnements ouverts (solutions, plug-ins, flux, rôles, variables…) et exportez un rapport de livraison.',
  perf: 'Mesurez le chargement d\'une page : appels API, doublons, scripts lourds et tâches bloquantes.',
  fdebug: 'Scripts, handlers, champs et sections du formulaire ouvert, plus surveillance des changements en direct.',
  fhealth: 'Flux en échec, suspendus, sans activité ou dont le propriétaire est désactivé.',
  orphan: 'Composants personnalisés absents de toutes vos solutions : les oublis avant un déploiement.',
  gen: 'Générez des données de test cohérentes à partir du modèle de la table (types, obligatoires, liens).',
  ai: 'Générez des requêtes avec Claude, ChatGPT ou Cloudflare Workers AI.',
};


const Xrmkit = {
  registerTab(def) {
    if (!def || !def.id || (!def.render && !def.script)) throw new Error('registerTab : id et render (ou script) requis');
    TITLES[def.id] = def.title || def.id;
    if (def.desc) DESC[def.id] = def.desc;
    if (def.icon) ICONS[def.id] = def.icon;
    if (def.i18n) Object.entries(def.i18n).forEach(([lang, v]) => I18N.addTabs(lang, { title: { [def.id]: v.title }, desc: { [def.id]: v.desc } }));
    tabs[def.id] = def.render || (async (root) => { await loadScript(def.script); return tabs[def.id](root); });
    if (def.group) {
      let g = GROUPS.find(([name]) => name === def.group);
      if (!g) { g = [def.group, []]; GROUPS.push(g); }
      if (!g[1].includes(def.id)) { if (def.order != null && def.order < g[1].length) g[1].splice(def.order, 0, def.id); else g[1].push(def.id); }
    }
  },
  // Onglet dont le code est chargé à la demande (le script redéfinit tabs[id] en s'exécutant).
  lazy(id, scripts) {
    tabs[id] = async (root) => { for (const s of scripts) await loadScript(s); return tabs[id](root); };
  },
};
