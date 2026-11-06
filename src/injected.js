// Script exécuté dans le contexte de la page Dynamics 365 (monde MAIN) : accès à Xrm et à l'API Web
// avec la session de l'utilisateur (même origine, donc aucun jeton à gérer).
(() => {
  'use strict';
  if (window.__xrmkit_loaded) return;
  window.__xrmkit_loaded = true;

  const API = 'v9.2';
  const state = { labelsOn: false, labelsKey: null, origLabels: new Map(), entitySets: new Map() };

  // Erreurs JS récentes (pour les rapports de bug) et historique des appels API.
  const recentErrors = [];
  const pushErr = (m) => {
    recentErrors.push({ date: new Date().toISOString(), message: String(m).slice(0, 500) });
    if (recentErrors.length > 30) recentErrors.shift();
  };
  window.addEventListener('error', (e) => pushErr(`${e.message} (${e.filename || ''}:${e.lineno || ''})`));
  window.addEventListener('unhandledrejection', (e) => pushErr('Promise rejetée : ' + ((e.reason && e.reason.message) || e.reason)));
  const origConsoleError = console.error;
  console.error = function (...args) {
    try { pushErr(args.map((x) => (x && x.message) || (typeof x === 'object' ? JSON.stringify(x) : x)).join(' ')); } catch (e) { /* ignore */ }
    return origConsoleError.apply(this, args);
  };
  try { performance.setResourceTimingBufferSize(3000); } catch (e) { /* ignore */ }

  // ---------- helpers ----------
  const tryv = (f) => { try { return f(); } catch (e) { return null; } };
  const cleanId = (id) => (id || '').replace(/[{}]/g, '').toLowerCase();
  const assertName = (n) => {
    if (!/^[A-Za-z0-9_]+$/.test(n || '')) throw new Error('Nom logique invalide : ' + n);
    return n;
  };

  const getXrm = () => {
    if (typeof Xrm !== 'undefined' && Xrm.Utility) return Xrm;
    for (const f of document.querySelectorAll('iframe')) {
      try { if (f.contentWindow.Xrm && f.contentWindow.Xrm.Utility) return f.contentWindow.Xrm; } catch (e) { /* cross-origin */ }
    }
    throw new Error('Xrm introuvable : ouvrez une application pilotée par modèle et attendez la fin du chargement.');
  };
  const gctx = () => getXrm().Utility.getGlobalContext();
  const clientUrl = () => gctx().getClientUrl().replace(/\/$/, '');

  const formPage = () => {
    const wins = [window];
    document.querySelectorAll('iframe').forEach((f) => { try { wins.push(f.contentWindow); } catch (e) { /* ignore */ } });
    for (const w of wins) {
      try {
        const p = w.Xrm && w.Xrm.Page;
        if (p && p.data && p.data.entity && p.data.entity.getEntityName) return p;
      } catch (e) { /* ignore */ }
    }
    return null;
  };
  const needForm = () => {
    const p = formPage();
    if (!p) throw new Error('Aucun formulaire ouvert : ouvrez un enregistrement.');
    return p;
  };

  const buildUrl = (params) => {
    const q = new URLSearchParams(location.search);
    const u = new URLSearchParams();
    if (q.get('appid')) u.set('appid', q.get('appid'));
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') u.set(k, v); });
    return `${clientUrl()}/main.aspx?${u.toString()}`;
  };

  // ---------- API Web ----------
  async function webapi({ method = 'GET', path, body, callerId, formatted, headers = {}, maxPages = 1, pageSize }) {
    if (!path) throw new Error('Chemin API manquant.');
    const base = `${clientUrl()}/api/data/${API}/`;
    let url;
    if (/^https?:\/\//i.test(path)) {
      if (!path.startsWith(clientUrl() + '/')) throw new Error('URL hors de l\'environnement courant refusée.');
      url = path;
    } else {
      url = base + path.replace(/^\/+/, '');
    }
    const h = {
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    };
    if (callerId) h.MSCRMCallerID = callerId;
    const prefer = [];
    if (formatted) prefer.push('odata.include-annotations="OData.Community.Display.V1.FormattedValue"');
    if (pageSize) prefer.push(`odata.maxpagesize=${Math.min(5000, Math.max(1, Number(pageSize) || 1))}`);
    if (prefer.length) h.Prefer = prefer.join(',');

    const value = [];
    let nextLink = null;
    let meta = {};
    let data = null;
    let isCollection = false;
    let status = 200;
    let entityId = null;

    for (let page = 0; page < Math.max(1, maxPages); page++) {
      const res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: h,
        body: body !== undefined && method !== 'GET' ? JSON.stringify(body) : undefined,
      });
      status = res.status;
      if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* ignore */ }
        throw new Error(msg);
      }
      if (res.status === 204) { entityId = res.headers.get('OData-EntityId'); break; }
      const j = await res.json();
      if (Array.isArray(j.value)) {
        isCollection = true;
        value.push(...j.value);
        meta = {};
        Object.keys(j).forEach((k) => { if (k.startsWith('@') && k !== '@odata.nextLink') meta[k] = j[k]; });
        nextLink = j['@odata.nextLink'] || null;
        if (!nextLink) break;
        url = nextLink;
      } else {
        data = j;
        break;
      }
    }
    return { isCollection, value, nextLink, meta, data, status, entityId };
  }

  async function entitySet(logicalName) {
    assertName(logicalName);
    if (state.entitySets.has(logicalName)) return state.entitySets.get(logicalName);
    const r = await webapi({ path: `EntityDefinitions(LogicalName='${logicalName}')?$select=EntitySetName` });
    const set = r.data && r.data.EntitySetName;
    if (!set) throw new Error('Entité introuvable : ' + logicalName);
    state.entitySets.set(logicalName, set);
    return set;
  }

  // ---------- actions ----------
  const handlers = {
    async ping() {
      const p = formPage();
      return {
        org: tryv(() => gctx().organizationSettings.uniqueName),
        entity: p ? p.data.entity.getEntityName() : null,
        id: p ? cleanId(p.data.entity.getId()) : null,
      };
    },

    // Affiche tous les onglets / sections / champs et déverrouille les champs en lecture seule.
    async godMode() {
      const p = needForm();
      let tabs = 0, sections = 0, controls = 0, unlocked = 0;
      p.ui.tabs.forEach((t) => {
        tabs++;
        tryv(() => t.setVisible(true));
        tryv(() => t.setDisplayState('expanded'));
        t.sections.forEach((s) => { sections++; tryv(() => s.setVisible(true)); });
      });
      p.ui.controls.forEach((c) => {
        controls++;
        tryv(() => c.setVisible(true));
        if (typeof c.setDisabled === 'function') { if (tryv(() => { c.setDisabled(false); return true; })) unlocked++; }
      });
      return { 'Onglets affichés': tabs, 'Sections affichées': sections, 'Contrôles visibles': controls, 'Champs déverrouillés': unlocked };
    },

    // Ajoute [nom_logique] aux libellés des onglets, sections et champs (bascule).
    async toggleLogicalNames() {
      const p = needForm();
      const key = p.data.entity.getEntityName() + ':' + tryv(() => p.ui.formSelector.getCurrentItem().getId());
      if (state.labelsKey !== key) { state.origLabels.clear(); state.labelsOn = false; state.labelsKey = key; }
      const on = !state.labelsOn;
      const apply = (kind, it) => {
        try {
          const name = it.getName();
          const k = kind + ':' + name;
          if (on) {
            if (!state.origLabels.has(k)) state.origLabels.set(k, it.getLabel());
            it.setLabel(`${state.origLabels.get(k)} [${name}]`);
          } else if (state.origLabels.has(k)) {
            it.setLabel(state.origLabels.get(k));
          }
        } catch (e) { /* contrôle sans libellé modifiable */ }
      };
      p.ui.tabs.forEach((t) => { apply('tab', t); t.sections.forEach((s) => apply('section', s)); });
      p.ui.controls.forEach((c) => apply('control', c));
      state.labelsOn = on;
      return { on };
    },

    async recordInfo() {
      const base = clientUrl();
      const p = formPage();
      const q = new URLSearchParams(location.search);
      let etn, id, formId = null, formName = null;
      if (p) {
        etn = p.data.entity.getEntityName();
        id = cleanId(p.data.entity.getId());
        tryv(() => {
          const f = p.ui.formSelector.getCurrentItem();
          formId = cleanId(f.getId());
          formName = f.getLabel();
        });
      } else {
        etn = q.get('etn');
        id = cleanId(q.get('id'));
      }
      if (!etn) throw new Error('Aucun enregistrement détecté sur cette page.');
      let set = null;
      try { set = await entitySet(etn); } catch (e) { /* non bloquant */ }
      return {
        entity: etn,
        id,
        isNew: !id,
        formId,
        formName,
        entitySetName: set,
        url: buildUrl({ pagetype: 'entityrecord', etn, id }),
        apiUrl: set && id ? `${base}/api/data/${API}/${set}(${id})` : null,
        pageUrl: location.href,
      };
    },

    // Valeurs numériques et libellés de tous les champs liste de choix / oui-non du formulaire.
    async optionSets() {
      const p = needForm();
      const rows = [];
      p.data.entity.attributes.forEach((a) => {
        const type = tryv(() => a.getAttributeType());
        if (!['optionset', 'multiselectoptionset', 'boolean'].includes(type)) return;
        const opts = tryv(() => a.getOptions()) || [];
        const cur = tryv(() => (type === 'optionset' ? a.getSelectedOption() : null));
        rows.push({
          Champ: a.getName(),
          Type: type,
          'Valeur actuelle': tryv(() => JSON.stringify(a.getValue())),
          'Libellé actuel': cur ? cur.text : '',
          Options: opts.map((o) => `${o.value} = ${o.text}`).join(' | '),
        });
      });
      return rows;
    },

    async dirtyFields() {
      const p = needForm();
      const rows = [];
      p.data.entity.attributes.forEach((a) => {
        if (tryv(() => a.getIsDirty())) rows.push({ Champ: a.getName(), Valeur: tryv(() => JSON.stringify(a.getValue())) });
      });
      return rows;
    },

    // Tous les champs du formulaire avec type, niveau d'exigence, valeur, visibilité.
    async formFields() {
      const p = needForm();
      const rowsOut = [];
      p.data.entity.attributes.forEach((a) => {
        const ctl = tryv(() => a.controls.get(0));
        rowsOut.push({
          champ: a.getName(),
          libelle: ctl ? tryv(() => ctl.getLabel()) : null,
          type: tryv(() => a.getAttributeType()),
          requis: tryv(() => a.getRequiredLevel()),
          soumission: tryv(() => a.getSubmitMode()),
          modifie: tryv(() => a.getIsDirty()),
          valeur: tryv(() => JSON.stringify(a.getValue())),
          visible: ctl ? tryv(() => ctl.getVisible()) : null,
          desactive: ctl ? tryv(() => ctl.getDisabled()) : null,
          controles: tryv(() => a.controls.getLength()),
        });
      });
      return rowsOut;
    },

    // Appels à l'API Web effectués par la page (Resource Timing).
    async networkLog() {
      const base = clientUrl();
      return performance.getEntriesByType('resource')
        .filter((e) => /\/api\/data\//i.test(e.name))
        .map((e) => ({
          url: decodeURIComponent(e.name.replace(base, '')).slice(0, 400),
          debut: Math.round(e.startTime),
          duree: Math.round(e.duration),
          taille: e.transferSize,
          statut: e.responseStatus || null,
        }))
        .slice(-600);
    },

    async recentErrors() { return recentErrors.slice(); },

    // Contexte du formulaire ouvert : identité, onglets et sections.
    async formDebug() {
      const p = needForm();
      const item = tryv(() => p.ui.formSelector.getCurrentItem());
      const tabsOut = [];
      p.ui.tabs.forEach((t) => {
        const secs = [];
        t.sections.forEach((s) => secs.push({ nom: tryv(() => s.getName()), libelle: tryv(() => s.getLabel()), visible: tryv(() => s.getVisible()) }));
        tabsOut.push({ nom: tryv(() => t.getName()), libelle: tryv(() => t.getLabel()), visible: tryv(() => t.getVisible()), etat: tryv(() => t.getDisplayState()), sections: secs });
      });
      return {
        entite: tryv(() => p.data.entity.getEntityName()),
        id: cleanId(tryv(() => p.data.entity.getId())),
        typeFormulaire: tryv(() => p.ui.getFormType()),
        formId: item ? cleanId(tryv(() => item.getId())) : null,
        formNom: item ? tryv(() => item.getLabel()) : null,
        formulaires: tryv(() => { const l = []; p.ui.formSelector.items.forEach((i) => l.push({ id: cleanId(i.getId()), nom: i.getLabel() })); return l; }),
        modifie: tryv(() => p.data.entity.getIsDirty()),
        onglets: tabsOut,
      };
    },

    // Rapport de performance de la page (Navigation / Resource Timing).
    async perfReport() {
      const base = clientUrl();
      const nav = performance.getEntriesByType('navigation')[0];
      const kindOf = (e) => {
        if (/\/api\/data\//i.test(e.name)) return 'API Web';
        if (/\.js(\?|#|$)/i.test(e.name) || e.initiatorType === 'script') return 'JavaScript';
        if (/\.css(\?|#|$)/i.test(e.name)) return 'CSS';
        if (/\.(png|jpe?g|gif|svg|ico|woff2?|ttf)(\?|#|$)/i.test(e.name) || e.initiatorType === 'img') return 'Images et polices';
        return 'Autre';
      };
      const res = performance.getEntriesByType('resource');
      const items = res.map((e) => ({
        type: kindOf(e),
        url: decodeURIComponent(e.name.replace(base, '')).slice(0, 300),
        debut: Math.round(e.startTime),
        duree: Math.round(e.duration),
        taille: e.transferSize || 0,
        statut: e.responseStatus || null,
      }));
      let longTasks = [];
      try {
        await new Promise((resolve) => {
          const po = new PerformanceObserver((l) => { longTasks.push(...l.getEntries()); });
          po.observe({ type: 'longtask', buffered: true });
          setTimeout(() => { longTasks.push(...po.takeRecords()); po.disconnect(); resolve(); }, 150);
        });
      } catch (e) { longTasks = null; }
      return {
        navigation: nav ? {
          ttfb: Math.round(nav.responseStart), domInteractive: Math.round(nav.domInteractive),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd), chargementComplet: Math.round(nav.loadEventEnd || nav.duration),
        } : null,
        ressources: items.slice(-1500),
        longTasks: longTasks ? longTasks.map((t) => ({ debut: Math.round(t.startTime), duree: Math.round(t.duration) })).slice(-100) : null,
        memoireMo: tryv(() => Math.round(performance.memory.usedJSHeapSize / 1048576)),
        origine: base,
      };
    },

    async url({ pagetype, etn, id }) {
      if (etn) assertName(etn);
      if (id && !/^[0-9a-f-]{36}$/i.test(cleanId(id))) throw new Error('GUID invalide.');
      if (!['entityrecord', 'entitylist', 'advancedfind'].includes(pagetype)) throw new Error('Type de page non géré.');
      return { url: buildUrl({ pagetype, etn, id: id ? cleanId(id) : '' }) };
    },

    async envInfo() {
      const g = gctx();
      const roles = tryv(() => g.userSettings.roles.getAll().map((r) => r.name));
      return {
        URL: g.getClientUrl(),
        'Organisation (nom unique)': tryv(() => g.organizationSettings.uniqueName),
        'ID organisation': cleanId(tryv(() => g.organizationSettings.organizationId)),
        Version: tryv(() => g.getVersion()),
        Utilisateur: tryv(() => g.userSettings.userName),
        'ID utilisateur': cleanId(tryv(() => g.userSettings.userId)),
        'Langue (LCID)': tryv(() => g.userSettings.languageId),
        'Décalage horaire (min)': tryv(() => g.getTimeZoneOffsetMinutes()),
        Client: tryv(() => g.client.getClient()),
        'Facteur de forme': tryv(() => g.client.getFormFactor()),
        'Rôles de sécurité': roles ? roles.join(', ') : null,
      };
    },

    async clearCache() {
      sessionStorage.clear();
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      setTimeout(() => location.reload(), 400);
      return { message: 'Cache de session et Cache Storage vidés, rechargement de la page…' };
    },

    webapi: (payload) => webapi(payload),

    async entitySet({ logicalName }) { return { entitySetName: await entitySet(logicalName) }; },

    async fetchxml({ fetchXml, callerId, formatted }) {
      const doc = new DOMParser().parseFromString(fetchXml || '', 'text/xml');
      if (doc.querySelector('parsererror')) throw new Error('FetchXML invalide (XML mal formé).');
      const ent = doc.querySelector('fetch > entity');
      if (!ent) throw new Error('FetchXML : élément <entity> manquant.');
      const set = await entitySet(ent.getAttribute('name'));
      return webapi({ path: `${set}?fetchXml=${encodeURIComponent(fetchXml)}`, callerId, formatted });
    },
  };

  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== 'XRMKIT_REQ') return;
    let out;
    try {
      const fn = handlers[d.action];
      if (!fn) throw new Error('Action inconnue : ' + d.action);
      const data = await fn(d.payload || {});
      out = { ok: true, data: data === undefined ? null : JSON.parse(JSON.stringify(data)) };
    } catch (err) {
      out = { ok: false, error: err && err.message ? err.message : String(err) };
    }
    window.postMessage({ source: 'XRMKIT_RES', id: d.id, ...out }, window.location.origin);
  });
})();
