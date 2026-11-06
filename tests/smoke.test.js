'use strict';
// Smoke test of the Workbench UI in jsdom with a fake Dynamics backend: the page loads, the main tabs render, the new reports work
// end to end (including importing a compressed Word template and generating a report from it) and the English interface is translated.
// It cannot tell you whether real environments answer the same way; see "Known limitations" in the README.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { zipDeflate } = require('./helpers/zip.js');

const WB = path.join(__dirname, '..', 'workbench') + path.sep;
const lbl = (x) => ({ UserLocalizedLabel: { Label: x } });
const FV = '@OData.Community.Display.V1.FormattedValue';
const flow = (msg, ent, writes) => JSON.stringify({ properties: { definition: { triggers: { t: { inputs: { host: { operationId: 'SubscribeWebhookTrigger' }, parameters: { 'subscriptionRequest/message': msg, 'subscriptionRequest/entityname': ent } } } },
  actions: Object.fromEntries(writes.map(([set, f], i) => ['A' + i, { type: 'OpenApiConnection', inputs: { host: { operationId: 'UpdateRecord' }, parameters: { entityName: set, ...Object.fromEntries(f.map((x) => ['item/' + x, 'v'])) } } }])) } } });

function backend(p) {
  const col = (value) => ({ isCollection: true, value }), one = (data) => ({ isCollection: false, value: [], data });
  if (p.startsWith('EntityDefinitions?')) return col([['account', 'accounts', false], ['contact', 'contacts', false], ['new_x', 'new_xs', true]].map(([n, s, c]) => ({ LogicalName: n, EntitySetName: s, DisplayName: lbl(n), IsCustomEntity: c })));
  if (p.startsWith('sdkmessageprocessingsteps')) return col([{ sdkmessageprocessingstepid: 's1', name: 'PlugA: Update of account', stage: 20, mode: 0, rank: 1, statecode: 0, filteringattributes: '', ismanaged: false, ['_sdkmessagefilterid_value' + FV]: 'Update of account' }]);
  if (p.includes('category eq 5')) return col([{ workflowid: 'w1', name: 'Account flow', statecode: 1, clientdata: flow(3, 'account', [['contacts', ['telephone1']]]), ismanaged: false }, { workflowid: 'w2', name: 'Contact flow', statecode: 1, clientdata: flow(3, 'contact', [['accounts', ['name']]]), ismanaged: false }]);
  if (p.startsWith('workflows')) return col([{ workflowid: 'w3', name: 'Account rule', category: 2, primaryentity: 'account', statecode: 1, ismanaged: false }]);
  if (p.startsWith('systemusers?')) return col([{ fullname: 'Jean Dupont', domainname: 'jd@example.com', systemuserid: '11111111-1111-1111-1111-111111111111' }]);
  if (/^systemusers\(.*\)\?/.test(p)) return one({ fullname: 'Jean Dupont', internalemailaddress: 'jd@example.com', jobtitle: 'Sales', isdisabled: false, businessunitid: { name: 'Root' } });
  if (p.includes('systemuserroles_association')) return col([{ name: 'System Administrator', roleid: 'r1' }]);
  if (p.includes('teammembership_association')) return col([{ name: 'Team A', teamid: 't1', teamtype: 0 }]);
  if (p.includes('teamroles_association')) return col([{ name: 'Manager', roleid: 'r2' }]);
  if (p.includes('RetrieveUserPrivileges')) return one({ RolePrivileges: [{ PrivilegeName: 'prvReadAccount', Depth: 'Global' }, { PrivilegeName: 'prvDeleteAccount', Depth: 'Global' }, { PrivilegeName: 'prvWritecontact', Depth: 'Local' }, { PrivilegeName: 'prvActOnBehalfOfAnotherUser', Depth: 'Global' }] });
  return col([]);
}

