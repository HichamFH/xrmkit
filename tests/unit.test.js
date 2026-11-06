'use strict';
// Unit tests for the pure modules (no browser, no network): Word template engine, access and cascade logic, report specs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { zipDeflate } = require('./helpers/zip.js');

const W = path.join(__dirname, '..', 'workbench');
const Office = require(path.join(W, 'office.js'));
const DK = require(path.join(W, 'logic.js'));
const dec = new TextDecoder();
const partText = async (bytes, name = 'word/document.xml') => dec.decode((await Office.unzip(bytes)).find((f) => f.name === name).data);
const plain = (xml) => xml.replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '');

// ---------------------------------------------------------------- Word template engine
test('template: values, row loops, nested loops, conditions, escaping', async () => {
  const tpl = Office.docxBytes([
    { t: 'title', text: 'Report {{env}}' },
    { t: 'p', text: 'Alert: {{#alert}}WARNING {{alert}}{{/alert}}' },
    { t: 'table', header: ['Name', 'Type'], rows: [['{{#cols}}{{name}}', '{{type}}{{/cols}}']] },
    { t: 'p', text: '{{#groups}}' }, { t: 'h2', text: 'Group {{name}}' }, { t: 'p', text: '{{#members}}- {{n}}{{/members}}' }, { t: 'p', text: '{{/groups}}' },
    { t: 'p', text: 'Unknown: {{nope}} Trap: {{trap}}' },
  ]);
  const found = await Office.docxTags(tpl);
  assert.deepEqual(found.loops.sort(), ['alert', 'cols', 'groups', 'members']);
  const r = await Office.fillDocx(tpl, { env: 'DEV & <test>', alert: '', cols: [{ name: 'a', type: 'String' }, { name: 'b', type: 'Lookup' }], groups: [{ name: 'G1', members: [{ n: 'x' }, { n: 'y' }] }, { name: 'G2', members: [] }], trap: '{{env}}' });
  const xml = await partText(r.bytes);
  assert.ok(xml.includes('DEV &amp; &lt;test&gt;'), 'values are XML-escaped');
  assert.ok(!xml.includes('WARNING'), 'a falsy value hides its block');
  assert.equal((xml.match(/<w:tr>/g) || []).length, 3, 'header + one row per item');
  assert.ok(xml.includes('Group G1') && xml.includes('Group G2'));
  assert.ok(!/\{\{/.test(xml), 'no raw tag left, and data cannot inject tags');
  assert.deepEqual(r.missing, ['nope']);
});

test('template: reads a compressed archive, joins tags split across runs, handles headers and keeps binaries', async () => {
  const doc = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Client: {</w:t></w:r><w:proofErr w:type="spellStart"/><w:r><w:t>{client_</w:t></w:r><w:r><w:rPr><w:i/></w:rPr><w:t>name}</w:t></w:r><w:r><w:t>} end</w:t></w:r></w:p>'
    + '<w:p><w:r><w:t>{{#items}}</w:t></w:r></w:p><w:p><w:r><w:t>Item </w:t></w:r><w:r><w:t>{{la</w:t></w:r><w:r><w:t>bel}}</w:t></w:r></w:p><w:p><w:r><w:t>{{/items}}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>';
  const header = '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Header {{client_name}}</w:t></w:r></w:p></w:hdr>';
  const ct = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"/></Types>';
  const image = Buffer.from(Array.from({ length: 4000 }, (_, i) => i % 251));
  const archive = zipDeflate([{ name: '[Content_Types].xml', data: ct }, { name: 'word/document.xml', data: doc }, { name: 'word/header1.xml', data: header }, { name: 'word/media/image1.png', data: image }]);
  const r = await Office.fillDocx(archive, { client_name: 'ACME', items: [{ label: 'one' }, { label: 'two' }] });
  const files = await Office.unzip(r.bytes);
  const text = plain(dec.decode(files.find((f) => f.name === 'word/document.xml').data));
  assert.match(text, /Client: ACME end/);
  assert.match(text, /Item one/);
  assert.match(text, /Item two/);
  assert.match(dec.decode(files.find((f) => f.name === 'word/header1.xml').data), /Header ACME/);
  assert.ok(dec.decode(files.find((f) => f.name === '[Content_Types].xml').data).includes('document.main+xml'), '.dotx is turned into a regular document');
  assert.deepEqual(Buffer.from(files.find((f) => f.name === 'word/media/image1.png').data), image, 'binary parts are untouched');
  assert.deepEqual(r.missing, []);
});

test('template: rejects files that are not archives or not Word documents', async () => {
  await assert.rejects(() => Office.unzip(new Uint8Array([1, 2, 3])), /archive/i);
  const notWord = zipDeflate([{ name: 'hello.txt', data: 'hi' }]);
  await assert.rejects(() => Office.fillDocx(notWord, {}), /document Word/i);
});

// ---------------------------------------------------------------- access rights
test('privileges: parsing, depth and matrix keep the highest level', () => {
  assert.deepEqual(DK.parsePrivilege('prvAppendToAccount'), { verb: 'AppendTo', entity: 'account' });
  assert.deepEqual(DK.parsePrivilege('prvAppendAccount'), { verb: 'Append', entity: 'account' });
  assert.deepEqual(DK.parsePrivilege('prvReadnew_Ma_Table'), { verb: 'Read', entity: 'new_ma_table' });
  assert.equal(DK.parsePrivilege('prvActOnBehalfOfAnotherUser'), null);
  assert.equal(DK.depthRank('Global'), 3);
  assert.equal(DK.depthRank(1), 1);
  assert.equal(DK.depthRank('?'), -1);
  const m = DK.accessMatrix([
    { PrivilegeName: 'prvReadAccount', Depth: 'Basic' }, { PrivilegeName: 'prvReadAccount', Depth: 'Global' },
    { PrivilegeName: 'prvDeleteAccount', Depth: 'Global' }, { PrivilegeName: 'prvReadContact', Depth: 'Local' },
    { PrivilegeName: 'prvActOnBehalfOfAnotherUser', Depth: 'Global' }, { PrivilegeName: 'prvReadsomething_unknown', Depth: 'Basic' },
  ], ['account', 'contact']);
  assert.equal(m.rows.find((r) => r.table === 'account').Read, 3);
  assert.equal(m.rows.length, 2);
  assert.equal(m.other.length, 2);
  const findings = DK.accessFindings(m, ['System Administrator']).map((f) => f[1]);
  assert.ok(findings.some((t) => /Administrateur système/.test(t)));
  assert.ok(findings.some((t) => /usurpation/.test(t)));
  assert.ok(findings.some((t) => /Suppression/.test(t)));
});

// ---------------------------------------------------------------- flows and cascades
const flowDef = (trigger, actions) => JSON.stringify({ properties: { definition: { triggers: { t: { inputs: { host: { operationId: 'SubscribeWebhookTrigger' }, parameters: trigger } } }, actions } } });
const act = (op, set, fields = {}) => ({ type: 'OpenApiConnection', inputs: { host: { operationId: op }, parameters: { entityName: set, ...fields } } });

test('flows: trigger, filters, nested writes, reads and child flows are extracted', () => {
  const g = DK.flowGraph(flowDef(
    { 'subscriptionRequest/message': 4, 'subscriptionRequest/entityname': 'account', 'subscriptionRequest/filteringattributes': 'name,revenue' },
    { Cond: { type: 'If', actions: { Update: act('UpdateRecord', 'contacts', { 'item/telephone1': 'x', 'item/parentcustomerid_account@odata.bind': '/accounts(1)' }) }, else: { actions: { Create: act('CreateRecord', 'tasks') } } }, Read: act('ListRecords', 'leads'), Child: { type: 'Workflow', inputs: { host: { workflowReferenceName: 'abc' } } } },
  ), { contacts: 'contact', tasks: 'task' });
  assert.deepEqual(g.trigger.events, ['Create', 'Update']);
  assert.deepEqual(g.trigger.filter, ['name', 'revenue']);
  assert.equal(g.writes.length, 2);
  assert.equal(g.writes[0].entity, 'contact');
  assert.deepEqual(g.reads.map((r) => r.entity), ['leads']);
  assert.deepEqual(g.children, ['abc']);
  assert.equal(DK.flowGraph('{not json').trigger.text, '');
});

test('cascade: respects attribute filters, ignores disabled items, detects loops and caps expansion', () => {
  const items = [
    { id: 'f1', kind: 'Flux', name: 'Account flow', active: true, triggers: [{ entity: 'account', events: ['Create', 'Update'], filter: ['name'] }], writes: [{ entity: 'contact', event: 'Update', fields: ['telephone1'], action: 'Update' }] },
    { id: 'p1', kind: 'Plug-in', name: 'Phone plug-in', active: true, sync: true, triggers: [{ entity: 'contact', events: ['Update'], filter: ['telephone1'] }], writes: [] },
    { id: 'p2', kind: 'Plug-in', name: 'Email plug-in', active: true, sync: true, triggers: [{ entity: 'contact', events: ['Update'], filter: ['emailaddress1'] }], writes: [] },
    { id: 'f2', kind: 'Flux', name: 'Contact flow', active: true, triggers: [{ entity: 'contact', events: ['Update'], filter: [] }], writes: [{ entity: 'account', event: 'Update', fields: ['name'], action: 'Update account' }] },
    { id: 'off', kind: 'Flux', name: 'Disabled flow', active: false, triggers: [{ entity: 'account', events: ['Update'], filter: [] }], writes: [] },
  ];
  const tree = DK.cascade(items, 'account', 'Update');
  const flat = DK.flattenCascade(tree);
  assert.ok(flat.some((n) => n.item.id === 'p1'));
  assert.ok(!flat.some((n) => n.item.id === 'p2'), 'filtered out: the written column is not the plug-in filter');
  assert.ok(!flat.some((n) => n.item.id === 'off'));
  assert.ok(flat.some((n) => n.loop), 'account flow -> contact flow -> account flow');
  assert.ok(DK.processFindings(items, 'account', flat).some((f) => /Boucle possible/.test(f[1])));
  assert.match(DK.mermaid(tree, 'Update account'), /^flowchart LR/);

  const many = Array.from({ length: 50 }, (_, i) => ({ id: 'i' + i, kind: 'Flux', name: 'n' + i, triggers: [{ entity: 'x', events: ['Update'], filter: [] }], writes: [{ entity: 'x', event: 'Update', fields: [] }] }));
  const big = DK.cascade(many, 'x', 'Update');
  assert.equal(DK.flattenCascade(big).length, 400);
  assert.equal(big.truncated, true);
});

// ---------------------------------------------------------------- report specs and starter templates
test('reports: every spec produces a starter template that round-trips through the engine', async () => {
  const ctx = { Office, console, h: () => ({}), dataTable: () => ({}), toast() {}, saveBlob() {}, stamp: () => 'x', confirmBox() {}, navigator: {}, chrome: {}, Xrmkit: { registerTab() {} }, TITLES: {}, DK, orgName: () => 'x', label: (l) => l || '', yesNo: (v) => v, DOMParser: class {}, document: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(W, 'reports.js'), 'utf8') + ';this.Reports=Reports;', ctx);
  vm.runInContext(fs.readFileSync(path.join(W, 'tabs-map.js'), 'utf8') + ';this.A=PMAP_SPEC', ctx);
  vm.runInContext(fs.readFileSync(path.join(W, 'tabs-access.js'), 'utf8') + ';this.B=ACCESS_SPEC', ctx);
  for (const spec of [ctx.A, ctx.B]) {
    const bytes = Office.docxBytes(ctx.Reports.sampleBlocks(spec));
    const tags = new Set((await Office.docxTags(bytes)).vars.concat((await Office.docxTags(bytes)).loops));
    spec.vars.forEach(([t]) => assert.ok(tags.has(t), `value tag ${t} is in the starter template`));
    spec.lists.forEach((l) => { assert.ok(tags.has(l.name), `loop ${l.name}`); l.fields.forEach(([t]) => assert.ok(tags.has(t), `field ${t}`)); });
  }
});
