'use strict';

// « nom du champ (précision) » / « …, ex. valeur » → libellé + exemple
function splitPlaceholder(ph) {
  let label = ph.trim(), hint = '';
  const m = /^(.*?)(?:\s*\((.+)\)\s*$|\s*[,;]?\s*\bex\.\s*(.+)$|\s*…$)/i.exec(label);
  if (m) { label = m[1].trim(); hint = (m[2] || m[3] || '').trim(); }
  label = label.replace(/[:…]+$/, '').trim();
  return { label: label.charAt(0).toUpperCase() + label.slice(1), hint };
}

// Rend les pages plus lisibles sans réécrire chaque onglet :
// 1) champs avec libellé visible, 2) sections en cartes, 3) alertes mises en évidence.
function enhance(body) {
  body.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((el) => {
    if (el.closest('label.field') || el.closest('.chat-root') || el.type === 'search' || el.type === 'checkbox' || el.type === 'file') return;
    if (el.tagName === 'TEXTAREA' && el.rows > 3) return;
    const { label, hint } = splitPlaceholder(el.placeholder);
    if (!label) return;
    el.dataset.ph = el.placeholder;
    el.placeholder = hint;
    const wrap = h('label', { class: 'field' }, h('span', {}, label));
    el.replaceWith(wrap);
    wrap.append(el);
  });
  // texte nu devant un champ d'une barre d'outils (« Nombre [10] ») → champ avec libellé
  body.querySelectorAll('.toolbar').forEach((tb) => {
    [...tb.childNodes].forEach((n) => {
      if (n.nodeType !== 3 || !n.textContent.trim()) return;
      const nxt = n.nextElementSibling;
      if (!nxt || !/^(INPUT|SELECT)$/.test(nxt.tagName) || nxt.type === 'checkbox') return;
      const wrap = h('label', { class: 'field' }, h('span', {}, n.textContent.trim().replace(/\s*:$/, '')));
      n.replaceWith(wrap);
      wrap.append(nxt);
    });
  });
  body.querySelectorAll('input[type="file"]').forEach((el) => el.classList.add('filepick'));
  [...body.children].forEach((p) => {
    if (/^(Attention|⚠)/.test(p.textContent.trim()) && p.textContent.length < 400) { p.classList.add('alert'); p.classList.remove('muted', 'panel'); }
  });
  // sections → cartes
  const kids = [...body.children];
  if (!kids.length || kids.some((k) => k.classList && (k.classList.contains('card') || k.classList.contains('stats') || k.classList.contains('dgrid')))) return;
  const out = [];
  let card = null;
  let leading = true;
  const newCard = () => { card = h('section', { class: 'card' }); out.push(card); return card; };
  kids.forEach((k) => {
    if (k.tagName === 'H2') { newCard().append(k); leading = false; return; }
    if (leading && (k.tagName === 'P' || (k.classList && k.classList.contains('alert')))) { k.classList.add('lead'); out.push(k); return; }
    leading = false;
    (card || newCard()).append(k);
  });
  body.replaceChildren(...out);
}

function updateBanner() {
  const b = $('#banner');
  b.hidden = !state.callerId;
  b.textContent = state.callerId ? T(`Impersonation active : les requêtes s'exécutent en tant que ${state.callerName || state.callerId}.`) : '';
}

const ttl = (id) => I18N.tab(id, 'title', TITLES[id]);
const dsc = (id) => I18N.tab(id, 'desc', DESC[id]);
let current = null;

async function show(name) {
  current = name;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  location.hash = name;
  const view = $('#view');
  const group = (GROUPS.find(([, ks]) => ks.includes(name)) || [''])[0];
  view.replaceChildren(
    h('div', { class: 'pagehead' }, h('h1', {}, ttl(name)), h('div', { class: 'crumbs' }, 'Xrmkit', h('span', {}, '›'), group === 'Menu' ? ttl(name) : [group, h('span', {}, '›'), ttl(name)])),
    dsc(name) ? h('p', { class: 'page-desc' }, dsc(name)) : null);
  const body = h('div', { class: 'tabbody' });
  view.append(body);
  try { await tabs[name](body); enhance(body); } catch (e) { body.append(h('p', { class: 'error' }, e.message)); }
  document.querySelector('main').scrollTop = 0;
}

function buildNav() {
  const nav = $('#nav');
  nav.replaceChildren();
  const known = new Set();
  const add = (k) => { known.add(k); nav.append(h('button', { 'data-tab': k, class: k === current ? 'active' : '', onclick: () => show(k) }, navIcon(ICONS[k]), h('span', { class: 'lbl' }, ttl(k)))); };
  GROUPS.forEach(([title, keys]) => {
    const ks = keys.filter((k) => TITLES[k] && tabs[k]);
    if (!ks.length) return;
    nav.append(h('div', { class: 'navgroup' }, title));
    ks.forEach(add);
  });
  Object.keys(TITLES).filter((k) => !known.has(k) && tabs[k]).forEach(add);
}

// ---- Barre du haut : langue, thème, notifications, utilisateur ----
function navIcon(v) { const s = h('span', { class: 'ico' }); if (typeof XI !== 'undefined' && XI[v]) s.innerHTML = xicon(v); else s.textContent = v || '•'; return s; }
function applyTheme(t) { document.documentElement.dataset.theme = t; const b = $('#themeBtn'); if (b) { b.innerHTML = xicon(t === 'dark' ? 'sun' : 'moon'); b.title = T(t === 'dark' ? 'Mode clair' : 'Mode sombre'); } }

