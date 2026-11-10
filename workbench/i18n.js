'use strict';
// Internationalisation : le français est la langue source ; les dictionnaires (i18n-en.js, …) mappent
// « texte français exact » → traduction. h() (workbench.js) traduit automatiquement textes et attributs.
// Extensible : I18N.add('de', { 'Fermer': 'Schließen' }) ou I18N.addPatterns('en', [[/regex/, (m) => '…']]).
const I18N = {
  lang: 'fr',
  langs: { fr: { label: 'Français', flag: '🇫🇷' }, en: { label: 'English', flag: '🇬🇧' } },
  dict: {}, patterns: {}, tabs: {},
  add(lang, entries) { this.dict[lang] = Object.assign(this.dict[lang] || {}, entries); },
  addPatterns(lang, list) { this.patterns[lang] = (this.patterns[lang] || []).concat(list); },
  addTabs(lang, { title = {}, desc = {} }) { const t = this.tabs[lang] ||= { title: {}, desc: {} }; Object.assign(t.title, title); Object.assign(t.desc, desc); },
  t(s) {
    if (this.lang === 'fr' || typeof s !== 'string' || s.length < 2) return s;
    const d = this.dict[this.lang];
    if (d && Object.prototype.hasOwnProperty.call(d, s)) return d[s];
    for (const [re, fn] of (this.patterns[this.lang] || [])) { const m = re.exec(s); if (m) return fn(m); }
    return s;
  },
  tab(id, kind, fallback) { const t = this.tabs[this.lang]; return (t && t[kind][id]) || fallback; },
  async init() {
    // Sans choix enregistré : la langue du navigateur (français pour fr*, anglais sinon).
    this.lang = /^fr\b/i.test((typeof navigator !== 'undefined' && navigator.language) || '') ? 'fr' : 'en';
    try { const st = await chrome.storage.local.get('lang'); if (st.lang && this.langs[st.lang]) this.lang = st.lang; } catch (e) { /* ignore */ }
    document.documentElement.lang = this.lang;
  },
  async set(lang) {
    if (!this.langs[lang]) return;
    this.lang = lang; document.documentElement.lang = lang;
    try { await chrome.storage.local.set({ lang }); } catch (e) { /* ignore */ }
  },
};
const T = (s) => I18N.t(s);
