'use strict';
// Anglais. Clé = texte français exact affiché par l'interface.
I18N.addTabs('en', {
  title: {
    home: 'Dashboard', chat: 'AI chat', ai: 'AI settings', query: 'Queries', data: 'Test data & import', gen: 'Test data (model)', meta: 'Metadata',
    perf: 'Performance analysis', inspect: 'Form inspector', fdebug: 'Form debug', impact: 'Impact analysis', steps: 'Plug-in steps', traces: 'Plug-in traces',
    async: 'System jobs', audit: 'Audit log', security: 'Security', imp: 'Impersonation', sdoc: 'Solution documentation', doc: 'Data dictionary',
    cmp: 'Compare environments', orphan: 'Items outside solutions', sol: 'Solutions & roles', flows: 'Flows', fhealth: 'Flow health', env: 'Environment',
  },
  desc: {
    home: 'Overview of the environment: model, solutions, automation, system jobs and connected user.',
    query: 'Run FetchXML, OData or raw Web API calls, then export the result.',
    data: 'Generate test data, import a CSV or update records in bulk, with simulation and confirmation.',
    meta: 'Explore the tables, columns, option sets and relationships of the environment.',
    impact: 'Find where a column, table or component is used before changing it.',
    steps: 'Assemblies, plug-ins then steps: drill down, enable or disable a step.',
    traces: 'Read plug-in traces and have the AI explain them.',
    async: 'Follow system jobs (failures, waiting) and retry them.',
    audit: 'Change history of a record.',
    inspect: 'Form fields, scripts, network calls, JavaScript errors and web resources.',
    security: 'Understand why a user has (or lacks) access, and compare two roles.',
    imp: 'Run Workbench requests on behalf of another user.',
    doc: 'Produce the data dictionary as Excel or Word.',
    sol: 'Solutions, security roles and users.',
    flows: 'Dataverse cloud flows and run history.',
    env: 'Organization, user information and admin links.',
    sdoc: 'Pick solutions: Xrmkit collects every component and builds illustrated documentation (architecture, ER, use cases).',
    chat: 'Chat with an AI that knows the page, the table and the errors; it reads your metadata and proposes actions you approve.',
    cmp: 'Compare two open environments live (solutions, plug-ins, flows, roles, variables…) and export a delivery report.',
    perf: 'Measure a page load: API calls, duplicates, heavy scripts and blocking tasks, with statistics and history.',
    fdebug: 'Scripts, handlers, fields and sections of the open form, plus live change watching.',
    fhealth: 'Failed, suspended or idle flows, or flows whose owner is disabled.',
    orphan: 'Custom components missing from all your solutions: the oversights before a deployment.',
    gen: 'Generate consistent test data from the table model (types, required fields, lookups).',
    ai: 'Generate queries with Claude, ChatGPT or Cloudflare Workers AI.',
  },
});

