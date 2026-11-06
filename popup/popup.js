'use strict';
const $ = (s) => document.querySelector(s);
let tab = null;

function send(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!tab) return reject(new Error('Aucun onglet actif.'));
    chrome.tabs.sendMessage(tab.id, { xrmkit: true, action, payload }, (res) => {
      if (chrome.runtime.lastError) {
        return reject(new Error('Page non prête : ouvrez une application Dynamics 365 pilotée par modèle, puis rechargez la page (F5).'));
      }
      if (!res || !res.ok) return reject(new Error((res && res.error) || 'Erreur inconnue'));
      resolve(res.data);
    });
  });
}

let lastText = '';
let toastTimer = null;

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = T(msg);
  t.className = 'toast' + (isError ? ' err' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 5000 : 2400);
}

function closeModal() { $('#modal').hidden = true; }

function openModal(title, node, text, isError = false) {
  lastText = text || '';
  $('#mtitle').textContent = T(title) || (isError ? 'Erreur' : 'Résultat');
  $('.sheet').classList.toggle('err', isError);
  $('#mbody').replaceChildren(node);
  $('#mcopy').hidden = !lastText;
  $('#modal').hidden = false;
  $('#mok').focus();
}

const cellText = (v) => (v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// Résultat bref → toast ; résultat détaillé ou erreur → fenêtre modale (jamais en bas de page).
function show(title, data, isError = false) {
  if (data instanceof Node) return openModal(title, data, data.textContent, isError);
  if (typeof data === 'string') {
    if (!isError && data.length <= 140) return toast(title ? `${title} : ${data}` : data);
    const p = document.createElement('p');
    p.textContent = data;
    return openModal(title, p, data, isError);
  }
  const rows = Array.isArray(data) ? data : Object.entries(data || {}).map(([k, v]) => ({ Clé: k, Valeur: v }));
  if (!rows.length) return toast(`${title ? title + ' : ' : ''}aucun résultat.`);
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = T(c); head.append(th); });
  const body = table.createTBody();
  rows.forEach((r) => {
    const tr = body.insertRow();
    cols.forEach((c) => { const td = tr.insertCell(); td.textContent = cellText(r[c]); td.className = 'cp'; td.title = 'Cliquer pour copier'; });
  });
  const wrap = document.createElement('div');
  wrap.append(table);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.textContent = T('Cliquez sur une valeur pour la copier.');
  wrap.append(tip);
  openModal(title, wrap, [cols.join('\t'), ...rows.map((r) => cols.map((c) => cellText(r[c])).join('\t'))].join('\n'));
}

async function copy(label, text) {
  if (!text) throw new Error(`${label} indisponible (enregistrement non sauvegardé ?).`);
  await navigator.clipboard.writeText(text);
  toast(`✓ ${label} copié : ${text}`);
}

async function openInNewTab(url) {
  await chrome.tabs.create({ url, index: tab.index + 1 });
}

const GUID = /^\{?[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}\}?$/i;