test('workbench: tabs render, reports generate, English UI is translated', async () => {
  const errors = [], downloads = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message)); vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = await JSDOM.fromFile(WB + 'workbench.html', {
    url: 'file://' + WB + 'workbench.html?tabId=1#pmap', runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
      const store = {};
      w.chrome = {
        runtime: { lastError: null, getURL: (x) => x },
        storage: { local: { async get(k) { const o = {}; [].concat(typeof k === 'string' ? k : Array.isArray(k) ? k : Object.keys(k || {})).forEach((x) => { if (x in store) o[x] = store[x]; }); return o; }, async set(o) { Object.assign(store, o); } } },
        tabs: { query: async () => [], sendMessage(id, msg, cb) { setTimeout(() => {
          const { action, payload } = msg;
          if (action === 'ping') return cb({ ok: true, data: { org: 'DEV', url: 'https://dev.crm.dynamics.com' } });
          if (action === 'webapi') { try { return cb({ ok: true, data: backend(payload.path) }); } catch (e) { return cb({ ok: false, error: e.message }); } }
          return cb({ ok: true, data: null });
        }, 0); } },
      };
      // what Chrome provides and jsdom does not
      w.DecompressionStream = DecompressionStream; w.Response = Response; w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder;
      w.URL.createObjectURL = (b) => { downloads.push(b); return 'blob:x'; }; w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () { downloads.push({ name: this.download }); };
      w.Blob.prototype.arrayBuffer = function () { return new Promise((res, rej) => { const fr = new w.FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsArrayBuffer(this); }); };
      w.navigator.clipboard = { writeText: async () => {} };
    },
  });
  const w = dom.window, d = w.document;
  const until = async (fn, label, ms = 8000) => { const t0 = Date.now(); for (;;) { try { const v = fn(); if (v) return v; } catch (e) { /* retry */ } if (Date.now() - t0 > ms) throw new Error('timeout: ' + label + '\n' + errors.join('\n')); await new Promise((r) => setTimeout(r, 25)); } };
  const button = (txt) => [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === txt);
  const goTo = (name) => [...d.querySelectorAll('#nav button')].find((b) => b.textContent.includes(name)).click();

  await until(() => d.querySelector('#view .toolbar'), 'process map tab');
  assert.match(d.querySelector('#nav').textContent, /Cartographie des processus/);
  assert.match(d.querySelector('#nav').textContent, /Rapport d'accès utilisateur/);

  // process map
  const entity = await until(() => d.querySelector('#view input[list="dk-entities"]'), 'table input');
  entity.value = 'account'; button('Analyser').click();
  await until(() => d.querySelector('#view svg'), 'process map diagram');
  const view = d.querySelector('#view').textContent;
  assert.match(view, /PlugA/); assert.match(view, /Account flow/); assert.match(view, /Account rule/);
  assert.match(view, /Boucle possible/, 'account -> contact -> account loop is reported');

  // Word template: import a compressed template, generate a report, check the content
  const template = zipDeflate([
    { name: '[Content_Types].xml', data: '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: 'word/document.xml', data: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Process map of {</w:t></w:r><w:r><w:t>{table}} on {{date}}</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>{{#automatisations}}{{nom}}{{/automatisations}}</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>' },
  ]);
  const fileInput = d.querySelector('#view input[type=file]');
  Object.defineProperty(fileInput, 'files', { value: [new w.File([template], 'my-template.docx')], configurable: true });
  fileInput.dispatchEvent(new w.Event('change'));
  await until(() => /Modèle « my-template\.docx »|invalide|corrompue/.test(d.querySelector('#view .tpl-panel').textContent), 'template import');
  assert.match(d.querySelector('#view .tpl-panel').textContent, /Modèle « my-template\.docx » importé/);
  d.querySelector('#view .tpl-panel select').value = 'my-template.docx';
  downloads.length = 0; button('Générer le rapport').click();
  await until(() => downloads.some((x) => x instanceof w.Blob), 'report generation');
  const bytes = await new Promise((res) => { const fr = new w.FileReader(); fr.onload = () => res(new Uint8Array(fr.result)); fr.readAsArrayBuffer(downloads.find((x) => x instanceof w.Blob)); });
  const files = await w.Office.unzip(bytes);
  const xml = new TextDecoder().decode(files.find((f) => f.name === 'word/document.xml').data).replace(/<[^>]+>/g, ' ');
  assert.match(xml, /Process map of account/); assert.match(xml, /PlugA/); assert.match(xml, /Account flow/); assert.ok(!/\{\{/.test(xml));

  // access report
  goTo("Rapport d'accès utilisateur");
  await until(() => button('Chercher'), 'access tab'); button('Chercher').click();
  (await until(() => [...d.querySelectorAll('#view tr.clickable')].find((tr) => /Jean Dupont/.test(tr.textContent)), 'user list')).click();
  await until(() => /Droits par table/.test(d.querySelector('#view').textContent), 'access report');
  const access = d.querySelector('#view').textContent;
  assert.match(access, /System Administrator/); assert.match(access, /Team A/); assert.match(access, /Manager/); assert.match(access, /usurpation/);

  // data dictionary has the template panel
  goTo('Dictionnaire de données');
  await until(() => d.querySelector('#view .tpl-panel'), 'dictionary template panel');

  // English interface: attention points and counters are translated (regression: prefixes used to break the patterns)
  d.querySelector('#langBtn').click();
  await until(() => /Process map/.test(d.querySelector('#nav').textContent) && /User access report/.test(d.querySelector('#nav').textContent), 'English navigation');
  goTo('User access report');
  await until(() => button('Search'), 'English access tab'); button('Search').click();
  (await until(() => [...d.querySelectorAll('#view tr.clickable')].find((tr) => /Jean Dupont/.test(tr.textContent)), 'user list EN')).click();
  await until(() => /Rights by table/.test(d.querySelector('#view').textContent), 'English access report');
  const en = d.querySelector('#view').textContent;
  assert.match(en, /Sensitive right: Act on behalf of another user/);
  assert.match(en, /row\(s\)/);
  assert.ok(!/ligne\(s\)/.test(en), 'row counter is translated');

  assert.deepEqual(errors, [], 'no JavaScript error was raised');
  w.close();
});