I18N.add('en', {
  // groupes
  'Tableau de bord': 'Dashboard', 'Assistant IA': 'AI assistant', 'Données': 'Data', 'Technique': 'Technical', 'Sécurité': 'Security', 'Fonctionnel': 'Functional', 'Environnements': 'Environments',
  'Menu': 'Menu', 'Outils': 'Tools',
  // coque
  'Rechercher un outil…  ( / )': 'Search a tool…  ( / )', 'Connexion…': 'Connecting…', 'Non connecté': 'Not connected', 'Développé par': 'Developed by',
  'Langue': 'Language', 'Mode sombre': 'Dark mode', 'Mode clair': 'Light mode', 'Notifications': 'Notifications', 'Utilisateur connecté': 'Signed-in user',
  'Aucune erreur JavaScript récente sur la page.': 'No recent JavaScript errors on the page.', 'Erreurs JavaScript récentes': 'Recent JavaScript errors',
  'Réduire le menu': 'Collapse menu', 'Accueil': 'Home',
  // boutons / libellés communs
  'Actualiser': 'Refresh', 'Afficher': 'Show', 'Analyser': 'Analyze', 'Annuler': 'Cancel', 'Charger': 'Load', 'Chercher': 'Search', 'Comparer': 'Compare', 'Confirmation': 'Confirmation',
  'Créer': 'Create', 'Désactiver': 'Disable', 'Enregistrer': 'Save', 'Envoyer': 'Send', 'Exécuter': 'Run', 'Fermer': 'Close', 'Générer': 'Generate', 'Importer': 'Import',
  'Recharger': 'Reload', 'Saisie': 'Input', 'Simuler': 'Simulate', 'Copier': 'Copy', 'Copié ✓': 'Copied ✓', 'Valider': 'Confirm', 'Tout effacer': 'Clear all', 'Supprimer': 'Delete', 'Nouvelle': 'New',
  'Export CSV': 'Export CSV', 'Export JSON': 'Export JSON', 'Excel (.xlsx)': 'Excel (.xlsx)', 'Excel (inventaire)': 'Excel (inventory)', 'Markdown + Mermaid': 'Markdown + Mermaid',
  'Exporter en Excel (.xlsx)': 'Export to Excel (.xlsx)', 'Exporter en Word (.docx)': 'Export to Word (.docx)', 'Rapport de livraison': 'Delivery report', 'Rapport de livraison Word (.docx)': 'Delivery report Word (.docx)',
  'Filtrer…': 'Filter…', 'Retour à la ligne': 'Wrap text', 'Aucun résultat.': 'No results.', 'Chargement…': 'Loading…', 'Détail': 'Detail', 'Diagnostic': 'Diagnosis',
  "✨ Demander à l'IA": '✨ Ask the AI', 'Joindre ce tableau au chat IA': 'Attach this table to the AI chat', '👁 Voir ce qui part': '👁 See what is sent', "📎 Joindre l'onglet": '📎 Attach the tab',
  'Nouvelle conversation': 'New conversation', 'Conversations enregistrées': 'Saved conversations', 'Ouvrir en pleine page': 'Open full page', '— choisir —': '— choose —', '← Retour aux utilisateurs': '← Back to users',
  // dashboard
  'Tables': 'Tables', 'Tables personnalisées': 'Custom tables', 'Solutions': 'Solutions', 'Étapes de plug-ins': 'Plug-in steps', 'Flux cloud': 'Cloud flows', 'Flux': 'Flows',
  'Modèle': 'Model', 'Configuration': 'Configuration', 'Logique': 'Logic', 'Automatisation': 'Automation', 'Quotidien': 'Daily', 'Hebdomadaire': 'Weekly', 'Mensuel': 'Monthly', 'Temps réel': 'Live',
  'Automatisations par catégorie': 'Automation by category', 'Santé des flux': 'Flow health', 'Flux activés': 'Active flows', 'Tâches système en échec': 'Failed system jobs',
  'Solutions récemment modifiées': 'Recently modified solutions', 'Dernières 14 jours': 'Last 14 days', 'Éditeur': 'Publisher', 'Modifiée': 'Modified', 'Version': 'Version',
  'Actualiser le tableau de bord': 'Refresh dashboard', 'Aucune donnée.': 'No data.', 'Rôles': 'Roles', 'Unité commerciale': 'Business unit', 'E-mail': 'Email', 'Fonction': 'Job title',
  // performance
  'Analyser la page actuelle': 'Analyze current page', 'Recharger puis mesurer': 'Reload then measure', 'Score de performance': 'Performance score', 'Historique des mesures': 'Measurement history',
  'Temps cumulé par catégorie': 'Cumulative time by category', 'Appels API les plus lents': 'Slowest API calls', 'Appels répétés': 'Repeated calls', 'Scripts les plus lourds': 'Heaviest scripts',
  'Par catégorie': 'By category', 'Réponse serveur (TTFB)': 'Server response (TTFB)', 'DOM interactif': 'DOM interactive', 'Chargement complet': 'Full load', 'Appels API Web': 'Web API calls',
  'Tâches longues': 'Long tasks', 'Mémoire JS': 'JS memory', 'Cascade des appels': 'Request timeline', 'Requêtes démarrées par seconde': 'Requests started per second',
  'Pas encore de mesure : lancez une analyse pour alimenter l\'historique.': 'No measurement yet: run an analysis to build the history.', 'Excellent': 'Excellent', 'À améliorer': 'Needs work', 'Critique': 'Critical',
  'Appels Web API de la page': 'Page Web API calls', 'Catégorie': 'Category', 'Requêtes': 'Requests', 'Durée cumulée': 'Cumulative time', 'Taille transférée': 'Transferred size',
  // en-têtes de tableaux
  'Activé': 'Enabled', 'Bibliothèque': 'Library', 'Clé': 'Key', 'Valeur': 'Value', 'Code erreur': 'Error code', 'Concerne': 'Applies to', 'Date': 'Date', 'Dernier échec': 'Last failure',
  'Durée (ms)': 'Duration (ms)', 'Durée cumulée (ms)': 'Cumulative time (ms)', 'Durée moyenne': 'Average duration', 'Début (ms)': 'Start (ms)', 'Désactivé': 'Disabled', 'Entité liée': 'Related table',
  'Exécutions': 'Runs', 'Gain possible (ms)': 'Possible gain (ms)', 'Gérée': 'Managed', 'Libellé': 'Label', 'Message': 'Message', 'Modifié': 'Modified', 'Nom': 'Name', 'Nom complet': 'Full name',
  'Nom de schéma': 'Schema name', 'Nom logique': 'Logical name', 'Nom principal': 'Primary name', 'Nom unique': 'Unique name', 'Opération': 'Operation', 'Paramètres': 'Parameters', 'Propriétaire': 'Owner',
  'Réussies': 'Succeeded', 'Rôle': 'Role', 'Santé': 'Health', 'Seulement dans A': 'Only in A', 'Seulement dans B': 'Only in B', 'Statut': 'Status', 'Table': 'Table', 'Taille (Ko)': 'Size (KB)', 'Taille (o)': 'Size (B)',
  'Type': 'Type', 'Valeur A': 'Value A', 'Valeur B': 'Value B', 'Web resources': 'Web resources', 'Échecs': 'Failures', 'Élément': 'Item', 'Éléments': 'Items', 'Étape': 'Step', 'État': 'State', 'Événement': 'Event',
  'Constat': 'Finding', "Piste d'amélioration": 'Improvement lead', 'Appel': 'Call', 'Occurrences': 'Occurrences', 'Script': 'Script', 'Utilisée par un handler': 'Used by a handler',
  // requêtes / données
  'Requêtes enregistrées…': 'Saved queries…', 'Web API brut': 'Raw Web API', 'OData (GET)': 'OData (GET)', 'Corps JSON (POST / PATCH)…': 'JSON body (POST / PATCH)…', 'Enregistrer la requête': 'Save query',
  'Lire le modèle': 'Read the model', 'Créer les enregistrements': 'Create records', 'Supprimer les données de test': 'Delete test data', 'Modification en masse': 'Bulk update',
  'Import CSV': 'CSV import', 'Valider (simulation)': 'Validate (dry run)', 'Jeux de données de test': 'Test data sets', 'Toutes les colonnes remplissables': 'All fillable columns', 'Colonnes obligatoires seulement': 'Required columns only',
  'Attributs': 'Attributes', 'Option sets': 'Option sets', 'Relations': 'Relationships', 'Toutes les entités': 'All tables', 'Champs': 'Fields', 'Champs du formulaire': 'Form fields',
  'Lister les champs': 'List fields', 'Analyser le formulaire': 'Analyze the form', 'Analyser le formulaire ouvert': 'Analyze the open form', 'Événements et handlers': 'Events and handlers', 'Onglets et sections': 'Tabs and sections',
  'Scripts et événements (FormXML)': 'Scripts and events (FormXML)', 'Bibliothèques JavaScript': 'JavaScript libraries', '▶ Surveiller les changements': '▶ Watch changes', 'Surveillance en direct': 'Live watching',
  'Assemblies': 'Assemblies', 'Charger les runs': 'Load runs', "Charger l'historique": 'Load history', 'Historique des exécutions': 'Run history', 'Vider le journal': 'Clear log',
  'Détail de la trace': 'Trace detail', 'Rôles de sécurité': 'Security roles', "Rôles de l'utilisateur": 'User roles', 'Utilisateurs & rôles': 'Users & roles', 'Pourquoi cet accès ?': 'Why this access?',
  "Analyser l'accès": 'Analyze access', 'Comparer deux rôles de sécurité': 'Compare two security roles', 'Tester (WhoAmI)': 'Test (WhoAmI)', 'Comparer en direct': 'Compare live', 'Catégories à comparer': 'Categories to compare',
  'Capturer cet environnement': 'Capture this environment', 'Flows cloud (Dataverse)': 'Cloud flows (Dataverse)', 'Lister les flows': 'List flows', 'Tous statuts': 'All statuses', 'Suspendues': 'Suspended', 'En attente': 'Waiting', 'En cours': 'Running',
  // IA & doc
  'Générer une requête': 'Generate a query', 'Tester la connexion': 'Test connection', 'Réglages IA': 'AI settings', 'Session du navigateur (effacées à la fermeture)': 'Browser session (cleared on close)',
  'Coffre chiffré sur ce poste (mot de passe)': 'Encrypted vault on this computer (password)', 'Où conserver les clés API': 'Where to keep API keys', 'Chiffrer les clés IA': 'Encrypt AI keys', 'Déverrouiller les clés IA': 'Unlock AI keys',
  'Envoyer à l\'IA': 'Send to AI', 'Synthèse': 'Summary', 'Points d\'attention': 'Points of attention', '1. Solutions à documenter': '1. Solutions to document', '2. Contenu': '2. Content', '3. Générer': '3. Generate',
  'Titre du document': 'Document title', 'Client / projet (optionnel)': 'Client / project (optional)', 'Auteur (optionnel)': 'Author (optional)', 'Tout décocher': 'Uncheck all', 'Cocher les non gérées': 'Check unmanaged ones',
  'Filtrer les solutions…': 'Filter solutions…', '📘 Collecter et générer la documentation': '📘 Collect and generate the documentation', '⬇ HTML (design complet)': '⬇ HTML (full design)',
  'Word (.docx)': 'Word (.docx)', 'Envoyer vers l\'éditeur de requêtes': 'Send to the query editor', 'Copier la requête': 'Copy query',
  // placeholders
  'nom logique (ex. account)': 'logical name (e.g. account)', 'colonne (nom logique)': 'column (logical name)', 'colonne (optionnel)': 'column (optional)', 'Nom contient…': 'Name contains…', 'Type contient…': 'Type contains…',
  "Nom d'utilisateur contient…": 'User name contains…', 'Message (Create, Update…)': 'Message (Create, Update…)', 'texte à chercher (ex. nom de colonne, fonction)': 'text to search (e.g. column name, function)',
  "GUID de l'enregistrement": 'Record GUID', 'nouvelle valeur (NULL pour vider)': 'new value (NULL to clear)', '0 = pas de limite': '0 = no limit',
  'Entité principale (optionnel)': 'Main table (optional)', 'Inclure les noms de champs': 'Include field names',
});

