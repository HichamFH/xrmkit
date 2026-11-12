# Xrmkit pour Dynamics 365

Développé par **HichamFH** · v0.3

Extension Chrome (Manifest V3, JavaScript pur, sans build) pour les applications Dynamics 365 pilotées par modèle.

## Installation
1. Décompresser le dossier.
2. `chrome://extensions` → activer le **Mode développeur** → **Charger l'extension non empaquetée** → choisir le dossier `xrmkit`.
3. **Recharger (F5) l'onglet Dynamics** déjà ouvert, puis cliquer sur l'icône Xrmkit.

## Popup (actions rapides sur la page courante)
God Mode · noms logiques (bascule) · valeurs des option sets du formulaire · champs modifiés ·
copie ID / URL / entité / URL API Web · ouverture par ID ou liste · Recherche avancée · infos environnement · vider le cache.

## Workbench (bouton « Ouvrir le Workbench »)
| Onglet | Contenu |
|---|---|
| Requêtes | FetchXML, OData, Web API brut (confirmation avant écriture), pagination, valeurs formatées, export CSV/JSON, requêtes enregistrées |
| Métadonnées | Attributs, option sets (valeurs + libellés), relations, liste des entités |
| Traces de plugins | Filtres (type, message, entité, erreurs, période), détail, explication par IA |
| Flows | Flows cloud Dataverse + historique des exécutions (`flowruns`) |
| Solutions & rôles | Solutions, rôles de sécurité, utilisateurs → rôles |
| Comparer des environnements | Instantanés (solutions, rôles, plug-ins, étapes, variables d'env., processus) puis diff |
| Impersonation | `MSCRMCallerID` appliqué aux requêtes du Workbench, test WhoAmI |
| Environnement | Infos organisation/utilisateur, liens Maker / Power Automate / Admin Center |
| Assistant IA | Génère du FetchXML/OData à partir d'une phrase : Claude, ChatGPT, Cloudflare Workers AI |

## Nouveautés v0.2
| Groupe | Onglet | Contenu |
|---|---|---|
| Données | Données | Générateur de données de test (+ nettoyage), import CSV avec simulation (dry-run), modification en masse (confirmation par saisie du nombre) |
| Technique | Utilisé où ? | Analyse d'impact (RetrieveDependentComponents) d'un champ, table, option set, web resource… |
| Technique | Étapes plug-ins | Explorateur des étapes, activation/désactivation |
| Technique | Jobs asynchrones | Suivi des system jobs (échecs, en attente), détail des erreurs |
| Technique | Audit | Historique d'un enregistrement (RetrieveRecordChangeHistory) |
| Technique | Inspecteur | Champs du formulaire, handlers FormXML, appels API réseau, erreurs JS, recherche dans les web resources |
| Sécurité | Pourquoi cet accès ? | RetrievePrincipalAccess + comparaison de deux rôles |
| Fonctionnel | Dictionnaire | Dictionnaire de données Excel / Word |
| Environnements | Instantanés | Rapport de livraison (diff) en Word / Excel |
| Popup | Support | Rapport de bug (contexte Markdown copié + capture PNG), raccourcis vers Impact / Audit / Inspecteur |

## Nouveautés v0.3
- Nouveau logo (`icons/logo.svg` + icônes PNG), design remanié (popup et Workbench), crédit HichamFH.
- Popup : les résultats courts s'affichent en **notification en haut** (ex. « ✓ ID copié »), les résultats détaillés dans une **fenêtre modale** (clic sur une valeur = copie, bouton « Copier » = tout, Échap = fermer). Le Workbench utilise aussi des notifications en haut à droite.
- Assistant IA : choix du fournisseur (Claude, ChatGPT/OpenAI, Cloudflare Workers AI en appel direct) + bouton « Tester la connexion ».
- Onglet « Contrôles pré-déploiement » retiré.

## v0.3.2
- Plug-ins : navigation **assembly → plug-in → étapes** (au lieu d'une liste de milliers d'étapes). Les assemblies système/gérées sont masquées par défaut.
- Analyse d'impact et recherche de web resources : lecture par petits lots, avec progression ; une source en échec n'arrête plus l'analyse (elle est signalée, avec le nombre de ressources non lues).
- Mise en page responsive : menu replié sur écran étroit, tableaux pleine largeur, option « Retour à la ligne ».
- Retirés pour l'instant : Générateur de code, Qualité & RGPD, Diagramme du modèle.

## Nouveautés v0.3.1 (UX)
- Workbench : sections en cartes, champs avec **libellé visible** (plus de champs devinés par leur placeholder), titre + description par page, icônes et **recherche d'outil** dans le menu (touche `/`), alertes en évidence, états de chargement et « aucun résultat » soignés, compteur de lignes dans les tableaux.
- Les `confirm` / `prompt` du navigateur sont remplacés par de vraies **boîtes de dialogue** : le bouton de suppression / modification en masse reste grisé tant que vous n'avez pas saisi le nombre exact d'enregistrements.
- Popup : icônes sur les boutons.

## Cloudflare Workers AI en direct
Account ID + jeton API avec la permission « Workers AI » ; modèle par défaut `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

## Notes
- Toutes les requêtes Web API passent par l'onglet Dynamics (même origine, session de l'utilisateur) : aucun jeton à gérer.
- Comparer deux environnements : capturer un instantané dans chacun (un Workbench par environnement), puis comparer.
- Traces de plugins : activer le suivi dans Paramètres système > Personnalisation.
- Impersonation : privilège `prvActOnBehalfOfAnotherUser` requis.
- IA : les clés sont stockées en clair dans `chrome.storage.local` ; seules la demande et les noms de champs (ou la trace expliquée) sont envoyés.
- Ajouter un domaine Dynamics (on-premise, autre cloud) : l'ajouter dans `host_permissions` et `content_scripts.matches` du `manifest.json`.


## v0.5.0
- **Comparer deux environnements** (nouveau, en direct) : ouvrez DEV et UAT dans deux onglets Chrome, lancez le Workbench depuis l'un, choisissez l'autre ; 11 catégories comparées (solutions, tables, rôles, plug-ins, étapes, web resources, flux, variables d'environnement, références de connexion, applications), rapport Word/Excel. Les instantanés restent disponibles (« Instantanés (hors ligne) »).
- **Analyse de performance** : TTFB, chargement, appels API lents/répétés, scripts lourds, tâches longues, diagnostic.
- **Debug de formulaire** : bibliothèques, handlers (lus dans la définition du formulaire), champs, sections, erreurs de configuration, surveillance des changements en direct.
- **Santé des flux** : échecs, suspendus, sans activité, propriétaire désactivé.
- **Éléments hors solution** : composants personnalisés absents de toutes les solutions non gérées.
- **Données de test (modèle)** : génération depuis les métadonnées de n'importe quelle table, avec liens et suppression d'une génération.
- Non testé sur un environnement réel : noms de colonnes de `flowruns`, `connectionreferences`, `environmentvariablevalues`.


## v0.6.0 — Chat IA intégré
- Onglet **Chat IA** (pleine page) et **panneau latéral** accessible partout via le bouton 💬 ; ouverture directe depuis le popup.
- **Contexte automatique** (environnement, page ouverte, modèle de la table, formulaire, erreurs) : chaque élément se retire d'un clic ; « Voir ce qui part » affiche le texte exact envoyé.
- **Mode confidentiel** (activé par défaut) : aucune valeur d'enregistrement n'est transmise (formulaire, résultats de requêtes).
- **Outils de lecture** utilisés par l'IA : tables, colonnes (recherche par sens), relations, listes de choix, solutions, étapes de plug-ins, flux, définitions de flux/workflows, web resources, formulaire, erreurs, performance, requêtes en lecture seule (20 lignes).
- **Actions proposées, jamais exécutées seules** : modifier/créer/supprimer un enregistrement, activer/désactiver une étape ou un flux, avec confirmation nommant l'environnement (suppression : saisie de « SUPPRIMER »).
- Pièces jointes (contenu de l'onglet affiché, ou bouton « ✨ Demander à l'IA » sur n'importe quel tableau), historique local (20 conversations), compteur de tokens estimé, copie de code, envoi des requêtes vers l'éditeur.
- Les fournisseurs gèrent maintenant les conversations multi-messages.
- Onglet « Assistant IA » renommé « Réglages IA ».

## v0.7.0 — Documentation de solutions

Nouvel onglet **📚 Documentation de solutions** (groupe Fonctionnel) :
- choisissez une ou plusieurs solutions, les sections à inclure, titre / client / auteur ;
- Xrmkit collecte (lecture seule) tables, colonnes, relations, listes de choix, formulaires, vues, tableaux de bord, flux cloud, règles métier, workflows, actions, BPF, plug-ins (assemblies + étapes), web resources, applications, plans de site, rôles, variables d'environnement, références de connexion, applications canvas, modèles d'e-mail, etc. ;
- génère une documentation avec architecture en couches (SVG), diagramme entité-relation, matrice automatisations × tables, cas d'utilisation et points d'attention déduits ;
- exports : **HTML interactif** (sommaire, filtres, thème sombre, impression PDF), **Word**, **Markdown + Mermaid**, **Excel** (inventaire), **JSON** ;
- option **✨ IA** : résumé fonctionnel, acteurs, cas d'utilisation, risques et recommandations (noms et descriptions uniquement, aucune donnée d'enregistrement).

Limites : le Word ne contient pas les diagrammes (utilisez HTML/PDF) ; les cas d'utilisation sont déduits et à valider.

## v0.7.1
- Assistant IA : design refondu (couleurs explicites, en-tête, bulles, zone de saisie).
- Popup : tableaux de résultats lisibles (colonnes plus de coupées lettre par lettre).
- Onglet « Instantanés (hors ligne) » retiré (remplacé par la comparaison en direct).

## v0.7.2 — Sécurité et design
- Clés API : jamais en clair dans le stockage durable. Conservées pour la session du navigateur, ou dans un coffre chiffré (PBKDF2 + AES-GCM, mot de passe). Migration automatique des anciennes clés.
- Masquage automatique des e-mails, téléphones, IBAN et numéros longs avant envoi à l'IA (désactivable) ; confirmation avant d'envoyer un tableau à l'IA.
- Permissions réduites : plus de permission optionnelle `https://*/*` ; CSP `script-src 'self'`.
- Historique du chat supprimé après 30 jours.
- Documentation de solutions : plus d'aperçu intégré (iframe retirée) ; le HTML téléchargé reste interactif.
- Nouveau système visuel (aplats, bordures fines, assistant en notes de marge).

## v0.8.0 — Tableau de bord, statistiques, langues, extensibilité
- **Design** inspiré des tableaux de bord d'administration : barre latérale bleue, barre du haut (recherche, langue FR/EN, notifications d'erreurs, mode sombre, utilisateur connecté), cartes d'indicateurs colorées, graphiques SVG sans dépendance (`charts.js`).
- **Tableau de bord** (nouvel onglet d'accueil) : tables, solutions, étapes de plug-ins, flux ; automatisations par catégorie, santé des flux, tâches système en échec sur 14 jours, solutions récentes, utilisateur connecté.
- **Analyse de performance** : cartes de statistiques (TTFB, chargement, appels API, JavaScript), score /100, temps par catégorie, appels les plus lents, cascade des requêtes, **historique des mesures** (chrome.storage), utilisateur connecté et rôles.
- **Langues** : français / anglais (bouton dans la barre du haut et dans le popup). Dictionnaires : `workbench/i18n-en.js` (clé = texte français exact). Pour ajouter une langue : `I18N.langs.de = {…}` + `I18N.add('de', {…})`.
- **Performance** : déduplication des requêtes GET simultanées, cache de 60 s pour les métadonnées (invalidé à chaque écriture), filtre de tableau différé, chargement différé de l'onglet « Documentation de solutions ».

### Ajouter un onglet en 5 minutes
1. Créez `workbench/mon-outil.js` :
```js
Xrmkit.registerTab({
  id: 'monOutil', group: 'Technique', icon: '🧰',
  title: 'Mon outil', desc: 'Ce que fait l\'outil.',
  i18n: { en: { title: 'My tool', desc: 'What the tool does.' } },
  render: async (root) => {
    const data = await rows('accounts?$select=name&$top=5');
    root.append(Charts.card('Comptes', '5 premiers', h('p', {}, data.map((r) => r.name).join(', '))));
  },
});
```
2. Ajoutez `<script src="mon-outil.js"></script>` dans `workbench.html`, avant `main.js`.
3. Outils disponibles : `q/rows` (Web API, cache inclus), `call` (page Dynamics), `h` (DOM), `Charts.*` (stat, bars, hbars, gauge, area, donut, card), `dataTable`, `toast`, `confirmBox`, `askAI`, `currentUser()`, `T()` (traduction).
Pour un onglet lourd : `Xrmkit.lazy('id', ['fichier.js'])` charge le script au premier affichage.

## v0.8.1
- Le fournisseur « Worker Cloudflare » et le dossier `cloudflare-worker/` sont supprimés ; fournisseurs conservés : Claude, ChatGPT, Cloudflare Workers AI. Permission `*.workers.dev` retirée.

## v0.8.2 — icônes
Les émojis sont remplacés par un jeu d'icônes SVG maison (`workbench/icons.js` : traits arrondis, aplat translucide, touche d'accent orange). `xicon('nom')` renvoie le SVG ; `<span data-i="nom">` + `xicon.mount()` dans le HTML. Un onglet enregistré via `registerTab({ icon: 'nom' })` peut utiliser n'importe quelle icône de `XI` (un émoji reste accepté).