const actions = {
  async godMode() { show('God Mode activé', await send('godMode')); },
  async names() {
    const r = await send('toggleLogicalNames');
    show('Noms logiques', r.on ? 'Affichés entre crochets dans les libellés.' : 'Libellés d\'origine restaurés.');
  },
  async optionSets() { show('Option sets du formulaire', await send('optionSets')); },
  async dirty() { show('Champs modifiés (non enregistrés)', await send('dirtyFields')); },
  async copyId() { await copy('ID', (await send('recordInfo')).id); },
  async copyUrl() { await copy('URL', (await send('recordInfo')).url); },
  async copyEntity() { await copy('Entité', (await send('recordInfo')).entity); },
  async copyApi() { await copy('URL API Web', (await send('recordInfo')).apiUrl); },
  async openRecord() {
    const etn = $('#etn').value.trim();
    const id = $('#rid').value.trim();
    if (!etn || !GUID.test(id)) throw new Error('Renseignez le nom logique de l\'entité et un GUID valide.');
    await openInNewTab((await send('url', { pagetype: 'entityrecord', etn, id })).url);
  },
  async openList() {
    const etn = $('#etn').value.trim();
    if (!etn) throw new Error('Renseignez le nom logique de l\'entité.');
    await openInNewTab((await send('url', { pagetype: 'entitylist', etn })).url);
  },
  async advFind() { await openInNewTab((await send('url', { pagetype: 'advancedfind' })).url); },
  async envInfo() { show('Environnement', await send('envInfo')); },
  async clearCache() {
    if (!confirm('Vider le cache de session et recharger la page ?')) return;
    show('Cache', (await send('clearCache')).message);
  },
  async workbench() { await openWorkbench(''); },
  async wbChat() { await openWorkbench('chat'); },
  async wbImpact() { await openWorkbench('impact'); },
  async wbAudit() { await openWorkbench('audit'); },
  async wbInspect() { await openWorkbench('inspect'); },

  // Rapport de bug : contexte complet en Markdown (copié) + capture d'écran (téléchargée).
  async bugReport() {
    const [info, env, errs] = await Promise.all([send('recordInfo').catch(() => null), send('envInfo'), send('recentErrors').catch(() => [])]);
    let png = null;
    try { png = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }); } catch (e) { /* capture refusée */ }
    const now = new Date();
    const lines = [
      '## Bug : <titre court>', '',
      `**Quand** : ${now.toLocaleString('fr-FR')}`,
      `**Environnement** : ${env.URL} (${env['Organisation (nom unique)'] || '?'}) — version ${env.Version || '?'}`,
      `**Utilisateur** : ${env.Utilisateur || '?'} — rôles : ${env['Rôles de sécurité'] || '?'}`,
      `**Page** : ${(info && info.pageUrl) || tab.url}`,
    ];
    if (info) lines.push(`**Enregistrement** : ${info.entity} · ${info.id || '(nouveau)'}${info.formName ? ` · formulaire « ${info.formName} »` : ''}`);
    lines.push(`**Navigateur** : ${navigator.userAgent}`, '', '### Étapes pour reproduire', '1. ', '2. ', '3. ', '', '### Résultat attendu', '', '### Résultat obtenu', '');
    if (errs.length) lines.push('### Erreurs JavaScript récentes', ...errs.slice(-8).map((e) => `- ${e.date.slice(11, 19)} ${e.message}`), '');
    const text = lines.join('\n');
    await navigator.clipboard.writeText(text);
    const wrap = document.createElement('div');
    const note = document.createElement('p');
    note.textContent = '✓ Rapport copié dans le presse-papiers (collez-le dans votre ticket).';
    wrap.append(note);
    if (png) {
      const dl = document.createElement('a');
      dl.href = png;
      dl.download = `bug-${(info && info.entity) || 'page'}-${now.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      dl.click();
      const img = document.createElement('img');
      img.src = png;
      const cap = document.createElement('p');
      cap.className = 'tip';
      cap.textContent = 'Capture téléchargée : joignez-la au ticket.';
      wrap.append(img, cap);
    } else {
      const cap = document.createElement('p');
      cap.className = 'tip';
      cap.textContent = 'Capture indisponible : seule la description a été copiée.';
      wrap.append(cap);
    }
    openModal('Rapport de bug', wrap, text);
  },
};

async function openWorkbench(hash) {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`workbench/workbench.html?tabId=${tab.id}${hash ? '#' + hash : ''}`) });
}

$('#mclose').onclick = closeModal;
$('#mok').onclick = closeModal;
$('#mcopy').onclick = async () => { await navigator.clipboard.writeText(lastText); toast('✓ Contenu copié'); };
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('click', async (e) => {
  const td = e.target.closest('td.cp');
  if (td) { try { await navigator.clipboard.writeText(td.textContent); toast(`✓ Copié : ${td.textContent.slice(0, 80)}`); } catch (err) { /* ignore */ } return; }
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  try { await actions[btn.dataset.act](); } catch (err) { show('Erreur', err.message, true); }
});

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const st = $('#status');
  try {
    const p = await send('ping');
    st.textContent = [p.org, p.entity].filter(Boolean).join(' · ') || 'Dynamics 365';
    if (p.entity) $('#etn').value = p.entity;
    if (p.id) $('#rid').value = p.id;
  } catch (err) {
    st.textContent = 'Non connecté';
    st.classList.add('err');
    show('', err.message, true);
  }
})();


// ---- Langue (FR / EN) : traduit le DOM statique à partir du dictionnaire partagé ----
const _orig = new WeakMap();
function translateDom(root = document.body) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const raw = _orig.has(n) ? _orig.get(n) : n.nodeValue;
    if (!_orig.has(n)) _orig.set(n, raw);
    const trimmed = raw.trim();
    if (trimmed.length > 1) n.nodeValue = raw.replace(trimmed, T(trimmed));
  }
  root.querySelectorAll('[placeholder],[title]').forEach((e) => {
    ['placeholder', 'title'].forEach((a) => {
      if (!e.hasAttribute(a)) return;
      const k = `i18n${a}`; if (!e.dataset[k]) e.dataset[k] = e.getAttribute(a);
      e.setAttribute(a, T(e.dataset[k]));
    });
  });
  const pl = $('#plang'); if (pl) pl.textContent = I18N.lang.toUpperCase();
}
(async () => {
  await I18N.init(); xicon.mount(); translateDom();
  const pl = $('#plang');
  if (pl) pl.addEventListener('click', async () => { await I18N.set(I18N.lang === 'fr' ? 'en' : 'fr'); translateDom(); });
})();