I18N.addPatterns('en', [
  [/^(\d+) ligne\(s\)$/, (m) => `${m[1]} row(s)`],
  [/^(\d+) ligne\(s\) \(1000 affichées, filtrez ou exportez\)$/, (m) => `${m[1]} row(s) (1000 shown, filter or export)`],
  [/^Chargement de (.+)$/, (m) => `Loading ${m[1]}`],
  [/^(\d+) composant\(s\)$/, (m) => `${m[1]} component(s)`],
  [/^Documentation prête : (\d+) composant\(s\)$/, (m) => `Documentation ready: ${m[1]} component(s)`],
  [/^Impersonation active : les requêtes s'exécutent en tant que (.+)\.$/, (m) => `Impersonation active: requests run as ${m[1]}.`],
]);

// Chaînes dynamiques (tableau de bord, performance)
I18N.add('en', {
  'Mesure le chargement de la page Dynamics connectée (formulaire, vue, tableau de bord) : temps serveur, appels API, doublons, scripts lourds, tâches qui bloquent l\'interface. Ouvrez la page à tester dans l\'onglet Dynamics, puis lancez l\'analyse.': 'Measures the load of the connected Dynamics page (form, view, dashboard): server time, API calls, duplicates, heavy scripts and tasks that block the UI. Open the page to test in the Dynamics tab, then run the analysis.',
  'Serveur': 'Server', 'Page': 'Page', 'Réseau': 'Network', 'Scripts': 'Scripts',
  'JavaScript transféré': 'JavaScript transferred', 'Aucun appel API Web enregistré.': 'No Web API call recorded.', 'Aucun appel répété.': 'No repeated call.', 'Aucun script.': 'No script.',
  "Aucun point d'attention détecté sur cette page.": 'No point of attention detected on this page.',
  'Les mesures ci-dessus servent de référence pour comparer avant/après une modification.': 'The measurements above are a baseline to compare before/after a change.',
});
I18N.addPatterns('en', [
  [/^(\d+) % perso$/, (m) => `${m[1]} % custom`], [/^(\d+) personnalisées$/, (m) => `${m[1]} custom`],
  [/^(\d+) non gérées$/, (m) => `${m[1]} unmanaged`], [/^(\d+) gérées$/, (m) => `${m[1]} managed`],
  [/^(\d+) % actives$/, (m) => `${m[1]} % active`], [/^(\d+) désactivées$/, (m) => `${m[1]} disabled`],
  [/^(\d+) % activés$/, (m) => `${m[1]} % enabled`], [/^(\d+) désactivés$/, (m) => `${m[1]} disabled`],
  [/^DOM interactif (.+)$/, (m) => `DOM interactive ${m[1]}`], [/^(.+) cumulés$/, (m) => `${m[1]} cumulative`],
  [/^(\d+) tâche\(s\) longue\(s\) · (.+)$/, (m) => `${m[1]} long task(s) · ${m[2]}`], [/^(\d+) Mo de mémoire$/, (m) => `${m[1]} MB of memory`],
  [/^(\d+) point\(s\) d'attention$/, (m) => `${m[1]} point(s) of attention`], [/^([+-]?\d+) % vs préc\.$/, (m) => `${m[1]} % vs previous`],
  [/^Table : (.+)$/, (m) => `Table: ${m[1]}`],
  [/^Chargement complet de (.+) : au-dessus de 5 s\.$/, (m) => `Full load of ${m[1]}: above 5 s.`],
  [/^Chargement de (.+)\.$/, (m) => `Load of ${m[1]}.`],
  [/^(\d+) appels API Web pendant le chargement\.$/, (m) => `${m[1]} Web API calls during load.`],
  [/^(\d+) appel\(s\) API de plus de 1,5 s\.$/, (m) => `${m[1]} API call(s) over 1.5 s.`],
  [/^(\d+) tâche\(s\) longue\(s\) \((.+) de blocage du thread\)\.$/, (m) => `${m[1]} long task(s) (${m[2]} of thread blocking).`],
  [/^(.+) de JavaScript transférés\.$/, (m) => `${m[1]} of JavaScript transferred.`],
  [/^(\d+) appel\(s\) identique\(s\) répété\(s\), gain estimé (.+)\.$/, (m) => `${m[1]} identical call(s) repeated, estimated gain ${m[2]}.`],
  [/^Réduisez les scripts chargés au démarrage.*$/, () => 'Reduce the scripts loaded at startup (onLoad libraries) and heavy sections/tabs.'],
  [/^Regroupez les requêtes.*$/, () => 'Group requests (FetchXML with link-entity, $expand) or load them on demand.'],
  [/^Ajoutez \$select \/ \$top.*$/, () => 'Add $select / $top, filter on indexed columns, avoid “contains” filters.'],
  [/^Du JavaScript synchrone bloque l'interface.*$/, () => 'Synchronous JavaScript blocks the UI: move it out of onLoad or make it asynchronous.'],
]);

I18N.add('en', {
  'Workflows': 'Workflows', 'Dialogues': 'Dialogs', 'Règles métier': 'Business rules', 'Actions': 'Actions', 'Processus métier': 'Business process flows',
  'Définitions actives et inactives (flux, workflows, règles, actions, processus)': 'Active and inactive definitions (flows, workflows, rules, actions, processes)',
  'Les 6 dernières mises à jour': 'The 6 latest updates', 'Somme des durées de requêtes (ms)': 'Sum of request durations (ms)', 'Durée en ms': 'Duration in ms',
  'Requêtes API démarrées par seconde': 'API requests started per second', 'Chargement complet (s)': 'Full load (s)', 'Dernières 14 jours': 'Last 14 days',
});

// Popup
I18N.add('en', {
  'Formulaire': 'Form', 'Naviguer': 'Navigate', 'Support & analyse': 'Support & analysis', 'Avancé': 'Advanced',
  'God Mode': 'God Mode', 'Noms logiques': 'Logical names', 'Valeurs option sets': 'Option set values', 'Champs modifiés': 'Changed fields',
  'ID': 'ID', 'URL enregistrement': 'Record URL', "Nom d'entité": 'Table name', 'URL API Web': 'Web API URL',
  "Ouvrir l'enregistrement": 'Open the record', 'Ouvrir la liste': 'Open the list', 'Recherche avancée': 'Advanced find', 'Infos environnement': 'Environment info',
  'Bug report (capture)': 'Bug report (capture)', "Historique d'audit": 'Audit history', "Analyse d'impact": 'Impact analysis', 'Inspecteur de formulaire': 'Form inspector',
  'Ouvrir le Workbench': 'Open the Workbench', 'Chat IA': 'AI chat', 'Vider le cache': 'Clear cache',
  'entité (ex. account)': 'table (e.g. account)', 'GUID (optionnel)': 'GUID (optional)', 'Fermer (Échap)': 'Close (Esc)',
  'Information': 'Information', 'Erreur': 'Error', 'God Mode activé': 'God Mode enabled', 'Environnement': 'Environment', 'Cache': 'Cache',
  'Option sets du formulaire': 'Form option sets', 'Champs modifiés (non enregistrés)': 'Changed fields (unsaved)',
  "Affichés entre crochets dans les libellés.": 'Shown in brackets in the labels.', "Libellés d'origine restaurés.": 'Original labels restored.',
  'Clé': 'Key', 'Valeur': 'Value', 'Cliquez sur une valeur pour la copier.': 'Click a value to copy it.', '✓ Contenu copié': '✓ Content copied',
  "Workbench : requêtes, données, analyse d'impact, plug-ins, audit, sécurité, dictionnaire de données, comparaison d'environnements, chat IA contextuel (Claude, ChatGPT, Cloudflare).": 'Workbench: queries, data, impact analysis, plug-ins, audit, security, data dictionary, environment comparison, contextual AI chat (Claude, ChatGPT, Cloudflare).',
  'Page non prête : ouvrez une application Dynamics 365 pilotée par modèle, puis rechargez la page (F5).': 'Page not ready: open a model-driven Dynamics 365 app, then reload the page (F5).',
});
