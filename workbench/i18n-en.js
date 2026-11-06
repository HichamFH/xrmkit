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

// ---- Cartographie des processus, rapport d'accès, rapports Word à partir d'un modèle (v0.9)
I18N.add('en', {
  // modèles Word
  'Rapport Word à partir de votre modèle': 'Word report from your template',
  'Importez un document Word contenant des balises {{…}} : Xrmkit le remplit avec les données de cet écran et produit un .docx qui garde votre mise en forme. Le modèle reste dans votre navigateur.': 'Import a Word document containing {{…}} tags: Xrmkit fills it with the data of this screen and produces a .docx that keeps your formatting. The template stays in your browser.',
  'Importer un modèle (.docx)': 'Import a template (.docx)', 'Générer le rapport': 'Generate the report', 'Supprimer le modèle': 'Delete the template', 'Télécharger un modèle de départ': 'Download a starter template',
  'Balises disponibles': 'Available tags', '— choisir un modèle —': '— choose a template —', '— aucun modèle importé —': '— no template imported —',
  'Choisissez un fichier Word (.docx ou .dotx).': 'Choose a Word file (.docx or .dotx).', 'Modèle trop volumineux (3 Mo maximum).': 'Template too large (3 MB maximum).',
  'Importez puis sélectionnez un modèle Word.': 'Import then select a Word template.', 'Génération…': 'Generating…', '✓ Balise copiée': '✓ Tag copied',
  'Aucune balise {{…}} détectée : le document sera copié tel quel. Téléchargez le modèle de départ pour voir la syntaxe.': 'No {{…}} tag detected: the document will be copied as is. Download the starter template to see the syntax.',
  'Écrivez ces balises dans votre document Word ; elles sont remplacées à la génération. Cliquez sur une balise pour la copier.': 'Write these tags in your Word document; they are replaced on generation. Click a tag to copy it.',
  'Boucle : placez {{#liste}} au début et {{/liste}} à la fin d\'une ligne de tableau (la ligne est répétée) ou de paragraphes. Les balises fonctionnent aussi dans l\'en-tête et le pied de page.': 'Loop: put {{#list}} at the start and {{/list}} at the end of a table row (the row is repeated) or of paragraphs. Tags also work in the header and footer.',
  'Balise': 'Tag', 'Valeur': 'Value', 'Boucle': 'Loop', 'Description': 'Description',
  'Fichier invalide : ce n\'est pas une archive Word (.docx).': 'Invalid file: not a Word archive (.docx).',
  'Document chiffré : retirez le mot de passe du modèle.': 'Encrypted document: remove the password from the template.',
  'Modèle trop volumineux une fois décompressé.': 'Template too large once decompressed.', 'Archive corrompue.': 'Corrupted archive.',
  // balises communes
  'Environnement': 'Environment', 'Date de génération': 'Generation date', 'Gravité': 'Severity', 'Type': 'Type', 'Niveau': 'Level', 'Source': 'Source', 'Table': 'Table',
  'Libellé': 'Label', 'Nom logique': 'Logical name', 'Colonnes': 'Columns', 'Relations': 'Relationships', 'Listes de valeurs': 'Value lists', 'Tables': 'Tables', 'Informations générales': 'General information',
  // cartographie
  'Pré-validation (10)': 'Pre-validation (10)', 'Pré-opération (20)': 'Pre-operation (20)', 'Principal (30)': 'Main (30)', 'Post-opération synchrone': 'Synchronous post-operation',
  'Asynchrone': 'Asynchronous', 'Synchrone': 'Synchronous', 'Synchrone (temps réel)': 'Synchronous (real-time)', 'Plug-in': 'Plug-in', 'Règle métier': 'Business rule', 'Action': 'Action', 'Processus': 'Process', 'Workflow': 'Workflow',
  'Formulaire / serveur': 'Form / server', 'À la demande': 'On demand', 'À la demande / processus': 'On demand / process', 'Suspendu': 'Suspended', 'Brouillon': 'Draft', 'Activé': 'Enabled', 'Désactivé': 'Disabled',
  'Plug-ins…': 'Plug-ins…', 'Workflows et règles…': 'Workflows and rules…', 'Flux cloud…': 'Cloud flows…',
  'Nom': 'Name', 'Mode': 'Mode', 'Événement': 'Event', 'Filtre (attributs)': 'Filter (attributes)', 'État': 'State', 'Effets sur d\'autres tables': 'Effects on other tables', 'Rang': 'Rank',
  'Déclencheur': 'Trigger', 'Automatisation': 'Automation', 'Effets': 'Effects', 'Action utilisateur / API': 'User action / API',
  'Création': 'Creation', 'Modification': 'Update', 'Suppression': 'Deletion', 'Tous les événements': 'All events', 'Autre': 'Other',
  'Cartographie des processus': 'Process map',
  'Table (nom logique)': 'Table (logical name)', 'Table (libellé)': 'Table (label)', 'Événement analysé': 'Analyzed event', 'Nombre d\'automatisations': 'Number of automations',
  'Dont synchrones': 'Of which synchronous', 'Dont asynchrones': 'Of which asynchronous', 'Dont désactivées': 'Of which disabled', 'Nombre de déclenchements en cascade': 'Number of cascading triggers',
  'Nombre de points d\'attention': 'Number of points of attention', 'Diagramme Mermaid (texte)': 'Mermaid diagram (text)', 'Automatisations de la table': 'Automations of the table',
  'Filtre': 'Filter', 'Déclenchements en cascade': 'Cascading triggers',
  'table (nom logique)': 'table (logical name)', 'Inclure les composants gérés': 'Include managed components', 'Recharger les données': 'Reload data', 'Analyser': 'Analyze',
  'Rapport Word (.docx)': 'Word report (.docx)', 'Excel (.xlsx)': 'Excel (.xlsx)', 'Diagramme (.svg)': 'Diagram (.svg)', 'Copier en Mermaid': 'Copy as Mermaid',
  'Choisissez une table : Xrmkit lit les plug-ins, flux cloud, workflows et règles de l\'environnement, puis montre ce qui se déclenche, dans quel ordre, et les cascades vers d\'autres tables.': 'Choose a table: Xrmkit reads the environment\'s plug-ins, cloud flows, workflows and rules, then shows what fires, in which order, and the cascades to other tables.',
  'Saisissez le nom logique d\'une table (ex. account).': 'Enter the logical name of a table (e.g. account).',
  'Points d\'attention': 'Points of attention', 'Aucun point d\'attention détecté.': 'No point of attention detected.', 'Aucun point d\'attention détecté sur les automatisations connues.': 'No point of attention detected on the known automations.',
  'Ordre d\'exécution': 'Execution order',
  'Dataverse exécute : règles → pré-validation → pré-opération → opération → post-opération synchrone ; puis, en différé, plug-ins asynchrones, flux et workflows asynchrones. Les composants désactivés sont en pointillés.': 'Dataverse runs: rules → pre-validation → pre-operation → operation → synchronous post-operation; then, deferred, asynchronous plug-ins, flows and workflows. Disabled components are dashed.',
  'Aucune automatisation connue sur cette table.': 'No known automation on this table.', 'Cascades': 'Cascades', 'Automatisations': 'Automations',
  'Ce qui se déclenche quand un flux cloud écrit dans une autre table (ou dans la même). Les plug-ins ne sont pas analysés en profondeur : leur code peut modifier d\'autres tables sans que Xrmkit puisse le voir.': 'What fires when a cloud flow writes to another table (or the same one). Plug-ins are not analyzed in depth: their code may change other tables without Xrmkit being able to see it.',
  'Cascade tronquée (trop de chemins) : affinez l\'événement ou la table.': 'Cascade truncated (too many paths): narrow down the event or the table.',
  'Aucune cascade : aucun flux ne déclenche d\'autre automatisation à partir de cette table.': 'No cascade: no flow triggers another automation from this table.',
  'Aucune cascade à exporter.': 'No cascade to export.', 'Lancez d\'abord une analyse.': 'Run an analysis first.', '✓ Diagramme Mermaid copié': '✓ Mermaid diagram copied',
  'Fichier Excel généré.': 'Excel file generated.', 'Document Word généré.': 'Word document generated.', 'Aucune': 'None', 'Aucune.': 'None.',
  // rapport d'accès
  'Rapport d\'accès utilisateur': 'User access report', 'Mon compte': 'My account',
  'Cherchez un utilisateur puis cliquez sur sa ligne : Xrmkit calcule ses droits effectifs (rôles directs + équipes) et signale ce qui mérite une revue.': 'Search for a user then click their row: Xrmkit computes their effective rights (direct roles + teams) and flags what deserves a review.',
  'Choisissez d\'abord un utilisateur.': 'Choose a user first.', 'Utilisateur courant introuvable.': 'Current user not found.', 'Identifiant utilisateur invalide.': 'Invalid user identifier.',
  'Utilisateur…': 'User…', 'Rôles directs…': 'Direct roles…', 'Équipes…': 'Teams…', 'Rôles des équipes…': 'Team roles…', 'Droits effectifs…': 'Effective rights…', 'Droits calculés depuis les rôles…': 'Rights computed from roles…',
  'privilèges des rôles (repli : RetrieveUserPrivileges indisponible)': 'role privileges (fallback: RetrieveUserPrivileges unavailable)',
  'Propriétaire': 'Owner', 'Accès': 'Access', 'Groupe de sécurité Entra ID': 'Entra ID security group', 'Groupe Office Entra ID': 'Entra ID Office group',
  'Direct': 'Direct', 'Rôle': 'Role', 'Rôles': 'Roles', 'Équipe': 'Team', 'Équipes': 'Teams', 'Compte': 'Account', 'Compte désactivé': 'Account disabled', 'Responsable': 'Manager', 'Fonction': 'Job title', 'Unité commerciale': 'Business unit',
  'Droits calculés par': 'Rights computed by', 'Droits par table': 'Rights by table', 'Autres droits (hors tables)': 'Other rights (non-table)', 'Droit': 'Right', 'Sensible': 'Sensitive',
  'Créer': 'Create', 'Lire': 'Read', 'Écrire': 'Write', 'Supprimer': 'Delete', 'Ajouter à': 'Append to', 'Ajouter': 'Append', 'Attribuer': 'Assign', 'Partager': 'Share', 'Suppr.': 'Del.', 'Attrib.': 'Assign',
  'Aucun droit sur les tables.': 'No table rights.', 'Aucun droit.': 'No rights.', 'Aucun droit': 'No rights', 'Autres droits': 'Other rights', 'Aucun rôle.': 'No roles.', 'Aucune équipe.': 'No teams.',
  'Niveau le plus élevé obtenu par cumul des rôles et des équipes : Util. = ses propres enregistrements, UC = son unité commerciale, UC+ = UC et enfants, Org = toute l\'organisation, - = aucun droit.': 'Highest level obtained by combining roles and teams: Util. = own records, UC = own business unit, UC+ = business unit and children, Org = whole organization, - = no right.',
  'Tables personnalisées seulement': 'Custom tables only',
  'Nombre de rôles': 'Number of roles', 'Nombre d\'équipes': 'Number of teams', 'Tables avec des droits': 'Tables with rights',
  'Tables en lecture niveau Organisation': 'Tables readable at Organization level', 'Tables en écriture niveau Organisation': 'Tables writable at Organization level', 'Tables en suppression niveau Organisation': 'Tables deletable at Organization level',
  'Utilisateur': 'User', 'UC et enfants': 'BU and children', 'Organisation': 'Organization',
  // dictionnaire (modèle)
  'Dictionnaire de données': 'Data dictionary',
});
I18N.addPatterns('en', [
  [/^Modèle « (.+) » importé : (\d+) balise\(s\) trouvée\(s\)\.$/, (m) => `Template “${m[1]}” imported: ${m[2]} tag(s) found.`],
  [/^Balises inconnues pour ce rapport \(elles resteront vides\) : (.+)$/, (m) => `Tags unknown for this report (they will stay empty): ${m[1]}`],
  [/^Rapport généré à partir du modèle « (.+) »\.$/, (m) => `Report generated from the template “${m[1]}”.`],
  [/^Balises du modèle sans donnée \(laissées vides\) : (.+)$/, (m) => `Template tags without data (left empty): ${m[1]}`],
  [/^Supprimer le modèle « (.+) » \?$/, (m) => `Delete the template “${m[1]}”?`],
  [/^Boucle dans (.+)$/, (m) => `Loop inside ${m[1]}`], [/^Dans la boucle (.+)$/, (m) => `Inside loop ${m[1]}`],
  [/^(\d+) automatisation\(s\)$/, (m) => `${m[1]} automation(s)`], [/^(\d+) synchrone\(s\)$/, (m) => `${m[1]} synchronous`],
  [/^(\d+) déclenchement\(s\) en cascade$/, (m) => `${m[1]} cascading trigger(s)`],
  [/^Collecte incomplète \(droits \?\) : (.+)$/, (m) => `Incomplete collection (rights?): ${m[1]}`],
  [/^Collecte incomplète \(droits insuffisants \?\) : (.+)$/, (m) => `Incomplete collection (insufficient rights?): ${m[1]}`],
  [/^Rôles \((\d+)\)$/, (m) => `Roles (${m[1]})`], [/^Équipes \((\d+)\)$/, (m) => `Teams (${m[1]})`], [/^Autres droits \((\d+)\)$/, (m) => `Other rights (${m[1]})`],
  [/^\+ (\d+) autre\(s\)$/, (m) => `+ ${m[1]} more`],
  // constats générés par logic.js
  [/^Boucle possible : « (.+) » se redéclenche via (.+) sur (.+)\.$/, (m) => `Possible loop: “${m[1]}” re-triggers itself via ${m[2]} on ${m[3]}.`],
  [/^Flux « (.+) » : modifie (.+) sans filtre d'attributs sur son propre déclencheur \(risque de boucle\)\.$/, (m) => `Flow “${m[1]}”: updates ${m[2]} without an attribute filter on its own trigger (loop risk).`],
  [/^(\d+) plug-in\(s\) synchrone\(s\) sur la modification sans filtre d'attributs : (.+)$/, (m) => `${m[1]} synchronous plug-in(s) on update without an attribute filter: ${m[2]}`],
  [/^(\d+) automatisations synchrones sur cette table : la durée d'enregistrement s'additionne\.$/, (m) => `${m[1]} synchronous automations on this table: save duration adds up.`],
  [/^(\d+) automatisation\(s\) désactivée\(s\) ou en brouillon : (.+)$/, (m) => `${m[1]} automation(s) disabled or in draft: ${m[2]}`],
  [/^Rôle « Administrateur système » : accès complet à tout l'environnement\.$/, () => 'Role “System Administrator”: full access to the whole environment.'],
  [/^Suppression au niveau Organisation sur (\d+) table\(s\)(.*)$/, (m) => `Delete at Organization level on ${m[1]} table(s)${m[2]}`],
  [/^Écriture au niveau Organisation sur (\d+) tables\.$/, (m) => `Write at Organization level on ${m[1]} tables.`],
  [/^Lecture au niveau Organisation sur (\d+) tables\.$/, (m) => `Read at Organization level on ${m[1]} tables.`],
  [/^Droit sensible : (.+) \((.+)\)\.$/, (m) => `Sensitive right: ${I18N.dict.en[m[1]] || m[1]} (${m[2]}).`],
]);
I18N.add('en', {
  'Agir au nom d\'un autre utilisateur (usurpation)': 'Act on behalf of another user (impersonation)', 'Contourner les plug-ins personnalisés': 'Bypass custom plug-ins',
  'Contourner la logique métier personnalisée': 'Bypass custom business logic', 'Exporter vers Excel': 'Export to Excel', 'Suppression en masse': 'Bulk delete',
  'Publier les personnalisations': 'Publish customizations', 'Importer des personnalisations': 'Import customizations',
});
I18N.addPatterns('en', [
  [/^(\d+) ligne\(s\)( \(1000 affichées, filtrez ou exportez\))?$/, (m) => `${m[1]} row(s)` + (m[2] ? ' (1000 shown, filter or export)' : '')],
]);
I18N.add('en', {
  'Valeurs formatées': 'Formatted values',
  'Ctrl+Entrée pour exécuter. Les requêtes passent par la session de l\'onglet Dynamics (impersonation appliquée si active).': 'Ctrl+Enter to run. Requests go through the Dynamics tab session (impersonation applied when active).',
});
I18N.addPatterns('en', [[/^Équipe : (.+)$/, (m) => `Team: ${m[1]}`]]);
I18N.add('en', {
  'Ajouter les tables personnalisées': 'Add custom tables', 'Vider': 'Clear',
  "Génère la documentation des tables : colonnes (type, requis, audit, sécurité, description), listes de valeurs et relations. La colonne « Description » reprend les descriptions Dataverse : complétez-les dans les métadonnées pour enrichir le document.": 'Generates table documentation: columns (type, required, audit, security, description), value lists and relationships. The “Description” column reuses Dataverse descriptions: fill them in the metadata to enrich the document.',
});
