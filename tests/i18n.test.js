'use strict';
// Guards the English interface: every tab is opened in English (jsdom, empty fake backend) and no French text may remain on screen.
// Template tag examples such as {{champ}} are intentionally French (they are the real tag names) and are allowed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const WB = path.join(__dirname, '..', 'workbench') + path.sep;
const FRENCH = /[éèêàùçôîâû]|\b(le|la|les|des|pour|une|un|du|et|ou|avec|sans|sur|dans|ce|cette|vos|votre|aucun|aucune|choisir|saisir|ouvrir|exécuter|générer|rechercher|charger|afficher|nom|champ|valeur|erreur|requête|requêtes)\b/i;
const ALLOWED = /^\{\{[a-z_#/]+\}\}$/;

test('default language follows the browser, and an explicit choice wins', async () => {
  const load = (language, stored) => {
    const ctx = { navigator: { language }, chrome: { storage: { local: { get: async () => (stored ? { lang: stored } : {}), set: async () => {} } } }, document: { documentElement: {} }, console };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(WB + 'i18n.js', 'utf8') + ';this.I=I18N', ctx);
    return ctx.I;
  };
  let i = load('fr-FR'); await i.init(); assert.equal(i.lang, 'fr');
  i = load('en-US'); await i.init(); assert.equal(i.lang, 'en');
  i = load('de-DE'); await i.init(); assert.equal(i.lang, 'en');
  i = load('en-US', 'fr'); await i.init(); assert.equal(i.lang, 'fr', 'a saved choice wins over the browser language');
});

test('English interface: no French text left on any tab', async () => {
  const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message));
  const dom = await JSDOM.fromFile(WB + 'workbench.html', {
    url: 'file://' + WB + 'workbench.html?tabId=1', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      const store = { lang: 'en' };
      w.chrome = {
        runtime: { lastError: null, getURL: (x) => x },
        storage: { local: { async get(k) { const o = {}; [].concat(typeof k === 'string' ? k : Array.isArray(k) ? k : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = store[x]; }); return o; }, async set(o) { Object.assign(store, o); }, async remove() {} } },
        tabs: { query: async () => [], sendMessage(id, msg, cb) { setTimeout(() => {
          if (msg.action === 'ping') return cb({ ok: true, data: { org: 'DEV', url: 'https://dev.crm.dynamics.com' } });
          if (msg.action === 'webapi') return cb({ ok: true, data: { isCollection: true, value: [], data: null } });
          return cb({ ok: true, data: null });
        }, 0); } },
      };
      w.DecompressionStream = DecompressionStream; w.Response = Response; w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder;
      w.navigator.clipboard = { writeText: async () => {} };
    },
  });
  const w = dom.window, d = w.document, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(1000);
  const leftovers = [];
  const scan = (root, label) => {
    const walker = d.createTreeWalker(root, w.NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement && /^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue;
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (t.length > 2 && FRENCH.test(t) && !ALLOWED.test(t)) leftovers.push(`${label}: ${t.slice(0, 120)}`);
    }
    root.querySelectorAll('[placeholder],[title]').forEach((e) => { for (const a of ['placeholder', 'title']) { const t = (e.getAttribute(a) || '').trim(); if (t.length > 2 && FRENCH.test(t) && !ALLOWED.test(t)) leftovers.push(`${label} [${a}]: ${t.slice(0, 100)}`); } });
  };
  const buttons = [...d.querySelectorAll('#nav button')];
  assert.ok(buttons.length >= 25, 'the menu lists the tools');
  for (const b of buttons) { b.click(); await sleep(450); scan(d.querySelector('#view'), b.textContent.trim()); }
  scan(d.querySelector('#nav'), 'menu');
  assert.deepEqual(leftovers, [], 'French text shown in the English interface');
  assert.deepEqual(errors, []);
  w.close();
});