function renderTopbar() {
  const l = I18N.langs[I18N.lang];
  const lb = $('#langBtn'); lb.replaceChildren(h('span', { class: 'flag' }, l.flag), I18N.lang.toUpperCase()); lb.title = T('Langue');
  $('#navsearch').placeholder = T('Rechercher un outil…  ( / )');
  xicon.mount();
  $('#bellBtn').title = T('Notifications');
  $('#menubtn').title = T('Réduire le menu');
  $('#themeBtn').title = T(document.documentElement.dataset.theme === 'dark' ? 'Mode clair' : 'Mode sombre');
  document.querySelectorAll('.credit .by-l').forEach((e) => { e.textContent = T('Développé par'); });
}

async function refreshBell() {
  try {
    const errs = await call('recentErrors');
    const n = $('#bellN'); n.textContent = String(errs.length); n.hidden = !errs.length;
    $('#bellBtn').dataset.errors = JSON.stringify(errs.slice(-30));
  } catch (e) { /* page sans Xrm */ }
}

async function refreshUserChip() {
  const box = $('#userChip');
  try {
    const u = await currentUser();
    box.replaceChildren(h('span', { class: 'avatar' }, u.initials), h('span', { class: 'uname' }, u.name), h('span', { class: 'caret' }, '▾'));
    box.dataset.ready = '1';
  } catch (e) { box.replaceChildren(h('span', { class: 'avatar' }, '?')); }
}

function toggleUserMenu() {
  const old = $('#userMenu'); if (old) { old.remove(); return; }
  if (!_user) return;
  const u = _user;
  const org = state.orgInfo && state.orgInfo.org;
  const m = h('div', { id: 'userMenu', class: 'popmenu' },
    h('div', { class: 'usercard' }, h('span', { class: 'avatar big' }, u.initials), h('div', { class: 'u-name' }, u.name), u.email ? h('div', { class: 'muted' }, u.email) : null, org ? h('div', { class: 'muted' }, org) : null),
    u.bu ? h('div', { class: 'pm-row' }, h('span', {}, 'Unité commerciale'), u.bu) : null,
    h('div', { class: 'pm-row' }, h('span', {}, 'Rôles'), u.roles.length ? u.roles.slice(0, 6).join(', ') + (u.roles.length > 6 ? ` +${u.roles.length - 6}` : '') : '—'));
  $('#userChip').after(m);
  setTimeout(() => document.addEventListener('click', function close(e) { if (!m.contains(e.target) && e.target.closest('#userChip') == null) { m.remove(); document.removeEventListener('click', close); } }), 0);
}

async function setLanguage(lang) {
  await I18N.set(lang);
  renderTopbar(); buildNav(); updateBanner();
  if (current) show(current);
}

(async () => {
  await I18N.init();
  const nav = $('#nav');
  let theme = 'light';
  try { const st0 = await chrome.storage.local.get('theme'); theme = st0.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) { /* ignore */ }
  applyTheme(theme);
  buildNav();
  renderTopbar();

  const closeNav = () => document.body.classList.remove('nav-open');
  $('#menubtn').addEventListener('click', () => { if (matchMedia('(max-width: 900px)').matches) document.body.classList.toggle('nav-open'); else document.body.classList.toggle('nav-collapsed'); });
  $('#scrim').addEventListener('click', closeNav);
  nav.addEventListener('click', (e) => { if (e.target.closest('button')) closeNav(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });
  $('#langBtn').addEventListener('click', () => setLanguage(I18N.lang === 'fr' ? 'en' : 'fr'));
  $('#themeBtn').addEventListener('click', async () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; applyTheme(t); try { await chrome.storage.local.set({ theme: t }); } catch (e) { /* ignore */ } });
  $('#bellBtn').addEventListener('click', () => {
    let errs = []; try { errs = JSON.parse($('#bellBtn').dataset.errors || '[]'); } catch (e) { /* ignore */ }
    if (!errs.length) { toast(T('Aucune erreur JavaScript récente sur la page.')); return; }
    showText(T('Erreurs JavaScript récentes'), errs.map((x) => `${x.date}  ${x.message}`).join('\n'));
  });
  $('#userChip').addEventListener('click', toggleUserMenu);
  const search = $('#navsearch');
  search.addEventListener('input', () => {
    const t = search.value.trim().toLowerCase();
    nav.querySelectorAll('button').forEach((b) => { b.hidden = !!t && !b.textContent.toLowerCase().includes(t); });
    nav.querySelectorAll('.navgroup').forEach((g) => { let n = g.nextElementSibling, any = false; while (n && !n.classList.contains('navgroup')) { if (!n.hidden) any = true; n = n.nextElementSibling; } g.hidden = !any; });
  });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); search.focus(); } });

  const st = await chrome.storage.local.get(['callerId', 'callerName']);
  state.callerId = st.callerId || null;
  state.callerName = st.callerName || null;
  updateBanner();
  try {
    state.orgInfo = await call('ping');
    $('#org').textContent = state.orgInfo.org || 'Dynamics 365';
  } catch (e) {
    $('#org').textContent = T('Non connecté');
    $('#view').append(h('p', { class: 'error' }, e.message));
    return;
  }
  const start = location.hash.slice(1);
  show(TITLES[start] && tabs[start] ? start : 'home');
  refreshUserChip();
  refreshBell();
})();
